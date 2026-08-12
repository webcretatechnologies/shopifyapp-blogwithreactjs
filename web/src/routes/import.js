import express from "express";
import { PrismaClient } from "@prisma/client";
import shopify from "../../shopify.js";
import { getArticleLimit } from "../services/PlanFeatureService.js";
import { ArticleSyncService } from "../services/ArticleSyncService.js";
import { ShopifyArticleParser } from "../services/ShopifyArticleParser.js";

const router = express.Router();
const prisma = new PrismaClient();

async function getShopFromSession(res) {
  const session = res.locals.shopify?.session;
  if (!session) return null;
  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  return shop;
}

function generateSlug(title) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim() +
    "-" +
    Date.now()
  );
}

// GET /api/import/blogs
router.get("/blogs", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const client = new shopify.api.clients.Graphql({ session });
    const result = await client.request(`
      query ListBlogs($first: Int!) {
        blogs(first: $first) {
          nodes { id title handle }
        }
      }
    `, { variables: { first: 250 } });
    const blogs = result.data?.blogs?.nodes || [];

    res.json({
      blogs: blogs.map((b) => ({
        id: ArticleSyncService.numericIdFromGid(b.id),
        title: b.title,
        handle: b.handle,
      })),
    });
  } catch (err) {
    console.error("GET /api/import/blogs error:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/import/articles?blog_id=xxx
router.get("/articles", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    
    const { blog_id } = req.query;
    if (!blog_id) return res.status(400).json({ error: "blog_id is required" });

    // Follows pageInfo.hasNextPage/endCursor rather than a single first:250 call — a single page
    // was silently truncating any blog with more than 250 articles. Same cursor-loop pattern
    // already used in sitemapIndex.js's fetchPublishedArticles. Bounded by a safety cap so a
    // pathological shop can't cause a runaway loop.
    const client = new shopify.api.clients.Graphql({ session });
    const rawArticles = [];
    let cursor = null;
    let hasNextPage = true;
    const SAFETY_CAP = 2000;

    while (hasNextPage && rawArticles.length < SAFETY_CAP) {
      const result = await client.request(`
        query GetBlogArticles($id: ID!, $first: Int!, $after: String) {
          blog(id: $id) {
            articles(first: $first, after: $after) {
              nodes {
                id
                title
                author { name }
                isPublished
                publishedAt
                image { url altText }
              }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      `, { variables: { id: ArticleSyncService.toBlogGid(blog_id), first: 250, after: cursor } });

      const connection = result.data?.blog?.articles;
      if (!connection) break;
      rawArticles.push(...connection.nodes);
      hasNextPage = connection.pageInfo?.hasNextPage;
      cursor = connection.pageInfo?.endCursor;
    }

    const articles = rawArticles.map((a) => ({
      id: ArticleSyncService.numericIdFromGid(a.id),
      title: a.title,
      author: a.author?.name || "",
      published_at: a.isPublished ? a.publishedAt : null,
      image: a.image?.url || null,
      image_alt: a.image?.altText || "",
    }));

    // Check which ones are already imported
    const importedIds = await prisma.shopifyArticle.findMany({
      where: { shopifyArticleId: { in: articles.map((a) => String(a.id)) } },
      select: { shopifyArticleId: true },
    });
    const importedSet = new Set(importedIds.map((r) => r.shopifyArticleId));

    res.json({
      articles: articles.map((a) => ({
        ...a,
        is_imported: importedSet.has(String(a.id)),
      })),
    });
  } catch (err) {
    console.error("GET /api/import/articles error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/import/execute
router.post("/execute", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    const shop = await getShopFromSession(res);
    if (!session || !shop) return res.status(401).json({ error: "Unauthorized" });

    const { blog_id, article_id } = req.body;
    if (!blog_id || !article_id) return res.status(400).json({ error: "blog_id and article_id required" });

    // ── Guard against duplicate import ─────────────────────────────────────────
    // The UI already disables the button for already-imported articles, but that's
    // client-side only — bypassable by a double-click race or a direct API call. Without this,
    // two local posts could both end up linked to the same Shopify article (now also prevented
    // at the DB level by ShopifyArticle.shopifyArticleId's unique constraint, but checking here
    // first gives a clean, actionable error instead of a raw constraint-violation 500).
    const existingLink = await prisma.shopifyArticle.findUnique({
      where: { shopifyArticleId: String(article_id) },
      select: { postId: true },
    });
    if (existingLink) {
      return res.status(409).json({
        error: "This article has already been imported.",
        post_id: existingLink.postId,
      });
    }

    // ── Enforce Plan Limits ────────────────────────────────────────────────────
    const limit = getArticleLimit(shop.planKey);
    if (limit !== null) {
      const count = await prisma.post.count({ where: { shopId: shop.id } });
      if (count >= limit) {
        return res.status(403).json({ error: `Article limit reached. Please upgrade your plan.` });
      }
    }

    // ── Fetch article from Shopify ─────────────────────────────────────────────
    const client = new shopify.api.clients.Graphql({ session });
    const shopifyArticle = await ArticleSyncService.fetchArticleByGid(client, article_id);
    if (!shopifyArticle) {
      return res.status(404).json({ error: "Article not found on Shopify" });
    }

    // ── Parse HTML → new builder block schema FIRST ────────────────────────────
    // ShopifyArticleParser converts Shopify body_html into the structured block format
    // used by the drag & drop builder ({ type: "Heading", settings: { text, level } } etc.)
    // This MUST happen before post creation so contentJson/contentHtml are correct.
    // The old hand-rolled extractBlocks produced an incompatible legacy schema
    // ({ type: "heading", data: "..." }) that the builder cannot render.
    const parsed = ShopifyArticleParser.parse(shopifyArticle.body_html || "");
    const contentJson = parsed.blocks.length > 0
      ? parsed.blocks
      : [{ id: `block_${Date.now()}_init`, type: "RichText", settings: { content: "" } }];
    // rawEditorHtml is the cleaned, stripped editor-format HTML (no analytics pixels,
    // no app wrappers). Using the raw Shopify body_html as contentHtml would pollute
    // the editor with injected tracking scripts and custom section wrappers.
    const contentHtml = parsed.rawEditorHtml || shopifyArticle.body_html || "";

    // ── Preserve the article's existing URL ────────────────────────────────────
    // pushPostToShopify pushes `handle: post.slug` on every sync (see ArticleSyncService.js's
    // toArticleGraphQLInput) — always minting a fresh slug here would silently change an
    // already-published, already-indexed article's live URL the very next time it syncs,
    // breaking backlinks/bookmarks/SEO for content that worked fine before being imported. Only
    // fall back to a generated slug if this shop somehow already has a post using that handle
    // (rare — Shopify handles are already unique per shop) or the article has no handle at all.
    let slug = shopifyArticle.handle || "";
    if (slug) {
      const existing = await prisma.post.findFirst({ where: { shopId: shop.id, slug } });
      if (existing) slug = "";
    }
    if (!slug) slug = generateSlug(shopifyArticle.title);

    // ── Create the post record ─────────────────────────────────────────────────
    const postData = {
      shopId: shop.id,
      title: shopifyArticle.title,
      slug,
      contentJson,
      contentHtml,
      status: shopifyArticle.published_at ? "published" : "draft",
      publishedAt: shopifyArticle.published_at ? new Date(shopifyArticle.published_at) : null,
      // image.src is already normalized by articleFromGraphQL (maps url → src)
      featuredImage: shopifyArticle.image?.src || null,
      author: shopifyArticle.author || null,
      metaTitle: shopifyArticle.meta_title || null,
      metaDescription: shopifyArticle.meta_description || null,
      productSliderPosition: "none",
    };

    const post = await prisma.post.create({ data: postData });

    // ── Process Tags ───────────────────────────────────────────────────────────
    if (shopifyArticle.tags) {
      const tagNames = shopifyArticle.tags.split(",").map((t) => t.trim()).filter(Boolean);
      for (const tagName of tagNames) {
        const slug = tagName.toLowerCase().replace(/\s+/g, "-");
        const tagRec = await prisma.tag.upsert({
          where: { shopId_slug: { shopId: shop.id, slug } },
          create: { shopId: shop.id, name: tagName, slug },
          update: {},
        });
        await prisma.postTag.create({ data: { postId: post.id, tagId: tagRec.id } });
      }
    }

    // ── Build sync baseline ────────────────────────────────────────────────────
    // normalizeRemoteState + buildBaselineSnapshot record what Shopify currently
    // looks like so future reconcile runs can detect which side changed.
    const remoteState = ArticleSyncService.normalizeRemoteState(shopifyArticle);
    // Augment remote state with the parsed editor representation so the baseline
    // stores both the raw Shopify HTML (storefrontHtml) and the builder's HTML.
    remoteState.content.editorHtml = contentHtml;
    remoteState.content.contentJson = contentJson;

    const initialBaseline = ArticleSyncService.buildBaselineSnapshot(
      remoteState,
      shopifyArticle.body_html || "",
      1,
    );

    // ── Link to ShopifyArticle ─────────────────────────────────────────────────
    await prisma.shopifyArticle.create({
      data: {
        postId: post.id,
        shopifyArticleId: String(shopifyArticle.id),
        // Store as bare numeric string — ArticleSyncService.pushPostToShopify
        // wraps this in toBlogGid() before any Shopify GraphQL calls.
        shopifyBlogId: String(blog_id),
        status: post.status,
        syncedAt: new Date(),
        syncState: "in_sync",
        // "managed" = app is source-of-truth. After import the merchant edits
        // in the builder, so the builder's blocks must win over Shopify's raw HTML.
        // "external_html" would treat Shopify as canonical and suppress local edits.
        syncMode: "managed",
        lastSyncDirection: "shopify_to_app",
        lastInboundHash: ArticleSyncService.computeContentHash(shopifyArticle),
        lastRemoteUpdatedAt: shopifyArticle.updated_at
          ? new Date(shopifyArticle.updated_at)
          : null,
        structureDegraded: parsed.structureDegraded,
        syncRevision: 1,
        lastSyncedSnapshot: initialBaseline,
      },
    });

    // ── Log the import event ───────────────────────────────────────────────────
    await ArticleSyncService.logSyncEvent({
      shopId: shop.id,
      postId: post.id,
      shopifyArticleId: String(shopifyArticle.id),
      direction: "shopify_to_app",
      eventType: "import",
      status: "applied",
      message: `Imported article "${shopifyArticle.title}" from Shopify blog ${blog_id} (${contentJson.length} blocks parsed, structureDegraded=${parsed.structureDegraded})`,
    });

    res.json({ success: true, post_id: post.id });
  } catch (err) {
    console.error("POST /api/import/execute error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

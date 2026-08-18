/**
 * Posts (Articles) API Routes
 * Mirrors Laravel's ArticleController functionality
 */
import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { PrismaClient } from "@prisma/client";
import JsonLdService from "../services/JsonLdService.js";
import shopify from "../../shopify.js";
import {
  getFeaturesForPlan,
  getArticleLimit,
  isFeatureEnabled,
} from "../services/PlanFeatureService.js";
import { EditorContentCompiler } from "../services/EditorContentCompiler.js";
import { ArticleSyncService } from "../services/ArticleSyncService.js";
import { ShopifyArticleParser } from "../services/ShopifyArticleParser.js";
import { getShopAnalytics, getPostAnalytics } from "../services/AnalyticsTrackingService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

const RICH_SNIPPET_TYPES = ["BlogPosting", "Article", "NewsArticle", "None"];
const prisma = new PrismaClient();

// Downgrades SEO-adjacent fields to their plan-appropriate defaults instead of rejecting the
// whole post save — these are optional fields embedded in a much larger multi-field save, so a
// locked field should silently not persist rather than destroy an otherwise-valid save (unlike
// clone/schedule/reconcile/etc., which are single-purpose action routes where a hard 403 is right).
function sanitizeSeoFields(shop, body) {
  const seoAdvanced = isFeatureEnabled(shop.planKey, "seo_advanced");
  const metaRobots = isFeatureEnabled(shop.planKey, "meta_robots");
  const richSnippets = isFeatureEnabled(shop.planKey, "rich_snippets");
  const xmlSitemap = isFeatureEnabled(shop.planKey, "xml_sitemap");
  return {
    canonicalUrl: seoAdvanced ? (body.canonicalUrl || null) : null,
    ogTitle: seoAdvanced ? (body.ogTitle || null) : null,
    ogDescription: seoAdvanced ? (body.ogDescription || null) : null,
    ogImage: seoAdvanced ? (body.ogImage || null) : null,
    metaRobotsNoindex: metaRobots ? !!body.metaRobotsNoindex : false,
    metaRobotsNofollow: metaRobots ? !!body.metaRobotsNofollow : false,
    excludeFromSitemap: xmlSitemap ? !!body.excludeFromSitemap : false,
    richSnippetType: richSnippets && RICH_SNIPPET_TYPES.includes(body.richSnippetType)
      ? body.richSnippetType
      : "BlogPosting",
  };
}

// Same downgrade posture as sanitizeSeoFields, but for PUT's partial-update semantics: a locked
// field's incoming value is ignored (existing post value wins) rather than reset to a default,
// since an update should never silently blank out a value the post already had.
function sanitizeSeoFieldsForUpdate(shop, body, post) {
  const seoAdvanced = isFeatureEnabled(shop.planKey, "seo_advanced");
  const metaRobots = isFeatureEnabled(shop.planKey, "meta_robots");
  const richSnippets = isFeatureEnabled(shop.planKey, "rich_snippets");
  const xmlSitemap = isFeatureEnabled(shop.planKey, "xml_sitemap");
  return {
    canonicalUrl: seoAdvanced && body.canonicalUrl !== undefined ? body.canonicalUrl : post.canonicalUrl,
    ogTitle: seoAdvanced && body.ogTitle !== undefined ? body.ogTitle : post.ogTitle,
    ogDescription: seoAdvanced && body.ogDescription !== undefined ? body.ogDescription : post.ogDescription,
    ogImage: seoAdvanced && body.ogImage !== undefined ? body.ogImage : post.ogImage,
    metaRobotsNoindex: metaRobots && body.metaRobotsNoindex !== undefined ? !!body.metaRobotsNoindex : post.metaRobotsNoindex,
    metaRobotsNofollow: metaRobots && body.metaRobotsNofollow !== undefined ? !!body.metaRobotsNofollow : post.metaRobotsNofollow,
    excludeFromSitemap: xmlSitemap && body.excludeFromSitemap !== undefined ? !!body.excludeFromSitemap : post.excludeFromSitemap,
    richSnippetType: richSnippets && body.richSnippetType !== undefined
      ? (RICH_SNIPPET_TYPES.includes(body.richSnippetType) ? body.richSnippetType : "BlogPosting")
      : post.richSnippetType,
  };
}

// ─── Multer (file uploads) ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: path.join(__dirname, "../../public/uploads"),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Helper: get shop from session ────────────────────────────────────────────
async function getShopFromSession(res) {
  const session = res.locals.shopify?.session;
  if (!session) return null;
  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  return shop;
}

// ─── GET /api/posts — List all posts for shop ─────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const { status, search, page = 1, per_page = 20, sortKey, sortDirection, tags, syncStatus } = req.query;
    const take = parseInt(per_page);
    const skip = (parseInt(page) - 1) * take;

    const where = {
      shopId: shop.id,
      ...(status && { status }),
      ...(search && {
        title: { contains: search },
      }),
    };

    if (tags) {
      const tagsArray = tags.split(",").map(t => t.trim()).filter(Boolean);
      if (tagsArray.length > 0) {
        where.tags = {
          some: {
            tag: {
              name: { in: tagsArray }
            }
          }
        };
      }
    }

    if (syncStatus === "synced") {
      where.shopifyArticle = { isNot: null };
    } else if (syncStatus === "not_synced") {
      where.shopifyArticle = null;
    }

    const orderBy = [];
    if (sortKey) {
      orderBy.push({ [sortKey]: sortDirection === "asc" ? "asc" : "desc" });
    } else {
      orderBy.push({ createdAt: "desc" });
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          category: true,
          tags: { include: { tag: true } },
          shopifyArticle: true,
        },
        orderBy,
        take,
        skip,
      }),
      prisma.post.count({ where }),
    ]);

    res.json({
      posts: posts.map(serializePost),
      total,
      page: parseInt(page),
      per_page: take,
      last_page: Math.ceil(total / take),
    });
  } catch (err) {
    console.error("GET /api/posts error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/preview — Compile editor content for preview ──────────────
router.post("/preview", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    let client = null;
    if (session) {
      client = new shopify.api.clients.Graphql({ session });
    }
    const { contentHtml, customCss, author, publishedAt } = req.body;
    const compiled = await EditorContentCompiler.compileForStorefront(contentHtml || "", session, client, undefined, undefined, customCss, author, publishedAt);
    res.json({ contentHtml: compiled });
  } catch (err) {
    console.error("POST /api/posts/preview error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts — Create post ────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    // Plan check: article limit
    const limit = getArticleLimit(shop.planKey);
    if (limit !== null) {
      const count = await prisma.post.count({ where: { shopId: shop.id } });
      if (count >= limit) {
        return res.status(403).json({
          error: `You've reached your plan limit of ${limit} articles. Please upgrade to add more.`,
        });
      }
    }

    const {
      title,
      slug,
      status = "draft",
      author,
      vendor,
      excerpt,
      featuredImage,
      contentJson,
      contentHtml: reqContentHtml,
      customCss,
      customJs,
      productSliderPosition = "none",
      productSliderSource = "recommendations",
      productSliderConfig,
      productSliderProducts = [],
      categoryId,
      tags = [],
      blogId,
      editorMode = "builder",
      metaTitle,
      metaDescription,
      canonicalUrl,
      ogTitle,
      ogDescription,
      ogImage,
      metaRobotsNoindex,
      metaRobotsNofollow,
      excludeFromSitemap,
      richSnippetType,
      relatedPostIds = [],
    } = req.body;

    if (!title) return res.status(422).json({ error: "Title is required" });

    const blocks = Array.isArray(contentJson) ? contentJson : [];
    
    // Compile content html
    const session = res.locals.shopify?.session;
    let client = null;
    if (session) {
      client = new shopify.api.clients.Graphql({ session });
    }
    const finalContentHtml = await EditorContentCompiler.compile(
      reqContentHtml || "",
      session,
      client,
      shop.planKey
    );

    const post = await prisma.post.create({
      data: {
        shopId: shop.id,
        title,
        slug: slug || generateSlug(title),
        status,
        author: author || null,
        vendor: vendor || null,
        excerpt: excerpt || null,
        featuredImage: featuredImage || null,
        contentJson: blocks,
        contentHtml: finalContentHtml,
        // custom_css is a Starter+ gate — the frontend already hides this field's UI for Free
        // shops, but nothing previously stopped a Free shop from posting it directly to this
        // API and having it actually render (custom_css IS wired into the real storefront
        // compiler, unlike customJs below, which has no render path at any tier).
        customCss: isFeatureEnabled(shop.planKey, "custom_css") ? (customCss || null) : null,
        customJs: customJs || null,
        productSliderPosition,
        productSliderSource,
        productSliderConfig: productSliderConfig || null,
        categoryId: categoryId ? parseInt(categoryId) : null,
        editorMode: "builder",
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
        ...sanitizeSeoFields(shop, req.body),
      },
    });

    // Sync tags
    if (tags.length) {
      await syncTags(shop.id, post.id, tags);
    }

    // Sync products
    if (Array.isArray(productSliderProducts)) {
      await syncProducts(shop.id, post.id, productSliderProducts);
    }

    // Sync manual related-posts override — silently ignored (not 403'd) when not entitled, so a
    // locked field never destroys the rest of an otherwise-valid post save; the automatic fallback
    // in RelatedPostsService still applies since no PostRelatedPost rows get created.
    if (Array.isArray(relatedPostIds) && (relatedPostIds.length === 0 || isFeatureEnabled(shop.planKey, "related_posts_manual"))) {
      await syncRelatedPosts(shop.id, post.id, relatedPostIds);
    }

    // Create ShopifyArticle record if blogId provided
    if (blogId) {
      await prisma.shopifyArticle.create({
        data: {
          postId: post.id,
          shopifyBlogId: String(blogId),
          status: "draft",
          syncState: "linked",
          syncMode: "external_html",
        },
      });
    }

    const postCount = await prisma.post.count({ where: { shopId: shop.id } });
    const isFirstPost = postCount === 1;

    res.status(201).json({ post: { id: post.id }, success: true, isFirstPost });
  } catch (err) {
    console.error("POST /api/posts error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/posts/:id — Update post ────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const post = await prisma.post.findFirst({
      where: { id: parseInt(req.params.id), shopId: shop.id },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const {
      title,
      slug,
      status,
      author,
      vendor,
      excerpt,
      featuredImage,
      contentJson,
      contentHtml: reqContentHtml,
      customCss,
      customJs,
      productSliderPosition,
      productSliderSource,
      productSliderConfig,
      productSliderProducts,
      categoryId,
      tags,
      publishedAt,
      editorMode,
      metaTitle,
      metaDescription,
      canonicalUrl,
      ogTitle,
      ogDescription,
      ogImage,
      metaRobotsNoindex,
      metaRobotsNofollow,
      excludeFromSitemap,
      richSnippetType,
      blogId,
      relatedPostIds,
    } = req.body;

    const blocks = contentJson !== undefined ? (Array.isArray(contentJson) ? contentJson : []) : post.contentJson || [];

    const finalEditorMode = editorMode || post.editorMode || "builder";
    let finalContentHtml = post.contentHtml;
    if (reqContentHtml !== undefined) {
      const session = res.locals.shopify?.session;
      let client = null;
      if (session) {
        client = new shopify.api.clients.Graphql({ session });
      }
      finalContentHtml = await EditorContentCompiler.compile(
        reqContentHtml,
        session,
        client,
        shop.planKey
      );
    }

    const updated = await prisma.post.update({
      where: { id: post.id },
      data: {
        ...(title && { title }),
        ...(slug && { slug }),
        ...(status && { status }),
        author: author !== undefined ? author : post.author,
        vendor: vendor !== undefined ? vendor : post.vendor,
        excerpt: excerpt !== undefined ? excerpt : post.excerpt,
        featuredImage: featuredImage !== undefined ? featuredImage : post.featuredImage,
        contentJson: blocks,
        contentHtml: finalContentHtml,
        customCss: isFeatureEnabled(shop.planKey, "custom_css") && customCss !== undefined ? customCss : post.customCss,
        customJs: customJs !== undefined ? customJs : post.customJs,
        ...(productSliderPosition && { productSliderPosition }),
        ...(productSliderSource && { productSliderSource }),
        ...(productSliderConfig && { productSliderConfig }),
        ...(categoryId !== undefined && { categoryId: categoryId ? parseInt(categoryId) : null }),
        ...(publishedAt && { publishedAt: new Date(publishedAt) }),
        editorMode: finalEditorMode,
        metaTitle: metaTitle !== undefined ? metaTitle : post.metaTitle,
        metaDescription: metaDescription !== undefined ? metaDescription : post.metaDescription,
        ...sanitizeSeoFieldsForUpdate(shop, req.body, post),
        updatedAt: new Date(),
      },
    });

    if (Array.isArray(tags)) {
      await syncTags(shop.id, post.id, tags);
    }

    if (Array.isArray(productSliderProducts)) {
      await syncProducts(shop.id, post.id, productSliderProducts);
    }

    if (Array.isArray(relatedPostIds) && (relatedPostIds.length === 0 || isFeatureEnabled(shop.planKey, "related_posts_manual"))) {
      await syncRelatedPosts(shop.id, post.id, relatedPostIds);
    }

    const shopifyRecord = await prisma.shopifyArticle.findUnique({ where: { postId: post.id } });
    let wasMoved = false;

    // Check if the blog is being changed for an already linked article
    if (blogId && shopifyRecord && shopifyRecord.shopifyArticleId) {
      let actualRemoteBlogId = shopifyRecord.shopifyBlogId;
      try {
        const session = res.locals.shopify?.session;
        if (session) {
          const client = new shopify.api.clients.Graphql({ session });
          const remoteCheck = await client.request(`
            query GetArticleBlog($id: ID!) {
              article(id: $id) {
                blog { id }
              }
            }
          `, { variables: { id: ArticleSyncService.toArticleGid(shopifyRecord.shopifyArticleId) } });
          
          if (remoteCheck.data?.article?.blog?.id) {
            actualRemoteBlogId = ArticleSyncService.numericIdFromGid(remoteCheck.data.article.blog.id);
          }
        }
      } catch (err) {
        console.warn(`[Blog Move] Failed to fetch remote article's blog ID: ${err.message}`);
      }

      if (actualRemoteBlogId && actualRemoteBlogId !== String(blogId)) {
        // Shopify does not support moving articles between blogs natively.
        // We must delete the old article and create a new one in the target blog.
        try {
          const session = res.locals.shopify?.session;
          if (session) {
            const client = new shopify.api.clients.Graphql({ session });
            await client.request(`
              mutation DeleteArticle($id: ID!) {
                articleDelete(id: $id) {
                  deletedArticleId
                }
              }
            `, { variables: { id: ArticleSyncService.toArticleGid(shopifyRecord.shopifyArticleId) } });
          }
        } catch (err) {
          console.warn(`[Blog Move] Failed to delete old article: ${err.message}`);
        }

        // Update the local record to clear the Shopify Article ID and set the new Blog ID
        await prisma.shopifyArticle.update({
          where: { postId: post.id },
          data: {
            shopifyBlogId: String(blogId),
            shopifyArticleId: null, // Force recreation
            syncRevision: 0,
          },
        });
        wasMoved = true;
      }
    }
    
    if (!wasMoved && blogId) {
      // Create or update ShopifyArticle relation locally
      await prisma.shopifyArticle.upsert({
        where: { postId: post.id },
        create: {
          postId: post.id,
          shopifyBlogId: String(blogId),
          status: updated.status || "draft",
          syncState: "linked",
          syncMode: "external_html",
        },
        update: {
          shopifyBlogId: String(blogId),
        },
      });
    }

    const updatedShopifyRecord = await prisma.shopifyArticle.findUnique({ where: { postId: post.id } });
    const targetBlogId = blogId || updatedShopifyRecord?.shopifyBlogId;

    // Sync to Shopify if published, already linked, or explicitly moved
    if (targetBlogId && (updated.status === "published" || updatedShopifyRecord?.shopifyArticleId || wasMoved)) {
      try {
        await ArticleSyncService.syncAfterLocalEdit(post.id, {
          publishMode: updated.status === "published",
        });
      } catch (shopifyErr) {
        console.error("Shopify sync failed during PUT:", shopifyErr);
      }
    }

    res.json({ post: { id: updated.id }, success: true });
  } catch (err) {
    console.error("PUT /api/posts/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/posts/:id ─────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    const shop = await getShopFromSession(res);
    if (!shop || !session) return res.status(401).json({ error: "Unauthorized" });

    const post = await prisma.post.findFirst({
      where: { id: parseInt(req.params.id), shopId: shop.id },
      include: { shopifyArticle: true },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const { deleteFromShopify } = req.query;

    if (deleteFromShopify === "true" && post.shopifyArticle?.shopifyArticleId && post.shopifyArticle?.shopifyBlogId) {
      try {
        const client = new shopify.api.clients.Graphql({ session });
        const result = await client.request(`
          mutation DeleteArticle($id: ID!) {
            articleDelete(id: $id) {
              deletedArticleId
              userErrors { field message }
            }
          }
        `, { variables: { id: ArticleSyncService.toArticleGid(post.shopifyArticle.shopifyArticleId) } });

        const errors = result.data?.articleDelete?.userErrors;
        if (errors?.length > 0) {
          console.error("Failed to delete from Shopify:", errors);
        }
      } catch (shopifyErr) {
        console.error("Failed to delete from Shopify:", shopifyErr);
      }
    }

    await prisma.post.delete({ where: { id: post.id } });
    res.status(204).send();
  } catch (err) {
    console.error("DELETE /api/posts/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/:id/clone — Duplicate an article ─────────────────────────
router.post("/:id/clone", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    // 1. Plan gate — duplicating articles is a Starter+ action
    if (!isFeatureEnabled(shop.planKey, "clone_article")) {
      return res.status(403).json({ error: "Duplicating articles is available on Starter and above. Please upgrade to clone this article." });
    }

    // 2. Plan limit check
    const limit = getArticleLimit(shop.planKey);
    if (limit !== null) {
      const count = await prisma.post.count({ where: { shopId: shop.id } });
      if (count >= limit) {
        return res.status(403).json({
          error: `You've reached your plan limit of ${limit} articles. Please upgrade to clone more.`,
        });
      }
    }

    // 3. Fetch source post with all relations
    const sourcePost = await prisma.post.findFirst({
      where: { id: parseInt(req.params.id), shopId: shop.id },
      include: {
        tags: { include: { tag: true } },
        products: { include: { product: true } },
        blocks: true,
        translations: true,
        shopifyArticle: true,   // needed to copy blog assignment
      },
    });
    if (!sourcePost) return res.status(404).json({ error: "Post not found" });

    // 3. User-confirmed title from modal (fallback: "Copy of ...")
    const clonedTitle = ((req.body.title || "").trim()) || `Copy of ${sourcePost.title}`;

    // 4. Create the cloned post record
    const clonedPost = await prisma.post.create({
      data: {
        shopId: shop.id,
        title: clonedTitle,
        slug: generateSlug(clonedTitle),
        status: "draft",
        author: sourcePost.author,
        vendor: sourcePost.vendor,
        excerpt: sourcePost.excerpt,
        featuredImage: sourcePost.featuredImage,
        contentJson: sourcePost.contentJson,
        contentHtml: sourcePost.contentHtml,
        customCss: sourcePost.customCss,
        customJs: sourcePost.customJs,
        productSliderPosition: sourcePost.productSliderPosition,
        productSliderSource: sourcePost.productSliderSource,
        productSliderConfig: sourcePost.productSliderConfig,
        categoryId: sourcePost.categoryId,
        editorMode: sourcePost.editorMode,
        metaTitle: sourcePost.metaTitle,
        metaDescription: sourcePost.metaDescription,
        canonicalUrl: null,       // SEO: canonical must be unique — clear it
        ogTitle: sourcePost.ogTitle,
        ogDescription: sourcePost.ogDescription,
        ogImage: sourcePost.ogImage,
        metaRobotsNoindex: sourcePost.metaRobotsNoindex,
        metaRobotsNofollow: sourcePost.metaRobotsNofollow,
        excludeFromSitemap: sourcePost.excludeFromSitemap,
        richSnippetType: sourcePost.richSnippetType,
        publishedAt: null,        // Clone is never auto-published
        trackingKey: null,        // Will be generated fresh on first view
      },
    });

    // 5. Clone PostTag associations
    const tagNames = sourcePost.tags.map((pt) => pt.tag?.name).filter(Boolean);
    if (tagNames.length > 0) await syncTags(shop.id, clonedPost.id, tagNames);

    // 6. Clone PostProduct associations
    const productList = sourcePost.products.map((pp) => pp.product).filter(Boolean);
    if (productList.length > 0) await syncProducts(shop.id, clonedPost.id, productList);

    // 7. Clone PostBlock rows
    if (sourcePost.blocks.length > 0) {
      await prisma.postBlock.createMany({
        data: sourcePost.blocks.map((b) => ({
          postId: clonedPost.id,
          blockType: b.blockType,
          orderIndex: b.orderIndex,
          settings: b.settings,
        })),
      });
    }

    // 8. Clone PostTranslation rows (multi-language content)
    if (sourcePost.translations.length > 0) {
      await prisma.postTranslation.createMany({
        data: sourcePost.translations.map((t) => ({
          postId: clonedPost.id,
          locale: t.locale,
          title: t.title,
          excerpt: t.excerpt,
          contentHtml: t.contentHtml,
          metaTitle: t.metaTitle,
          metaDescription: t.metaDescription,
        })),
      });
    }

    // 9. Copy Shopify blog assignment (linked but not yet synced)
    //    The clone is a local draft — it inherits the same blog so the user
    //    doesn't have to re-select it, but it is NOT pushed to Shopify yet.
    const sourceBlogId = sourcePost.shopifyArticle?.shopifyBlogId;
    if (sourceBlogId) {
      await prisma.shopifyArticle.create({
        data: {
          postId: clonedPost.id,
          shopifyBlogId: sourceBlogId,
          shopifyArticleId: null,  // not created on Shopify
          status: "draft",
          syncState: "linked",
          syncMode: "external_html",
        },
      });
    }

    res.status(201).json({ post: { id: clonedPost.id }, success: true });
  } catch (err) {
    console.error("POST /api/posts/:id/clone error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/:id/publish — Publish to Shopify ─────────────────────────
router.post("/:id/publish", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    const shop = await getShopFromSession(res);
    if (!shop || !session) return res.status(401).json({ error: "Unauthorized" });

    const post = await prisma.post.findFirst({
      where: { id: parseInt(req.params.id), shopId: shop.id },
      include: {
        shopifyArticle: true,
        tags: { include: { tag: true } },
        products: { include: { product: true } },
      },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const { blogId, scheduledAt } = req.body;
    const targetBlogId = blogId || post.shopifyArticle?.shopifyBlogId;
    if (!targetBlogId) {
      return res.status(422).json({ error: "No Shopify blog selected. Please select a blog first." });
    }

    let scheduledDate = null;
    if (scheduledAt) {
      scheduledDate = new Date(scheduledAt);
      if (Number.isNaN(scheduledDate.getTime())) {
        return res.status(422).json({ error: "Invalid scheduled date." });
      }
      if (scheduledDate <= new Date()) {
        return res.status(422).json({ error: "Scheduled date must be in the future." });
      }
      if (!isFeatureEnabled(shop.planKey, "post_scheduling")) {
        return res.status(403).json({ error: "Scheduled publishing is available on Starter and above. Please upgrade or publish immediately instead." });
      }
    }

    // Ensure the post is linked before push
    if (!post.shopifyArticle) {
      await prisma.shopifyArticle.create({
        data: {
          postId: post.id,
          shopifyBlogId: String(targetBlogId),
          status: "draft",
          syncState: "linked",
          syncMode: "external_html",
        },
      });
    }

    if (scheduledDate) {
      // pushPostToShopify reads status/publishedAt from the DB, so the local record must
      // reflect the schedule before syncAfterLocalEdit runs.
      await prisma.post.update({
        where: { id: post.id },
        data: { status: "scheduled", publishedAt: scheduledDate },
      });
      const result = await ArticleSyncService.syncAfterLocalEdit(post.id, { publishMode: false });
      return res.json({ success: true, scheduled: true, scheduledAt: scheduledDate, shopify_article_id: result.articleId });
    }

    // Use ArticleSyncService to push with publish mode
    const result = await ArticleSyncService.syncAfterLocalEdit(post.id, {
      publishMode: true,
    });

    // Also update local post status to published
    await prisma.post.update({
      where: { id: post.id },
      data: { status: "published", publishedAt: new Date() },
    });

    res.json({ success: true, shopify_article_id: result.articleId, syncedAt: result.syncedAt });
  } catch (err) {
    console.error("POST /api/posts/:id/publish error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/:id/unpublish — Unpublish from Shopify ───────────────────
router.post("/:id/unpublish", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    const shop = await getShopFromSession(res);
    if (!shop || !session) return res.status(401).json({ error: "Unauthorized" });

    const post = await prisma.post.findFirst({
      where: { id: parseInt(req.params.id), shopId: shop.id },
      include: { shopifyArticle: true },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    if (!post.shopifyArticle || !post.shopifyArticle.shopifyArticleId || !post.shopifyArticle.shopifyBlogId) {
      return res.status(400).json({ error: "Post is not published to Shopify." });
    }

    const client = new shopify.api.clients.Graphql({ session });

    // Set isPublished to false to unpublish it
    const unpublishResult = await client.request(`
      mutation UnpublishArticle($id: ID!, $article: ArticleUpdateInput!) {
        articleUpdate(id: $id, article: $article) {
          article { id }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        id: ArticleSyncService.toArticleGid(post.shopifyArticle.shopifyArticleId),
        article: { isPublished: false },
      },
    });

    const unpublishErrors = unpublishResult.data?.articleUpdate?.userErrors;
    if (unpublishErrors?.length > 0) {
      return res.status(502).json({ error: unpublishErrors.map(e => e.message).join("; ") });
    }

    await prisma.$transaction([
      prisma.shopifyArticle.update({
        where: { postId: post.id },
        data: {
          status: "draft",
          syncState: "in_sync",
          lastSyncDirection: "app_to_shopify",
        },
      }),
      prisma.post.update({
        where: { id: post.id },
        data: { status: "draft" },
      }),
    ]);

    // Log the unpublish event
    await ArticleSyncService.logSyncEvent({
      shopId: shop.id,
      postId: post.id,
      shopifyArticleId: post.shopifyArticle.shopifyArticleId,
      direction: "app_to_shopify",
      eventType: "unpublish",
      status: "applied",
      message: `Unpublished post "${post.title}" from Shopify`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/posts/:id/unpublish error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/plan/features — Return plan features for UI ───────────────
router.get("/plan/features", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });
    const features = getFeaturesForPlan(shop.planKey);
    res.json({ plan: shop.planKey, features });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/meta/dashboard-extras — cheap counts + upcoming scheduled posts +
// plan usage + recent sync issues, all in one round trip for the Dashboard page ─────────
router.get("/meta/dashboard-extras", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const now = new Date();
    const WEEKS = 8;
    const cadenceStart = new Date(now.getTime() - WEEKS * 7 * 24 * 60 * 60 * 1000);
    const [totalPosts, draftCount, scheduledCount, notSyncedCount, upcoming, syncIssues, recentlyPublished] =
      await Promise.all([
        prisma.post.count({ where: { shopId: shop.id } }),
        prisma.post.count({ where: { shopId: shop.id, status: "draft" } }),
        prisma.post.count({ where: { shopId: shop.id, status: "scheduled" } }),
        prisma.post.count({ where: { shopId: shop.id, shopifyArticle: null } }),
        prisma.post.findMany({
          where: { shopId: shop.id, status: "scheduled", publishedAt: { gt: now } },
          orderBy: { publishedAt: "asc" },
          take: 5,
          select: { id: true, title: true, publishedAt: true },
        }),
        // Fetch more than the 5 we'll show and dedupe by post below — a post that's conflicted
        // repeatedly (e.g. a merchant retrying the same edit) would otherwise fill the entire
        // "Recent sync issues" list with 5 copies of itself, crowding out every other issue.
        prisma.articleSyncLog.findMany({
          where: { shopId: shop.id, status: { in: ["error", "conflict"] } },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { id: true, postId: true, direction: true, eventType: true, status: true, message: true, createdAt: true },
        }),
        // Publish cadence for the Dashboard's Content Pipeline chart — posts per week over the
        // last 8 weeks. Deliberately status:"published" + publishedAt only (not createdAt): a
        // draft edited today shouldn't count as "published this week."
        prisma.post.findMany({
          where: { shopId: shop.id, status: "published", publishedAt: { gte: cadenceStart } },
          select: { publishedAt: true },
        }),
      ]);

    // Bucket into 8 week-long windows ending "now", oldest first — a fixed-width trailing window
    // rather than calendar weeks, so it reads the same regardless of what day of the week it is.
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const publishCadence = Array.from({ length: WEEKS }, (_, i) => {
      const windowStart = new Date(cadenceStart.getTime() + i * weekMs);
      const windowEnd = new Date(windowStart.getTime() + weekMs);
      const count = recentlyPublished.filter(
        (p) => p.publishedAt >= windowStart && p.publishedAt < windowEnd
      ).length;
      return { weekStart: windowStart.toISOString(), count };
    });

    const seenPostIds = new Set();
    const dedupedSyncIssues = [];
    for (const issue of syncIssues) {
      const dedupeKey = issue.postId ?? `no-post-${issue.id}`;
      if (seenPostIds.has(dedupeKey)) continue;
      seenPostIds.add(dedupeKey);
      dedupedSyncIssues.push(issue);
      if (dedupedSyncIssues.length >= 5) break;
    }

    const postIds = [...new Set(dedupedSyncIssues.map((s) => s.postId).filter(Boolean))];
    const relatedPosts = postIds.length
      ? await prisma.post.findMany({ where: { id: { in: postIds } }, select: { id: true, title: true } })
      : [];
    const postTitleById = Object.fromEntries(relatedPosts.map((p) => [p.id, p.title]));

    res.json({
      drafts: draftCount,
      scheduled: scheduledCount,
      notSynced: notSyncedCount,
      upcoming: upcoming.map((p) => ({ id: p.id, title: p.title, publishedAt: p.publishedAt })),
      planUsage: { plan: shop.planKey, used: totalPosts, limit: getArticleLimit(shop.planKey) },
      syncIssues: dedupedSyncIssues.map((s) => ({ ...s, postTitle: s.postId ? postTitleById[s.postId] || null : null })),
      publishCadence,
    });
  } catch (err) {
    console.error("GET /api/posts/meta/dashboard-extras error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/upload — Media upload ────────────────────────────────────
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const shop = await getShopFromSession(res);
    if (shop) {
      const session = res.locals.shopify.session;
      const client = new shopify.api.clients.Graphql({ session });
      
      const stagedQuery = `
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets { url resourceUrl parameters { name value } }
            userErrors { field message }
          }
        }
      `;
      const stagedData = await client.request(stagedQuery, {
        variables: {
          input: [{
            resource: "IMAGE",
            filename: req.file.originalname,
            mimeType: req.file.mimetype,
            fileSize: req.file.size.toString(),
            httpMethod: "POST"
          }]
        }
      });
      
      const target = stagedData.data.stagedUploadsCreate.stagedTargets[0];
      if (target) {
        const formData = new FormData();
        target.parameters.forEach(p => formData.append(p.name, p.value));
        const { Blob } = await import("node:buffer");
        const fs = await import("fs");
        const fileBuffer = fs.readFileSync(req.file.path);
        formData.append("file", new Blob([fileBuffer], { type: req.file.mimetype }), req.file.originalname);
        
        await fetch(target.url, { method: "POST", body: formData });
        
        const createQuery = `
          mutation fileCreate($files: [FileCreateInput!]!) {
            fileCreate(files: $files) {
              files { id ... on MediaImage { image { url } } }
              userErrors { field message }
            }
          }
        `;
        const createData = await client.request(createQuery, {
          variables: {
            files: [{ originalSource: target.resourceUrl, contentType: "IMAGE" }]
          }
        });
        
        let fileObj = createData.data.fileCreate.files[0];
        let finalUrl = fileObj?.image?.url;
        
        // Poll up to 5 times
        let attempts = 0;
        while (!finalUrl && attempts < 5 && fileObj?.id) {
          await new Promise(r => setTimeout(r, 1000));
          const pollQuery = `query { node(id: "${fileObj.id}") { ... on MediaImage { image { url } } } }`;
          const pollData = await client.request(pollQuery);
          finalUrl = pollData.data.node?.image?.url;
          attempts++;
        }
        
        if (finalUrl) {
           return res.json({ url: finalUrl, filename: req.file.filename });
        } else {
           throw new Error("Timeout polling for Shopify image URL.");
        }
      }
    }
    throw new Error("Could not construct Shopify Graphql Client or Session.");
  } catch (e) {
    console.error("Shopify Direct Upload failed:", e);
    res.status(500).json({ error: "Failed to upload image to Shopify CDN." });
  } finally {
    if (req.file && req.file.path) {
      import("fs").then(fs => {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      });
    }
  }
});

// ─── GET /api/posts/shopify/blogs — Fetch Shopify blogs list ─────────────────
// ─── GET /api/posts/shopify/blogs — Fetch Shopify blogs list ─────────────────
router.get("/shopify/blogs", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const client = new shopify.api.clients.Graphql({ session });
    const result = await client.request(`
      query ListBlogs($first: Int!) {
        blogs(first: $first) {
          nodes { id title handle commentPolicy templateSuffix updatedAt }
        }
      }
    `, { variables: { first: 50 } });
    const blogs = result.data?.blogs?.nodes || [];

    res.json({
      blogs: blogs.map((b) => ({
        id: ArticleSyncService.numericIdFromGid(b.id),
        title: b.title,
        handle: b.handle,
        commentPolicy: b.commentPolicy,
        templateSuffix: b.templateSuffix,
        updatedAt: b.updatedAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/shopify/blogs/:id — Fetch a single Shopify blog ────────
router.get("/shopify/blogs/:id", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const client = new shopify.api.clients.Graphql({ session });
    const gid = ArticleSyncService.gidFromNumericId(req.params.id, "Blog");

    const result = await client.request(`
      query GetBlog($id: ID!) {
        blog(id: $id) {
          id title handle commentPolicy templateSuffix
          seoTitle: metafield(namespace: "global", key: "title_tag") { value }
          seoDescription: metafield(namespace: "global", key: "description_tag") { value }
        }
      }
    `, { variables: { id: gid } });

    const b = result.data?.blog;
    if (!b) return res.status(404).json({ error: "Not found" });

    res.json({
      blog: {
        id: ArticleSyncService.numericIdFromGid(b.id),
        title: b.title,
        handle: b.handle,
        commentPolicy: b.commentPolicy || "DISABLED",
        templateSuffix: b.templateSuffix || "",
        seoTitle: b.seoTitle?.value || "",
        seoDescription: b.seoDescription?.value || "",
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/shopify/blogs — Create a new Shopify blog ─────────────
router.post("/shopify/blogs", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const { title, handle, commentPolicy, templateSuffix, seoTitle, seoDescription } = req.body;

    const metafields = [];
    if (seoTitle) metafields.push({ namespace: "global", key: "title_tag", type: "single_line_text_field", value: seoTitle });
    if (seoDescription) metafields.push({ namespace: "global", key: "description_tag", type: "single_line_text_field", value: seoDescription });

    const input = {
      title,
      handle: handle || undefined,
      commentPolicy: commentPolicy || undefined,
      templateSuffix: templateSuffix || undefined,
    };
    if (metafields.length > 0) input.metafields = metafields;

    const client = new shopify.api.clients.Graphql({ session });
    const result = await client.request(`
      mutation blogCreate($blog: BlogCreateInput!) {
        blogCreate(blog: $blog) {
          blog { id }
          userErrors { field message }
        }
      }
    `, { variables: { blog: input } });

    if (result.data?.blogCreate?.userErrors?.length) {
      return res.status(400).json({ error: result.data.blogCreate.userErrors[0].message });
    }

    res.json({ blog: { id: ArticleSyncService.numericIdFromGid(result.data.blogCreate.blog.id) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/posts/shopify/blogs/:id — Update a Shopify blog ──────────────
router.put("/shopify/blogs/:id", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    const { title, handle, commentPolicy, templateSuffix, seoTitle, seoDescription } = req.body;
    
    const gid = ArticleSyncService.gidFromNumericId(req.params.id, "Blog");
    const client = new shopify.api.clients.Graphql({ session });
    
    const input = {
      title,
      handle: handle || undefined,
      commentPolicy: commentPolicy || undefined,
      templateSuffix: templateSuffix || undefined,
    };
    
    const result = await client.request(`
      mutation blogUpdate($id: ID!, $blog: BlogUpdateInput!) {
        blogUpdate(id: $id, blog: $blog) {
          blog { id }
          userErrors { field message }
        }
      }
    `, { variables: { id: gid, blog: input } });

    if (result.data?.blogUpdate?.userErrors?.length) {
      return res.status(400).json({ error: result.data.blogUpdate.userErrors[0].message });
    }
    
    // Now upsert the SEO metafields safely using metafieldsSet
    const metafields = [];
    if (seoTitle !== undefined) metafields.push({ ownerId: gid, namespace: "global", key: "title_tag", type: "single_line_text_field", value: seoTitle });
    if (seoDescription !== undefined) metafields.push({ ownerId: gid, namespace: "global", key: "description_tag", type: "single_line_text_field", value: seoDescription });
    
    if (metafields.length > 0) {
      await client.request(`
        mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            userErrors { field message }
          }
        }
      `, { variables: { metafields } });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/posts/shopify/blogs/:id — Delete a Shopify blog ───────────
router.delete("/shopify/blogs/:id", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });
    
    const rawId = req.params.id;
    const numericId = rawId.includes("/") ? rawId.split("/").pop() : rawId;
    const gid = "gid://shopify/Blog/" + numericId;

    const client = new shopify.api.clients.Graphql({ session });
    
    const result = await client.request(`
      mutation blogDelete($id: ID!) {
        blogDelete(id: $id) {
          userErrors { field message }
        }
      }
    `, { variables: { id: gid } });

    if (result.data?.blogDelete?.userErrors?.length) {
      return res.status(400).json({ error: result.data.blogDelete.userErrors[0].message });
    }
    
    // Clean up local posts that belong to this blog ID
    try {
      const shopifyArticles = await prisma.shopifyArticle.findMany({
        where: { shopifyBlogId: String(numericId) },
        select: { postId: true }
      });
      const postIds = shopifyArticles.map(sa => sa.postId);
      
      if (postIds.length > 0) {
        await prisma.postTag.deleteMany({ where: { postId: { in: postIds } } });
        await prisma.postProduct.deleteMany({ where: { postId: { in: postIds } } });
        await prisma.post.deleteMany({ where: { id: { in: postIds } } });
      }
    } catch (dbErr) {
      console.warn("DB cleanup error after blog deletion:", dbErr.message);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Blog delete error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/shopify/files — Fetch Shopify global files ─────────────────
router.get("/shopify/files", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const client = new shopify.api.clients.Graphql({ session });
    const { after = null, query = "" } = req.query;

    let gqlQuery = "";
    if (query) {
      gqlQuery = `query: "${query.replace(/"/g, '\\"')}",`;
    }

    const result = await client.request(`
      query GetFiles($after: String) {
        files(first: 50, after: $after, sortKey: CREATED_AT, reverse: true, ${gqlQuery}) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              __typename
              ... on MediaImage {
                id
                alt
                image { url width height }
              }
            }
          }
        }
      }
    `, { variables: { after } });

    const filesData = result.data?.files;
    const pageInfo = filesData?.pageInfo || { hasNextPage: false, endCursor: null };
    const edges = filesData?.edges || [];

    const files = edges
      .filter((e) => e.node.__typename === "MediaImage")
      .map((e) => ({
        id: e.node.id,
        url: e.node.image?.url,
        alt: e.node.alt || "",
      }));

    res.json({ files, pageInfo });
  } catch (err) {
    console.error("GET /api/posts/shopify/files error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/shopify/products — Fetch Shopify products ────────────────
router.get("/shopify/products", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const { query = "", limit = "50" } = req.query;
    const client = new shopify.api.clients.Graphql({ session });

    const result = await client.request(`
      query SearchProducts($query: String!, $first: Int!) {
        products(query: $query, first: $first) {
          edges {
            node {
              id
              title
              handle
              status
              featuredImage { url altText }
              priceRangeV2 { minVariantPrice { amount currencyCode } }
              variants(first: 1) {
                edges { node { id availableForSale } }
              }
            }
          }
        }
      }
    `, { variables: { query, first: parseInt(limit) } });

    const products = (result.data?.products?.edges || []).map(({ node }) => ({
      shopifyProductId: node.id,
      title: node.title,
      handle: node.handle,
      image: node.featuredImage?.url || null,
      price: node.priceRangeV2?.minVariantPrice?.amount || null,
      currency: node.priceRangeV2?.minVariantPrice?.currencyCode || "USD",
      variantId: node.variants?.edges?.[0]?.node?.id || null,
      variantAvailable: node.variants?.edges?.[0]?.node?.availableForSale ?? true,
    }));

    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/shopify/locales — Fetch store active locales ────────────
router.get("/shopify/locales", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const client = new shopify.api.clients.Graphql({ session });

    const result = await client.request(`
      query GetShopLocales {
        shopLocales {
          locale
          name
          primary
          published
        }
      }
    `);

    const locales = (result.data?.shopLocales || []).filter(l => l.published && !l.primary);
    res.json({ locales });
  } catch (err) {
    console.error("GET /api/posts/shopify/locales error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/shopify/store — Fetch store currency ──────────────────────
router.get("/shopify/store", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const client = new shopify.api.clients.Graphql({ session });

    const result = await client.request(`
      query GetShopCurrency {
        shop {
          currencyCode
          currencyFormats {
            moneyFormat
            moneyWithCurrencyFormat
          }
        }
      }
    `);

    const shopData = result.data?.shop;
    res.json({
      currencyCode: shopData?.currencyCode || "USD",
      moneyFormat: shopData?.currencyFormats?.moneyFormat || "${{amount}}",
      moneyWithCurrencyFormat: shopData?.currencyFormats?.moneyWithCurrencyFormat || "${{amount}} USD",
    });
  } catch (err) {
    console.error("GET /api/posts/shopify/store error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/shopify/collections — Fetch Shopify collections ──────────
router.get("/shopify/collections", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const { query = "", limit = "30" } = req.query;
    const client = new shopify.api.clients.Graphql({ session });

    const result = await client.request(`
      query GetCollections($first: Int!, $query: String!) {
        collections(first: $first, query: $query) {
          edges {
            node {
              id
              title
              handle
              image { url altText }
              productsCount { count }
            }
          }
        }
      }
    `, { variables: { first: parseInt(limit), query } });

    const collections = (result.data?.collections?.edges || []).map(({ node }) => ({
      shopifyCollectionId: node.id,
      title: node.title,
      handle: node.handle,
      image: node.image?.url || null,
      productsCount: node.productsCount?.count ?? 0,
    }));

    res.json({ collections });
  } catch (err) {
    console.error("GET /api/posts/shopify/collections error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/shopify/collections/:handle/products — Collection products ─
router.get("/shopify/collections/:handle/products", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const { handle } = req.params;
    const { limit = "12" } = req.query;
    const client = new shopify.api.clients.Graphql({ session });

    const result = await client.request(`
      query GetCollectionProducts($handle: String!, $first: Int!) {
        collectionByHandle(handle: $handle) {
          id
          title
          handle
          image { url altText }
          products(first: $first) {
            edges {
              node {
                id
                title
                handle
                featuredImage { url altText }
                priceRangeV2 { minVariantPrice { amount currencyCode } }
                variants(first: 1) {
                  edges { node { id availableForSale } }
                }
              }
            }
          }
        }
      }
    `, { variables: { handle, first: parseInt(limit) } });

    const collection = result.data?.collectionByHandle;
    if (!collection) return res.status(404).json({ error: "Collection not found" });

    const products = (collection.products?.edges || []).map(({ node }) => ({
      shopifyProductId: node.id,
      title: node.title,
      handle: node.handle,
      image: node.featuredImage?.url || null,
      price: node.priceRangeV2?.minVariantPrice?.amount || null,
      currency: node.priceRangeV2?.minVariantPrice?.currencyCode || "USD",
      variantId: node.variants?.edges?.[0]?.node?.id || null,
      variantAvailable: node.variants?.edges?.[0]?.node?.availableForSale ?? true,
    }));

    res.json({
      collection: {
        id: collection.id,
        title: collection.title,
        handle: collection.handle,
        image: collection.image?.url || null,
      },
      products,
    });
  } catch (err) {
    console.error("GET /api/posts/shopify/collections/:handle/products error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

async function syncTags(shopId, postId, tags) {
  const tagNames = tags.map((t) => (typeof t === "string" ? t.trim() : String(t).trim())).filter(Boolean);

  // Upsert tags
  const tagRecords = await Promise.all(
    tagNames.map((name) =>
      prisma.tag.upsert({
        where: {
          shopId_slug: {
            shopId,
            slug: name.toLowerCase().replace(/\s+/g, "-"),
          },
        },
        create: {
          shopId,
          name,
          slug: name.toLowerCase().replace(/\s+/g, "-"),
        },
        update: {},
      })
    )
  );

  // Remove old PostTag rows and re-insert
  await prisma.postTag.deleteMany({ where: { postId } });
  await prisma.postTag.createMany({
    data: tagRecords.map((tag) => ({ postId, tagId: tag.id })),
    skipDuplicates: true,
  });
}

async function syncProducts(shopId, postId, products) {
  if (!Array.isArray(products)) return;

  const productData = products.map((p) => {
    const rawId = p.shopifyProductId || p.id;
    const shopifyProductId = rawId ? String(rawId) : "";
    const priceRaw = p.price;
    const priceVal = priceRaw !== null && priceRaw !== undefined ? parseFloat(priceRaw) : null;
    const compareAtPriceRaw = p.compareAtPrice;
    const compareAtPriceVal = compareAtPriceRaw !== null && compareAtPriceRaw !== undefined ? parseFloat(compareAtPriceRaw) : null;

    return {
      shopifyProductId,
      title: String(p.title || ""),
      handle: String(p.handle || ""),
      image: p.image || null,
      price: priceVal,
      compareAtPrice: compareAtPriceVal,
      variantId: p.variantId ? String(p.variantId) : null,
      variantAvailable: p.variantAvailable ?? true,
    };
  }).filter((p) => p.shopifyProductId);

  // Upsert products in the Product table
  const productRecords = await Promise.all(
    productData.map(async (p) => {
      return prisma.product.upsert({
        where: { shopifyProductId: p.shopifyProductId },
        create: {
          shopId,
          shopifyProductId: p.shopifyProductId,
          title: p.title,
          handle: p.handle,
          image: p.image,
          price: p.price,
          compareAtPrice: p.compareAtPrice,
          variantId: p.variantId,
          variantAvailable: p.variantAvailable,
        },
        update: {
          title: p.title,
          handle: p.handle,
          image: p.image,
          price: p.price,
          compareAtPrice: p.compareAtPrice,
          variantId: p.variantId,
          variantAvailable: p.variantAvailable,
        },
      });
    })
  );

  // Remove old PostProduct rows and re-insert with positions
  await prisma.postProduct.deleteMany({ where: { postId } });
  
  if (productRecords.length > 0) {
    await prisma.postProduct.createMany({
      data: productRecords.map((prod, index) => ({
        postId,
        productId: prod.id,
        position: index,
      })),
      skipDuplicates: true,
    });
  }
}

// Manual "Related posts" override — mirrors syncProducts() above, but relatedPostIds reference
// existing local Post rows directly (unlike products, which are external Shopify resources that
// need local upsert/caching first).
async function syncRelatedPosts(shopId, postId, relatedPostIds) {
  if (!Array.isArray(relatedPostIds)) return;

  const ids = relatedPostIds
    .map((id) => parseInt(id, 10))
    .filter((id) => Number.isInteger(id) && id !== postId);

  // Only accept ids that actually belong to this shop — prevents cross-shop references.
  const validPosts = ids.length > 0
    ? await prisma.post.findMany({ where: { id: { in: ids }, shopId }, select: { id: true } })
    : [];
  const validIds = new Set(validPosts.map((p) => p.id));
  const orderedValidIds = ids.filter((id) => validIds.has(id));

  await prisma.postRelatedPost.deleteMany({ where: { postId } });

  if (orderedValidIds.length > 0) {
    await prisma.postRelatedPost.createMany({
      data: orderedValidIds.map((relatedPostId, index) => ({
        postId,
        relatedPostId,
        position: index,
      })),
      skipDuplicates: true,
    });
  }
}

function serializePost(post) {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    status: post.status,
    author: post.author,
    vendor: post.vendor,
    excerpt: post.excerpt,
    featuredImage: post.featuredImage,
    contentJson: post.contentJson,
    contentHtml: post.contentHtml,
    customCss: post.customCss,
    customJs: post.customJs,
    productSliderPosition: post.productSliderPosition,
    productSliderSource: post.productSliderSource,
    categoryId: post.categoryId,
    category: post.category || null,
    tags: post.tags ? post.tags.map((pt) => pt.tag?.name || pt) : [],
    products: post.products
      ? post.products.map((pp) => ({
          position: pp.position,
          ...pp.product,
        }))
      : [],
    relatedPosts: post.relatedPosts
      ? post.relatedPosts.map((r) => ({
          id: r.relatedPost.id,
          title: r.relatedPost.title,
          slug: r.relatedPost.slug,
          featuredImage: r.relatedPost.featuredImage,
        }))
      : [],
    shopifyArticle: post.shopifyArticle || null,
    editorMode: post.editorMode,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    canonicalUrl: post.canonicalUrl,
    ogTitle: post.ogTitle,
    ogDescription: post.ogDescription,
    ogImage: post.ogImage,
    metaRobotsNoindex: post.metaRobotsNoindex,
    metaRobotsNofollow: post.metaRobotsNofollow,
    excludeFromSitemap: post.excludeFromSitemap,
    richSnippetType: post.richSnippetType,
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

// Shared by both analytics routes below — the Analytics page's calendar/preset picker sends an
// explicit ?from=YYYY-MM-DD&to=YYYY-MM-DD range; dashboard.jsx's simpler selector still sends
// ?days=7|30|90. Prefer from/to when both are present and well-formed; otherwise fall back to
// the days allowlist exactly as before (fully backward compatible).
const DATE_QUERY_RE = /^\d{4}-\d{2}-\d{2}$/;
function resolveRequestedRange(req) {
  const { from, to } = req.query;
  if (typeof from === "string" && typeof to === "string" && DATE_QUERY_RE.test(from) && DATE_QUERY_RE.test(to) && from <= to) {
    return { from, to };
  }
  const ALLOWED_DAYS = [7, 30, 90];
  const requestedDays = parseInt(req.query.days, 10);
  return ALLOWED_DAYS.includes(requestedDays) ? requestedDays : 30;
}

// Previously this zeroed out the conversion/revenue/funnel/source/country fields for a plan
// without analytics_advanced — every dependent chart/table/card either showed "0.00%" everywhere
// (looking broken, not "upgrade to unlock") or, for FunnelChart/CountryBreakdown specifically,
// self-hid entirely on an empty array, silently changing the page layout between plans (fewer
// cards, different row heights) rather than showing a locked preview of the same UI. Replaced
// with representative sample data derived proportionally from the shop's own real view count, so
// every section keeps its normal shape and the frontend can render it blurred behind an
// "Upgrade" overlay (LockedOverlay component) instead of hiding or zeroing it. `advancedLocked:
// true` tells the frontend which sections to blur; the numbers themselves are never real for a
// non-entitled shop, so nothing sensitive is exposed through the blur.
function stripAdvancedAnalytics(analytics) {
  if (!analytics) return analytics;
  const views = analytics.stats?.totalViews || 0;
  const sampleCart = Math.max(4, Math.round(views * 0.12));
  const sampleCheckouts = Math.max(1, Math.round(sampleCart * 0.18));
  const sampleConversions = Math.max(1, Math.round(sampleCheckouts * 0.85));
  const sampleRevenue = sampleConversions * 68.5;
  const pct = (n, d) => (d > 0 ? ((n / d) * 100).toFixed(2) : "0.00");

  return {
    ...analytics,
    advancedLocked: true,
    stats: {
      ...analytics.stats,
      totalAddToCart: sampleCart,
      totalCheckouts: sampleCheckouts,
      totalConversions: sampleConversions,
      totalRevenue: sampleRevenue,
      addToCartRate: pct(sampleCart, views),
      checkoutRate: pct(sampleCheckouts, views),
      conversionRate: pct(sampleConversions, views),
    },
    topSources: [
      { name: "Google", count: Math.max(1, Math.round(views * 0.35)) },
      { name: "Instagram", count: Math.max(1, Math.round(views * 0.22)) },
      { name: "Direct", count: Math.max(1, Math.round(views * 0.18)) },
      { name: "Facebook", count: Math.max(1, Math.round(views * 0.1)) },
    ],
    topCountries: [
      { code: "US", count: Math.max(1, Math.round(views * 0.42)) },
      { code: "GB", count: Math.max(1, Math.round(views * 0.18)) },
      { code: "IN", count: Math.max(1, Math.round(views * 0.14)) },
      { code: "CA", count: Math.max(1, Math.round(views * 0.09)) },
    ],
    funnel: [
      { stage: "Views", count: views },
      { stage: "Add to Cart", count: sampleCart },
      { stage: "Checkout", count: sampleCheckouts },
      { stage: "Conversions", count: sampleConversions },
    ],
    trends: analytics.trends ? { ...analytics.trends, revenue: 4.2, conversionRate: 1.8 } : analytics.trends,
  };
}

// ─── GET /api/posts/analytics/summary — Dashboard analytics ──────────────────
router.get("/analytics/summary", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });
    if (!isFeatureEnabled(shop.planKey, "analytics_dashboard")) {
      return res.status(403).json({ error: "Analytics is available on Starter and above. Please upgrade to view your analytics." });
    }

    const range = resolveRequestedRange(req);

    // Use the shared analytics service for comprehensive data
    let analytics = await getShopAnalytics(shop.id, range);
    if (!analytics) {
      return res.json({
        stats: { totalPosts: 0, published: 0, drafts: 0, totalViews: 0, totalUniqueVisitors: 0, totalAddToCart: 0, totalCheckouts: 0, totalConversions: 0, totalRevenue: 0, addToCartRate: "0.00", checkoutRate: "0.00", conversionRate: "0.00" },
        daily: [],
        dailyViews: [],
        topPosts: [],
        deviceBreakdown: { desktop: 0, mobile: 0, tablet: 0 },
        topSources: [],
        topCountries: [],
        funnel: [],
        trends: {},
      });
    }
    if (!isFeatureEnabled(shop.planKey, "analytics_advanced")) {
      analytics = stripAdvancedAnalytics(analytics);
    }

    // Keep backward-compatible dailyViews field
    const dailyViews = (analytics.daily || []).map((d) => ({ date: d.date, views: d.views }));

    res.json({
      ...analytics,
      dailyViews,
    });
  } catch (err) {
    console.error("GET /api/posts/analytics/summary error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/:id/analytics — Per-post analytics drill-down ────────────
// Placed before the generic GET /:id route further below, same reasoning as
// /analytics/summary above — otherwise Express would treat "analytics" as the :id parameter.
router.get("/:id/analytics", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ error: "Post not found" });

    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });
    if (!isFeatureEnabled(shop.planKey, "analytics_dashboard")) {
      return res.status(403).json({ error: "Analytics is available on Starter and above. Please upgrade to view your analytics." });
    }

    const post = await prisma.post.findFirst({
      where: { id, shopId: shop.id },
      select: { id: true, title: true, slug: true, featuredImage: true, status: true },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const range = resolveRequestedRange(req);
    let analytics = await getPostAnalytics(id, shop.id, range);
    if (!isFeatureEnabled(shop.planKey, "analytics_advanced")) {
      analytics = stripAdvancedAnalytics(analytics);
    }

    res.json({ post, ...analytics });
  } catch (err) {
    console.error("GET /api/posts/:id/analytics error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/:id/force-sync — Force re-sync post to Shopify ────────────
router.post("/:id/force-sync", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });
    if (!isFeatureEnabled(shop.planKey, "sync_actions")) {
      return res.status(403).json({ error: "Force Sync is available on Starter and above. Please upgrade to use this feature." });
    }

    const post = await prisma.post.findFirst({
      where: { id: parseInt(req.params.id), shopId: shop.id },
      include: { shopifyArticle: true, tags: { include: { tag: true } } },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });
    if (!post.shopifyArticle?.shopifyBlogId) {
      return res.status(400).json({ error: "Post is not linked to a Shopify blog" });
    }

    const result = await ArticleSyncService.pushPostToShopify(post.id, {
      publishMode: post.status === "published",
    });

    res.json({ success: true, syncedAt: result.syncedAt });
  } catch (err) {
    console.error("POST /api/posts/:id/force-sync error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/reconcile — Reconcile sync state for all linked posts ────
router.post("/reconcile", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });
    if (!isFeatureEnabled(shop.planKey, "sync_actions")) {
      return res.status(403).json({ error: "Bulk reconcile is available on Starter and above. Please upgrade to use this feature." });
    }

    const linkedPosts = await prisma.post.findMany({
      where: {
        shopId: shop.id,
        shopifyArticle: { isNot: null },
      },
      include: { shopifyArticle: true },
      take: 50,
    });

    const results = [];
    for (const post of linkedPosts) {
      try {
        const result = await ArticleSyncService.reconcilePost(post.id);
        results.push({ postId: post.id, title: post.title, status: result.status });
      } catch (err) {
        results.push({ postId: post.id, title: post.title, status: "error", error: err.message });
      }
    }

    res.json({ results });
  } catch (err) {
    console.error("POST /api/posts/reconcile error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/bulk-resync — Force re-sync every linked post to Shopify ──
// Pushes current app content for every post already linked to a Shopify blog — the one-time
// catch-up mechanism for features that bake into body_html at sync time (e.g. Related posts)
// rather than applying live, so already-published posts pick them up without editing each one
// by hand. Sequential (not Promise.all) to stay well under Shopify's Admin API rate limits when
// a shop has many posts.
router.post("/bulk-resync", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });
    if (!isFeatureEnabled(shop.planKey, "sync_actions")) {
      return res.status(403).json({ error: "Bulk re-sync is available on Starter and above. Please upgrade to use this feature." });
    }

    const linkedPosts = await prisma.post.findMany({
      where: {
        shopId: shop.id,
        shopifyArticle: { is: { shopifyBlogId: { not: null } } },
      },
      select: { id: true, title: true, status: true },
    });

    const results = [];
    for (const post of linkedPosts) {
      try {
        await ArticleSyncService.pushPostToShopify(post.id, { publishMode: post.status === "published" });
        results.push({ postId: post.id, title: post.title, status: "synced" });
      } catch (err) {
        results.push({ postId: post.id, title: post.title, status: "error", error: err.message });
      }
    }

    res.json({ results });
  } catch (err) {
    console.error("POST /api/posts/bulk-resync error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/conflicts — List all posts with unresolved conflicts ─────
router.get("/conflicts", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const conflictPosts = await prisma.post.findMany({
      where: {
        shopId: shop.id,
        shopifyArticle: {
          syncState: "conflict",
        },
      },
      include: {
        shopifyArticle: true,
        tags: { include: { tag: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    res.json({ conflicts: conflictPosts.map(serializePost) });
  } catch (err) {
    console.error("GET /api/posts/conflicts error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/:id/conflict-diff — Fetch local vs remote diff ────────────
router.get("/:id/conflict-diff", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const post = await prisma.post.findFirst({
      where: { id: parseInt(req.params.id), shopId: shop.id },
      include: {
        shopifyArticle: true,
        tags: { include: { tag: true } },
      },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });
    if (!post.shopifyArticle) return res.status(404).json({ error: "Post not linked to Shopify" });

    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "No session" });

    const client = new shopify.api.clients.Graphql({ session });
    const remote = await ArticleSyncService.fetchArticleByGid(client, post.shopifyArticle.shopifyArticleId);
    if (!remote) {
      return res.status(404).json({ error: "Article not found on Shopify" });
    }

    const remoteTags = (remote.tags || "").split(",").map(t => t.trim()).filter(Boolean);
    const localTags = (post.tags || []).map(pt => pt.tag?.name).filter(Boolean);

    const diff = {
      title: {
        local: post.title,
        remote: remote.title,
        changed: post.title !== remote.title,
      },
      status: {
        local: post.status,
        remote: remote.published_at ? "published" : "draft",
        changed: (post.status === "published") !== !!remote.published_at,
      },
      author: {
        local: post.author || "",
        remote: remote.author || "",
        changed: (post.author || "") !== (remote.author || ""),
      },
      tags: {
        local: localTags,
        remote: remoteTags,
        changed: JSON.stringify([...localTags].sort()) !== JSON.stringify([...remoteTags].sort()),
      },
      featuredImage: {
        local: post.featuredImage || null,
        remote: remote.image?.src || null,
        changed: (post.featuredImage || null) !== (remote.image?.src || null),
      },
      contentHtml: {
        local: post.contentHtml || "",
        remote: remote.body_html || "",
        changed: (post.contentHtml || "") !== (remote.body_html || ""),
        type: "html",
      },
      updatedAt: {
        local: post.updatedAt,
        remote: remote.updated_at,
      },
    };

    res.json({ diff, postId: post.id, title: post.title });
  } catch (err) {
    console.error("GET /api/posts/:id/conflict-diff error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/:id/resolve-conflict — Resolve a sync conflict (field-level) ─
router.post("/:id/resolve-conflict", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });
    if (!isFeatureEnabled(shop.planKey, "sync_actions")) {
      return res.status(403).json({ error: "Conflict resolution is available on Starter and above. Please upgrade to use this feature." });
    }

    const { resolutions } = req.body;
    if (!resolutions || typeof resolutions !== "object") {
      return res.status(422).json({ error: "resolutions must be an object with field names as keys" });
    }

    const post = await prisma.post.findFirst({
      where: { id: parseInt(req.params.id), shopId: shop.id },
      include: {
        shopifyArticle: true,
        tags: { include: { tag: true } },
        shop: true,
      },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });
    if (!post.shopifyArticle || post.shopifyArticle.syncState !== "conflict") {
      return res.status(400).json({ error: "Post is not in conflict state" });
    }

    for (const [field, choice] of Object.entries(resolutions)) {
      if (!["local", "remote"].includes(choice)) {
        return res.status(422).json({
          error: `Resolution for "${field}" must be 'local' or 'remote'`,
        });
      }
    }

    const conflictPayload = post.shopifyArticle.conflictPayload;
    if (!conflictPayload?.fields) {
      return res.status(400).json({ error: "No conflict payload found for this post" });
    }

    const session = await shopify.config.sessionStorage.findSessionsByShop(post.shop.domain);
    const validSession = session?.find(s => s.accessToken);
    if (!validSession) return res.status(401).json({ error: "No active Shopify session" });

    const client = new shopify.api.clients.Graphql({ session: validSession });
    const remote = await ArticleSyncService.fetchArticleByGid(client, post.shopifyArticle.shopifyArticleId);
    if (!remote) return res.status(404).json({ error: "Article not found on Shopify" });

    const localTags = await prisma.postTag.findMany({
      where: { postId: post.id },
      include: { tag: true },
    });
    const localTagStr = localTags.map(pt => pt.tag?.name).filter(Boolean).sort().join(",");

    const localState = ArticleSyncService.normalizeLocalState(post, localTagStr);
    const remoteState = ArticleSyncService.normalizeRemoteState(remote);
    const resolvedLocal = { ...localState };

    for (const field of ["title", "author", "status", "tags", "featuredImage"]) {
      if (resolutions[field] === "remote") {
        resolvedLocal[field] = remoteState[field];
      }
    }

    let needsContentParse = false;
    if (resolutions.content === "remote") {
      needsContentParse = true;
    }

    const postUpdate = {
      title: resolvedLocal.title,
      status: resolvedLocal.status === "published" ? "published" : "draft",
      author: resolvedLocal.author || null,
      featuredImage: resolvedLocal.featuredImage || null,
      slug: remote.handle || post.slug,
      publishedAt: remote.published_at ? new Date(remote.published_at) : null,
    };

    if (needsContentParse) {
      const parsed = ShopifyArticleParser.parse(remote.body_html || "");
      postUpdate.contentHtml = parsed.rawEditorHtml || remote.body_html || "";
      postUpdate.contentJson = parsed.blocks;
    }

    await prisma.post.update({
      where: { id: post.id },
      data: postUpdate,
    });

    if (resolutions.tags === "remote") {
      const remoteTagNames = (remote.tags || "").split(",").map(t => t.trim()).filter(Boolean);
      await prisma.postTag.deleteMany({ where: { postId: post.id } });
      for (const tagName of remoteTagNames) {
        const slug = tagName.toLowerCase().replace(/\s+/g, "-");
        const tagRec = await prisma.tag.upsert({
          where: { shopId_slug: { shopId: shop.id, slug } },
          create: { shopId: shop.id, name: tagName, slug },
          update: {},
        });
        await prisma.postTag.upsert({
          where: { postId_tagId: { postId: post.id, tagId: tagRec.id } },
          create: { postId: post.id, tagId: tagRec.id },
          update: {},
        });
      }
    }

    const result = await ArticleSyncService.pushPostToShopify(post.id, {
      publishMode: postUpdate.status === "published",
    });

    await ArticleSyncService.logSyncEvent({
      shopId: shop.id,
      postId: post.id,
      shopifyArticleId: post.shopifyArticle.shopifyArticleId,
      direction: "app_to_shopify",
      eventType: "resolve",
      status: "applied",
      message: `Field-level conflict resolved for "${post.title}": ${Object.entries(resolutions).map(([f, c]) => `${f}=${c}`).join(", ")}`,
    });

    res.json({
      success: true,
      resolutions,
      message: `Resolved ${Object.keys(resolutions).length} field(s) for "${post.title}"`,
      syncedAt: result.syncedAt,
    });
  } catch (err) {
    console.error("POST /api/posts/:id/resolve-conflict error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/sync-logs — Fetch sync history for a post ────────────────
router.get("/sync-logs", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const { postId, limit = 50 } = req.query;

    const where = { shopId: shop.id };
    if (postId) where.postId = parseInt(postId);

    const logs = await prisma.articleSyncLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: parseInt(limit),
    });

    res.json({ logs });
  } catch (err) {
    console.error("GET /api/posts/sync-logs error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/:id/sync-status — Lightweight sync state for editor polling ─
router.get("/:id/sync-status", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ error: "Post not found" });

    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const current = await prisma.shopifyArticle.findUnique({
      where: { postId: id },
      select: { shopifyArticleId: true, shopifyBlogId: true },
    });

    if (current?.shopifyArticleId && current?.shopifyBlogId) {
      await ArticleSyncService.pollReconcilePost(id);
    }

    const shopifyArticle = await prisma.shopifyArticle.findUnique({
      where: { postId: id },
      select: {
        status: true,
        syncState: true,
        syncMode: true,
        lastSyncDirection: true,
        syncedAt: true,
        structureDegraded: true,
        lastError: true,
        shopifyArticleId: true,
        shopifyBlogId: true,
      },
    });

    if (!shopifyArticle) {
      return res.json({ shopifyArticle: null });
    }

    res.json({ shopifyArticle });
  } catch (err) {
    console.error("GET /api/posts/:id/sync-status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/:id — Get single post ─────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    // Skip if :id looks like a named path segment (not a numeric ID)
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ error: "Post not found" });

    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const post = await prisma.post.findFirst({
      where: { id, shopId: shop.id },
      include: {
        category: true,
        tags: { include: { tag: true } },
        products: { include: { product: true }, orderBy: { position: "asc" } },
        relatedPosts: { include: { relatedPost: true }, orderBy: { position: "asc" } },
        shopifyArticle: true,
        blocks: { orderBy: { orderIndex: "asc" } },
      },
    });

    if (!post) return res.status(404).json({ error: "Post not found" });

    const features = getFeaturesForPlan(shop.planKey);
    const serialized = serializePost(post);

    // Generate JSON-LD schema for the post
    const jsonLd = req.query.include_schema !== "false"
      ? JsonLdService.renderPostSchema(serialized, shop.domain)
      : null;

    res.json({ post: { ...serialized, jsonLd }, features });
  } catch (err) {
    console.error("GET /api/posts/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

async function syncTranslationToShopify(postId, translation, session) {
  try {
    const shopifyArticle = await prisma.shopifyArticle.findUnique({
      where: { postId: postId },
    });
    
    if (!shopifyArticle || !shopifyArticle.shopifyArticleId) {
      // The article has not been synced to Shopify yet, so we cannot translate it.
      return;
    }

    const articleGid = `gid://shopify/Article/${shopifyArticle.shopifyArticleId}`;
    const graphqlClient = new shopify.api.clients.Graphql({ session });

    // Step 1: Fetch translatable resources to get the digests
    const queryRes = await graphqlClient.request(`
      query GetTranslatableResource($resourceId: ID!) {
        translatableResource(resourceId: $resourceId) {
          resourceId
          translatableContent {
            key
            value
            digest
            locale
          }
        }
      }
    `, { variables: { resourceId: articleGid } });

    const translatableContent = queryRes.data?.translatableResource?.translatableContent || [];
    const getDigest = (key) => translatableContent.find(c => c.key === key)?.digest;
    
    console.log(`[TranslationSync] Translatable content keys for ${articleGid}:`, translatableContent.map(c => c.key));

    const translationsInput = [];
    
    const pushField = (key, val) => {
      const digest = getDigest(key);
      if (digest && val) {
        translationsInput.push({
          key,
          value: val,
          locale: translation.locale,
          translatableContentDigest: digest,
        });
      }
    };

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        shop: true,
        products: { include: { product: true }, orderBy: { position: "asc" } },
      },
    });

    let translatedStorefrontHtml = translation.contentHtml || "";
    if (post) {
      translatedStorefrontHtml = await ArticleSyncService.buildStorefrontHtmlForPost(
        post, 
        translation.contentHtml || "", 
        session, 
        graphqlClient
      );
    }

    pushField("title", translation.title);
    pushField("body_html", translatedStorefrontHtml);
    pushField("summary_html", translation.excerpt);
    pushField("meta_title", translation.metaTitle);
    pushField("meta_description", translation.metaDescription);
    // Note: 'handle' translations are not managed by our UI currently.

    if (translationsInput.length === 0) {
      console.log("[TranslationSync] No translations to sync (empty input)");
      return;
    }
    
    console.log(`[TranslationSync] Sending ${translationsInput.length} fields to Shopify:`, translationsInput.map(t => t.key));

    // Step 2: Register translations
    const mutationRes = await graphqlClient.request(`
      mutation registerTranslations($resourceId: ID!, $translations: [TranslationInput!]!) {
        translationsRegister(resourceId: $resourceId, translations: $translations) {
          userErrors {
            field
            message
          }
        }
      }
    `, { variables: { resourceId: articleGid, translations: translationsInput } });

    const errors = mutationRes.data?.translationsRegister?.userErrors;
    if (errors && errors.length > 0) {
      console.error("[TranslationSync] translationsRegister errors:", errors);
    }
  } catch (err) {
    console.error("[TranslationSync] Error syncing translation to Shopify:", err.message);
  }
}

// ─── Translations API Routes ───────────────────────────────────────────────
router.get("/:id/translations", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const translations = await prisma.postTranslation.findMany({
      where: { postId: parseInt(req.params.id) },
    });
    res.json({ translations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/translations", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const postId = parseInt(req.params.id);
    const { locale, title, excerpt, contentHtml, metaTitle, metaDescription } = req.body;

    if (!locale) return res.status(422).json({ error: "Locale is required" });
    if (!isFeatureEnabled(shop.planKey, "translations")) {
      return res.status(403).json({ error: "Translations are available on the Pro plan. Please upgrade to translate this article." });
    }

    const translation = await prisma.postTranslation.upsert({
      where: { postId_locale: { postId, locale } },
      create: { postId, locale, title, excerpt, contentHtml, metaTitle, metaDescription },
      update: { title, excerpt, contentHtml, metaTitle, metaDescription },
    });

    const session = res.locals.shopify?.session;
    if (session) {
      await syncTranslationToShopify(postId, translation, session);
    }

    res.json({ success: true, translation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/translate-auto", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const postId = parseInt(req.params.id);
    const { locale } = req.body;
    if (!locale) return res.status(422).json({ error: "Locale is required" });
    if (!isFeatureEnabled(shop.planKey, "translations")) {
      return res.status(403).json({ error: "Auto-translate is available on the Pro plan. Please upgrade to use this feature." });
    }

    const post = await prisma.post.findFirst({
      where: { id: postId, shopId: shop.id },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const sourceData = {
      title: post.title || "",
      excerpt: post.excerpt || "",
      contentHtml: post.contentHtml || "",
      metaTitle: post.metaTitle || post.title || "",
      metaDescription: post.metaDescription || post.excerpt || "",
    };

    const translateScriptPath = path.join(__dirname, "../../../translate.py");

    const pythonProcess = spawn("python3", [translateScriptPath, locale]);

    let outputData = "";
    let errorData = "";

    pythonProcess.stdout.on("data", (data) => {
      outputData += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      errorData += data.toString();
    });

    pythonProcess.stdin.write(JSON.stringify(sourceData));
    pythonProcess.stdin.end();

    await new Promise((resolve, reject) => {
      pythonProcess.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}: ${errorData}`));
        } else {
          resolve();
        }
      });
    });

    const parsedOutput = JSON.parse(outputData.trim());

    if (parsedOutput.success === false) {
      throw new Error(parsedOutput.message || "Translation failed inside Python script");
    }

    const translation = await prisma.postTranslation.upsert({
      where: { postId_locale: { postId, locale } },
      create: { 
        postId, 
        locale, 
        title: parsedOutput.title || null, 
        excerpt: parsedOutput.excerpt || null, 
        contentHtml: parsedOutput.contentHtml || null, 
        metaTitle: parsedOutput.metaTitle || null, 
        metaDescription: parsedOutput.metaDescription || null 
      },
      update: { 
        title: parsedOutput.title || null, 
        excerpt: parsedOutput.excerpt || null, 
        contentHtml: parsedOutput.contentHtml || null, 
        metaTitle: parsedOutput.metaTitle || null, 
        metaDescription: parsedOutput.metaDescription || null 
      },
    });

    const session = res.locals.shopify?.session;
    if (session) {
      await syncTranslationToShopify(postId, translation, session);
    }

    res.json({ success: true, translation });
  } catch (err) {
    console.error("POST /:id/translate-auto error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

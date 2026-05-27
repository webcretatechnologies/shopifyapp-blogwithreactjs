import express from "express";
import { PrismaClient } from "@prisma/client";
import shopify from "../../shopify.js";
import * as cheerio from "cheerio";
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

    const client = new shopify.api.clients.Rest({ session });
    const response = await client.get({ path: "blogs" });
    const blogs = response.body?.blogs || [];

    res.json({ blogs: blogs.map((b) => ({ id: b.id, title: b.title, handle: b.handle })) });
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

    const client = new shopify.api.clients.Rest({ session });
    const response = await client.get({ path: `blogs/${blog_id}/articles` });
    const articles = response.body?.articles || [];

    // Check which ones are already imported
    const importedIds = await prisma.shopifyArticle.findMany({
      where: { shopifyArticleId: { in: articles.map((a) => String(a.id)) } },
      select: { shopifyArticleId: true },
    });
    const importedSet = new Set(importedIds.map((r) => r.shopifyArticleId));

    res.json({
      articles: articles.map((a) => ({
        id: a.id,
        title: a.title,
        author: a.author,
        published_at: a.published_at,
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

    // Enforce Plan Limits
    const limit = getArticleLimit(shop.planKey);
    if (limit !== null) {
      const count = await prisma.post.count({ where: { shopId: shop.id } });
      if (count >= limit) {
        return res.status(403).json({ error: `Article limit reached. Please upgrade your plan.` });
      }
    }

    // Fetch from Shopify
    const client = new shopify.api.clients.Rest({ session });
    const response = await client.get({ path: `blogs/${blog_id}/articles/${article_id}` });
    const shopifyArticle = response.body?.article;
    if (!shopifyArticle) return res.status(404).json({ error: "Article not found on Shopify" });

    // Parse HTML to JSON blocks
    const html = shopifyArticle.body_html || "";
    let blocks = [];

    if (html) {
      const $ = cheerio.load(html);
      
      const extractBlocks = (element) => {
        const name = element.tagName;
        const $el = $(element);

        // Custom App block data
        if ($el.attr("data-blog-app-block") !== undefined) {
          try {
            const dataStr = $el.attr("data-blog-app-data");
            const parsed = JSON.parse(dataStr);
            if (parsed) {
              parsed.id = Date.now().toString(36) + Math.random().toString(36).substr(2);
              blocks.push(parsed);
              return;
            }
          } catch(e) { }
        }

        if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(name)) {
          blocks.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            type: "heading",
            level: parseInt(name.substring(1)),
            data: $el.text().trim(),
          });
        } else if (name === "p") {
          const text = $el.html()?.trim();
          if (text) {
            blocks.push({
              id: Date.now().toString(36) + Math.random().toString(36).substr(2),
              type: "text",
              data: text,
              isHtml: true,
            });
          }
        } else if (name === "ul" || name === "ol") {
          const items = [];
          $el.children("li").each((_, li) => {
            const txt = $(li).html()?.trim();
            if (txt) items.push(txt);
          });
          if (items.length) {
            blocks.push({
              id: Date.now().toString(36) + Math.random().toString(36).substr(2),
              type: "list",
              listType: name,
              items,
            });
          }
        } else if (name === "img") {
          const src = $el.attr("src");
          if (src) {
            blocks.push({
              id: Date.now().toString(36) + Math.random().toString(36).substr(2),
              type: "image",
              url: src,
              alt: $el.attr("alt") || "",
              data: "",
            });
          }
        } else if (name === "hr") {
          blocks.push({
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            type: "divider",
            data: "",
          });
        } else if (name === "table") {
           const headers = [];
           const rows = [];
           $el.find("thead th, thead td").each((_, th) => headers.push($(th).text().trim()));
           $el.find("tbody tr, tr").each((_, tr) => {
             const row = [];
             $(tr).find("td, th").each((_, td) => {
               if ($(td).closest("thead").length === 0) {
                 row.push($(td).text().trim());
               }
             });
             if (row.length) rows.push(row);
           });
           if (headers.length || rows.length) {
             blocks.push({
               id: Date.now().toString(36) + Math.random().toString(36).substr(2),
               type: "table",
               headers,
               rows,
             });
           }
        } else if (name === "div" || name === "span" || name === "section") {
           // Recursively check children
           $el.children().each((_, child) => extractBlocks(child));
        }
      };

      $("body").children().each((_, el) => extractBlocks(el));
    }

    if (blocks.length === 0) {
      blocks = [{ id: Date.now().toString(36), type: "text", data: "" }];
    }

    const postData = {
      shopId: shop.id,
      title: shopifyArticle.title,
      slug: generateSlug(shopifyArticle.title),
      contentJson: blocks,
      contentHtml: shopifyArticle.body_html || "",
      status: shopifyArticle.published_at ? "published" : "draft",
      publishedAt: shopifyArticle.published_at ? new Date(shopifyArticle.published_at) : null,
      featuredImage: shopifyArticle.image?.src || null,
      author: shopifyArticle.author || null,
      productSliderPosition: "none",
    };

    const post = await prisma.post.create({ data: postData });

    // Process Tags
    if (shopifyArticle.tags) {
       const tagNames = shopifyArticle.tags.split(",").map(t => t.trim()).filter(Boolean);
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

    // Parse the body HTML into editor blocks using the ShopifyArticleParser
    const parsed = ShopifyArticleParser.parse(shopifyArticle.body_html || "");

    // Build normalized remote state and initial baseline for proper 2-way sync
    const remoteState = ArticleSyncService.normalizeRemoteState(shopifyArticle);
    remoteState.content.editorHtml = parsed.rawEditorHtml || shopifyArticle.body_html || "";
    remoteState.content.contentJson = parsed.blocks;

    const initialBaseline = ArticleSyncService.buildBaselineSnapshot(
      remoteState,
      shopifyArticle.body_html || "",
      1
    );

    // Link to ShopifyArticle with proper sync tracking
    await prisma.shopifyArticle.create({
      data: {
        postId: post.id,
        shopifyArticleId: String(shopifyArticle.id),
        shopifyBlogId: String(blog_id),
        status: post.status,
        syncedAt: new Date(),
        syncState: "in_sync",
        syncMode: "external_html",
        lastSyncDirection: "shopify_to_app",
        lastInboundHash: ArticleSyncService.computeContentHash(shopifyArticle),
        lastRemoteUpdatedAt: shopifyArticle.updated_at ? new Date(shopifyArticle.updated_at) : null,
        structureDegraded: parsed.structureDegraded,
        syncRevision: 1,
        lastSyncedSnapshot: initialBaseline,
      }
    });

    await ArticleSyncService.logSyncEvent({
      shopId: shop.id,
      postId: post.id,
      shopifyArticleId: String(shopifyArticle.id),
      direction: "shopify_to_app",
      eventType: "import",
      status: "applied",
      message: `Imported article "${shopifyArticle.title}" from Shopify blog ${blog_id}`,
    });

    res.json({ success: true, post_id: post.id });
  } catch (err) {
    console.error("POST /api/import/execute error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

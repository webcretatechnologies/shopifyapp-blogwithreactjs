import express from "express";
import { PrismaClient } from "@prisma/client";
import shopify from "../../shopify.js";
import ArticleTemplates from "../services/ArticleTemplates.js";
import BlockRenderer from "../services/BlockRenderer.js";
import { getArticleLimit } from "../services/PlanFeatureService.js";

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

// GET /api/wizard/templates
router.get("/templates", async (req, res) => {
  try {
    res.json({ templates: ArticleTemplates.all() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/wizard/create
router.post("/create", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    const shop = await getShopFromSession(res);
    if (!session || !shop) return res.status(401).json({ error: "Unauthorized" });

    // Enforce Plan Limits
    const limit = getArticleLimit(shop.planKey);
    if (limit !== null) {
      const count = await prisma.post.count({ where: { shopId: shop.id } });
      if (count >= limit) {
        return res.status(403).json({ error: `Article limit reached. Please upgrade your plan.` });
      }
    }

    const { template_id, title, blog_id, author, vendor, featured_image, image1, image2, tags = [] } = req.body;

    if (!template_id || !title) {
      return res.status(400).json({ error: "template_id and title are required" });
    }

    const blocks = ArticleTemplates.blocks(template_id, { title, image1, image2 });
    
    const contentHtml = BlockRenderer.render(blocks, shop.domain, { product_slider_position: "none" });

    const post = await prisma.post.create({
      data: {
        shopId: shop.id,
        title,
        slug: generateSlug(title),
        contentJson: blocks,
        contentHtml,
        status: "draft",
        author: author || null,
        vendor: vendor || null,
        featuredImage: featured_image || null,
        productSliderPosition: "none",
      }
    });

    // Process Tags
    if (tags && tags.length > 0) {
       for (const tagName of tags) {
          const slug = tagName.toLowerCase().replace(/\s+/g, "-");
          const tagRec = await prisma.tag.upsert({
            where: { shopId_slug: { shopId: shop.id, slug } },
            create: { shopId: shop.id, name: tagName, slug },
            update: {},
          });
          await prisma.postTag.create({ data: { postId: post.id, tagId: tagRec.id } });
       }
    }

    if (blog_id) {
       await prisma.shopifyArticle.create({
         data: {
           postId: post.id,
           shopifyBlogId: String(blog_id),
           status: "draft",
           syncedAt: null,
         }
       });
    }

    res.json({ success: true, post_id: post.id });
  } catch (err) {
    console.error("POST /api/wizard/create error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

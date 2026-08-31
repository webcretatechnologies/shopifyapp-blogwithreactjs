import express from "express";
import crypto from "crypto";
import { getBlogTemplateSummaries, getBlogTemplateByKey, isTemplateFree } from "../data/blogTemplates.js";
import { isFeatureEnabled, getSavedTemplateLimit } from "../services/PlanFeatureService.js";
import { prisma } from "../../shopify.js";

const router = express.Router();

// How many templates a shop may keep is plan-based (PlanFeatureService's "template_limit":
// Free 2, Starter 5, Pro and above unlimited) rather than one hardcoded ceiling for everyone.
const countSavedTemplates = (shopId) =>
  prisma.template.count({ where: { shopId, source: "shop", isActive: true } });

const planLabel = (planKey) => {
  const p = String(planKey || "free").toLowerCase();
  if (p.includes("starter")) return "Starter";
  if (p.includes("business")) return "Business";
  if (p.includes("pro")) return "Pro";
  return "Free";
};

async function getShopFromSession(res) {
  const session = res.locals.shopify?.session;
  if (!session?.shop) return null;
  return prisma.shop.findUnique({ where: { domain: session.shop } });
}

function shopTemplateSummary(row) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description || "",
    category: row.category || "Yours",
    accent: row.accent || "#303030",
    badge: null,
    style: {
      accent: row.accent || "#303030",
      tocBg: row.accent || "#303030",
      tocFg: "#ffffff",
      headingFont: "sans",
    },
    preview: row.preview || { hero: "gradient", toc: true, columns: 1, products: 0, steps: 0 },
    // Included so "Your templates" cards render the same real, scrollable preview.
    blocks: Array.isArray(row.blocks) ? row.blocks : [],
    source: "shop",
  };
}

// GET /api/blog-templates
router.get("/", (req, res) => {
  res.json({ templates: getBlogTemplateSummaries() });
});

// Shop-saved templates — registered before /:key so "mine" is not treated as a library key.
router.get("/mine", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });
    const rows = await prisma.template.findMany({
      where: { shopId: shop.id, source: "shop", isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    const limit = getSavedTemplateLimit(shop.planKey);
    res.json({
      templates: rows.map(shopTemplateSummary),
      // Usage travels with the list so the gallery can show "3 of 5 saved" without a second call.
      count: rows.length,
      limit: limit ?? null,
      plan: planLabel(shop.planKey),
    });
  } catch (err) {
    console.error("GET /api/blog-templates/mine", err);
    res.status(500).json({ error: "Failed to load saved templates" });
  }
});

router.get("/mine/:id", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id, 10);
    const row = await prisma.template.findFirst({
      where: { id, shopId: shop.id, source: "shop", isActive: true },
    });
    if (!row) return res.status(404).json({ error: "Template not found" });
    res.json({ template: { ...shopTemplateSummary(row), blocks: row.blocks } });
  } catch (err) {
    console.error("GET /api/blog-templates/mine/:id", err);
    res.status(500).json({ error: "Failed to load template" });
  }
});

router.post("/mine", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });
    const name = String(req.body?.name || "").trim();
    const blocks = req.body?.blocks;
    if (!name) return res.status(400).json({ error: "Name is required" });
    if (!Array.isArray(blocks) || blocks.length === 0) {
      return res.status(400).json({ error: "Add some content before saving a template." });
    }
    const limit = getSavedTemplateLimit(shop.planKey);
    const count = await countSavedTemplates(shop.id);
    if (limit != null && count >= limit) {
      return res.status(403).json({
        error: `Your ${planLabel(shop.planKey)} plan can keep ${limit} saved template${limit === 1 ? "" : "s"}. Delete one, or upgrade to save more.`,
        code: "template_limit_reached",
        count,
        limit,
      });
    }
    const row = await prisma.template.create({
      data: {
        key: `shop_${shop.id}_${crypto.randomBytes(6).toString("hex")}`,
        name: name.slice(0, 80),
        description: String(req.body?.description || "").slice(0, 240) || null,
        blocks,
        source: "shop",
        shopId: shop.id,
        accent: req.body?.accent || "#303030",
        category: req.body?.category || "Yours",
        preview: req.body?.preview || { hero: "gradient", toc: true },
        isActive: true,
      },
    });
    res.json({ template: shopTemplateSummary(row), count: count + 1, limit: limit ?? null });
  } catch (err) {
    console.error("POST /api/blog-templates/mine", err);
    res.status(500).json({ error: "Failed to save template" });
  }
});

router.delete("/mine/:id", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });
    const id = parseInt(req.params.id, 10);
    const row = await prisma.template.findFirst({
      where: { id, shopId: shop.id, source: "shop" },
    });
    if (!row) return res.status(404).json({ error: "Template not found" });
    await prisma.template.delete({ where: { id: row.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/blog-templates/mine/:id", err);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

// GET /api/blog-templates/:key
router.get("/:key", async (req, res) => {
  const template = getBlogTemplateByKey(req.params.key);
  if (!template) return res.status(404).json({ error: "Template not found" });

  if (!isTemplateFree(req.params.key)) {
    const shop = await getShopFromSession(res);
    if (!isFeatureEnabled(shop?.planKey, "templates_premium")) {
      return res.status(403).json({ error: "This template is available on Starter and above. Please upgrade to use it." });
    }
  }

  res.json({ template });
});

export default router;

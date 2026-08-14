import express from "express";
import { getBlogTemplateSummaries, getBlogTemplateByKey, isTemplateFree } from "../data/blogTemplates.js";
import { isFeatureEnabled } from "../services/PlanFeatureService.js";
import { prisma } from "../../shopify.js";

const router = express.Router();

// GET /api/blog-templates
// Lightweight list (no block trees) for the template picker gallery. Always returns every
// template with a `tier` annotation — the frontend shows a lock badge on "paid" ones rather than
// hiding them, so Free merchants can see what upgrading unlocks.
router.get("/", (req, res) => {
  res.json({ templates: getBlogTemplateSummaries() });
});

// GET /api/blog-templates/:key
// Full block tree for a single template, applied to a new post. Free templates are always
// available; premium ones require templates_premium.
router.get("/:key", async (req, res) => {
  const template = getBlogTemplateByKey(req.params.key);
  if (!template) return res.status(404).json({ error: "Template not found" });

  if (!isTemplateFree(req.params.key)) {
    const session = res.locals.shopify?.session;
    const shop = session ? await prisma.shop.findUnique({ where: { domain: session.shop } }) : null;
    if (!isFeatureEnabled(shop?.planKey, "templates_premium")) {
      return res.status(403).json({ error: "This template is available on Starter and above. Please upgrade to use it." });
    }
  }

  res.json({ template });
});

export default router;

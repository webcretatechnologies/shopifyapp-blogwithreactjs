import express from "express";
import { getBlogTemplateSummaries, getBlogTemplateByKey } from "../data/blogTemplates.js";

const router = express.Router();

// GET /api/blog-templates
// Lightweight list (no block trees) for the template picker gallery.
router.get("/", (req, res) => {
  res.json({ templates: getBlogTemplateSummaries() });
});

// GET /api/blog-templates/:key
// Full block tree for a single template, applied to a new post.
router.get("/:key", (req, res) => {
  const template = getBlogTemplateByKey(req.params.key);
  if (!template) return res.status(404).json({ error: "Template not found" });
  res.json({ template });
});

export default router;

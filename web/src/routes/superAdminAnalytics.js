import express from "express";
import { PrismaClient } from "@prisma/client";
import { validateSuperAdmin } from "./superAdmin.js";
import { buildAnalyticsPayload, resolveRange } from "../services/AnalyticsTrackingService.js";

const router = express.Router();
const prisma = new PrismaClient();

function parseRangeQuery(req) {
  const { from, to } = req.query;
  if (from && to) return resolveRange({ from, to });
  return resolveRange(90);
}

// ─── GET /admin-api/analytics/overview — Platform-wide traffic/revenue trend ──
// Reuses buildAnalyticsPayload with no shopId filter — same aggregation core the merchant-facing
// analytics page uses, just summed across every shop at once.
router.get("/analytics/overview", validateSuperAdmin, async (req, res) => {
  try {
    const range = parseRangeQuery(req);
    const payload = await buildAnalyticsPayload({}, range);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/analytics/top-shops — Ranks shops by traffic in range ─────
router.get("/analytics/top-shops", validateSuperAdmin, async (req, res) => {
  try {
    const { since, until } = parseRangeQuery(req);
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

    const grouped = await prisma.postAnalytic.groupBy({
      by: ["postId"],
      where: { date: { gte: since, lt: until } },
      _sum: { views: true, conversions: true, revenue: true },
    });

    if (grouped.length === 0) return res.json({ shops: [], from: since.toISOString().split("T")[0], to: until.toISOString().split("T")[0] });

    const postIds = grouped.map((g) => g.postId);
    const posts = await prisma.post.findMany({
      where: { id: { in: postIds } },
      select: { id: true, shopId: true },
    });
    const postToShop = new Map(posts.map((p) => [p.id, p.shopId]));

    const byShop = new Map();
    grouped.forEach((g) => {
      const shopId = postToShop.get(g.postId);
      if (!shopId) return;
      const acc = byShop.get(shopId) || { shopId, views: 0, conversions: 0, revenue: 0 };
      acc.views += g._sum.views || 0;
      acc.conversions += g._sum.conversions || 0;
      acc.revenue += g._sum.revenue || 0;
      byShop.set(shopId, acc);
    });

    const shopIds = [...byShop.keys()];
    const shops = await prisma.shop.findMany({
      where: { id: { in: shopIds } },
      select: { id: true, domain: true },
    });
    const domainMap = new Map(shops.map((s) => [s.id, s.domain]));

    const ranked = [...byShop.values()]
      .map((s) => ({ ...s, domain: domainMap.get(s.shopId) || "Unknown" }))
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);

    res.json({ shops: ranked, from: since.toISOString().split("T")[0], to: until.toISOString().split("T")[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/analytics/top-posts — Ranks posts by views, platform-wide ─
router.get("/analytics/top-posts", validateSuperAdmin, async (req, res) => {
  try {
    const { since, until } = parseRangeQuery(req);
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

    const grouped = await prisma.postAnalytic.groupBy({
      by: ["postId"],
      where: { date: { gte: since, lt: until } },
      _sum: { views: true, addToCart: true, checkouts: true, conversions: true, revenue: true },
      orderBy: { _sum: { views: "desc" } },
      take: limit,
    });

    const postIds = grouped.map((g) => g.postId);
    const details = await prisma.post.findMany({
      where: { id: { in: postIds } },
      select: { id: true, title: true, slug: true, shop: { select: { domain: true } } },
    });
    const detailMap = new Map(details.map((d) => [d.id, d]));

    const posts = grouped.map((g) => {
      const d = detailMap.get(g.postId) || {};
      const views = g._sum.views || 0;
      return {
        id: g.postId,
        title: d.title || "Unknown",
        slug: d.slug || "",
        shopDomain: d.shop?.domain || "Unknown",
        views,
        conversions: g._sum.conversions || 0,
        revenue: g._sum.revenue || 0,
        conversionRate: views > 0 ? ((g._sum.conversions || 0) / views * 100).toFixed(2) : "0.00",
      };
    });

    res.json({ posts, from: since.toISOString().split("T")[0], to: until.toISOString().split("T")[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

import express from "express";
import { PrismaClient } from "@prisma/client";
import { validateSuperAdmin, SHOP_SAFE_SELECT } from "./superAdmin.js";
import { fetchUninstallEvents } from "../services/PartnerApiClient.js";

const router = express.Router();
const prisma = new PrismaClient();

// ─── GET /admin-api/growth/overview — Install/retention/churn KPIs ────────────
router.get("/growth/overview", validateSuperAdmin, async (req, res) => {
  try {
    const now = new Date();
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalInstalled, activeStores, payingStores, installs7d, uninstallsThisMonth] = await Promise.all([
      prisma.shop.count(),
      prisma.shop.count({ where: { uninstalledAt: null } }),
      prisma.shop.count({ where: { uninstalledAt: null, planKey: { not: "free" } } }),
      prisma.shop.count({ where: { installedAt: { gte: since7d } } }),
      prisma.shop.count({ where: { uninstalledAt: { gte: startOfMonth } } }),
    ]);

    const churnRatePct = activeStores + uninstallsThisMonth > 0
      ? Math.round((uninstallsThisMonth / (activeStores + uninstallsThisMonth)) * 1000) / 10
      : 0;

    const retentionWindows = [7, 30, 180];
    const retention = {};
    for (const days of retentionWindows) {
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const [cohortSize, stillActive] = await Promise.all([
        prisma.shop.count({ where: { installedAt: { lte: cutoff } } }),
        prisma.shop.count({ where: { installedAt: { lte: cutoff }, uninstalledAt: null } }),
      ]);
      retention[days] = cohortSize > 0 ? Math.round((stillActive / cohortSize) * 1000) / 10 : 0;
    }

    res.json({
      totalInstalled,
      activeStores,
      payingStores,
      installs7d,
      uninstallsThisMonth,
      churnRatePct,
      retention7: retention[7],
      retention30: retention[30],
      retention180: retention[180],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/growth/store-movement — Daily installs vs uninstalls ──────
router.get("/growth/store-movement", validateSuperAdmin, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 90, 366);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [installedRows, uninstalledRows] = await Promise.all([
      prisma.shop.findMany({ where: { installedAt: { gte: since } }, select: { installedAt: true } }),
      prisma.shop.findMany({ where: { uninstalledAt: { gte: since } }, select: { uninstalledAt: true } }),
    ]);

    const dailyMap = {};
    for (let i = 0; i <= days; i++) {
      const d = new Date(since);
      d.setUTCDate(d.getUTCDate() + i);
      dailyMap[d.toISOString().split("T")[0]] = { installs: 0, uninstalls: 0 };
    }
    installedRows.forEach((r) => {
      const key = r.installedAt.toISOString().split("T")[0];
      if (!dailyMap[key]) dailyMap[key] = { installs: 0, uninstalls: 0 };
      dailyMap[key].installs += 1;
    });
    uninstalledRows.forEach((r) => {
      const key = r.uninstalledAt.toISOString().split("T")[0];
      if (!dailyMap[key]) dailyMap[key] = { installs: 0, uninstalls: 0 };
      dailyMap[key].uninstalls += 1;
    });

    const daily = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({ date, ...d }));

    res.json({ daily });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/growth/recent-installs ─────────────────────────────────────
router.get("/growth/recent-installs", validateSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const shops = await prisma.shop.findMany({
      orderBy: { installedAt: "desc" },
      take: limit,
      select: SHOP_SAFE_SELECT,
    });
    res.json({ shops });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/growth/recent-uninstalls ───────────────────────────────────
router.get("/growth/recent-uninstalls", validateSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const shops = await prisma.shop.findMany({
      where: { uninstalledAt: { not: null } },
      orderBy: { uninstalledAt: "desc" },
      take: limit,
      select: SHOP_SAFE_SELECT,
    });
    res.json({ shops });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/growth/subscription-events — Labeled AppPlan history ──────
// AppPlan already gets a new row on every real subscription status change (see index.js's
// APP_SUBSCRIPTIONS_UPDATE webhook handler) — this derives human labels from that existing
// history rather than requiring new event logging.
router.get("/growth/subscription-events", validateSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const [rows, plans] = await Promise.all([
      prisma.appPlan.findMany({
        orderBy: { createdAt: "asc" },
        include: { shop: { select: { domain: true } } },
      }),
      prisma.subscriptionPlan.findMany({ select: { name: true, price: true } }),
    ]);

    const priceByName = new Map(plans.map((p) => [p.name, Number(p.price)]));
    const priceFor = (planKey) => {
      if (priceByName.has(planKey)) return priceByName.get(planKey);
      const lower = planKey.toLowerCase();
      if (lower.includes("free")) return 0;
      return null;
    };

    const lastByShop = new Map();
    const events = [];

    rows.forEach((row) => {
      const prev = lastByShop.get(row.shopId);
      let event = "Updated";
      if (!prev && row.isActive) {
        event = "Activated";
      } else if (row.isActive === false) {
        event = "Cancelled";
      } else if (prev && prev.isActive && row.isActive && prev.planKey !== row.planKey) {
        const prevPrice = priceFor(prev.planKey);
        const newPrice = priceFor(row.planKey);
        if (prevPrice !== null && newPrice !== null) {
          event = newPrice > prevPrice ? "Upgraded" : newPrice < prevPrice ? "Downgraded" : "Updated";
        }
      } else if (!prev && !row.isActive) {
        event = "Cancelled";
      }

      events.push({
        shopDomain: row.shop?.domain || "Unknown",
        event,
        planKey: row.planKey,
        createdAt: row.createdAt,
      });
      lastByShop.set(row.shopId, row);
    });

    const recent = events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);
    res.json({ events: recent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/growth/uninstall-feedback — Reason breakdown, from Shopify ────────────────
// Real data from Shopify's own post-uninstall survey (Partner API's RelationshipUninstalled
// event) — not anything this app collects itself. Returns `configured: false` when Partner API
// credentials aren't set, so the frontend can show an honest "not connected" state rather than
// an empty chart that looks like zero uninstalls happened.
router.get("/growth/uninstall-feedback", validateSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

    const { configured, events } = await fetchUninstallEvents(limit);
    if (!configured) {
      return res.json({ configured: false, breakdown: [], recent: [] });
    }

    // Shopify's `reason` field is a comma-separated list — a single uninstall can cite more than
    // one reason, so each listed reason is counted individually rather than treating the whole
    // string as one bucket.
    const counts = new Map();
    events.forEach((e) => {
      String(e.reason || "Not specified")
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean)
        .forEach((r) => counts.set(r, (counts.get(r) || 0) + 1));
    });

    const total = [...counts.values()].reduce((sum, c) => sum + c, 0);
    const breakdown = [...counts.entries()]
      .map(([reason, count]) => ({ reason, count, pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.count - a.count);

    const recent = events
      .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
      .slice(0, limit);

    res.json({ configured: true, breakdown, recent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

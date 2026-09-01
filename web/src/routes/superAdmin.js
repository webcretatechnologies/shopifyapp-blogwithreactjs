import express from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { refreshPlanFeaturesCache, buildFeatureComparisonTable } from "../services/PlanFeatureService.js";
import { countedClaimsWhere } from "../services/CouponService.js";
import { getLivePlans, priceForPlanKey } from "../services/PricingRatesService.js";
import { getShopAnalytics } from "../services/AnalyticsTrackingService.js";

export const SHOP_SAFE_SELECT = {
  id: true,
  domain: true,
  planKey: true,
  timezone: true,
  installedAt: true,
  uninstalledAt: true,
  createdAt: true,
  updatedAt: true,
};

const router = express.Router();

// Shared by the create/update plan routes below. Catches what the frontend form's own `type`
// attributes/guards don't: an emptied price field (parseFloat("") => NaN => JSON.stringify(NaN)
// => `null` over the wire, which previously hit SubscriptionPlan.price's non-nullable Decimal
// column and surfaced as a raw multi-line PrismaClientValidationError to the admin), plus
// negative price/trialDays, which had no guard anywhere before this.
function validatePlanFields({ price, trialDays }) {
  if (price !== undefined) {
    const n = Number(price);
    if (!Number.isFinite(n) || n < 0) return "Price must be a number of 0 or greater.";
  }
  if (trialDays !== undefined) {
    const n = parseInt(trialDays, 10);
    if (!Number.isFinite(n) || n < 0) return "Trial period must be 0 or more days.";
  }
  return null;
}
const prisma = new PrismaClient();

const SECRET = process.env.SHOPIFY_API_SECRET || "super-admin-secret-key-123";
const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "changeme-in-production";

// ─── Middleware: Validate Super Admin Token ──────────────────────────────────
export function validateSuperAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No admin token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, SECRET);

    if (!decoded.superAdmin) {
      return res.status(403).json({ error: "Invalid admin permissions" });
    }

    req.adminUser = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired admin token" });
  }
}

// ─── POST /admin-api/login — Admin Authentication ────────────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const admin = await prisma.superAdmin.findUnique({
      where: { email }
    });

    if (!admin) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate JWT token
    const token = jwt.sign({ superAdmin: true, adminId: admin.id, email: admin.email }, SECRET, { expiresIn: "1d" });
    res.json({ token, success: true, email: admin.email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/check — Session verification ─────────────────────────────
router.get("/check", validateSuperAdmin, (req, res) => {
  res.json({ authenticated: true });
});

// ─── GET /admin-api/dashboard — Metrics & Statistics ──────────────────────────
router.get("/dashboard", validateSuperAdmin, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-indexed

    // 1. Store counts
    const totalShops = await prisma.shop.count();
    const activeShops = await prisma.shop.count({
      where: { uninstalledAt: null },
    });
    const deactivatedShops = await prisma.shop.count({
      where: { uninstalledAt: { not: null } },
    });

    // 2. New installs & churns this month
    const startOfMonth = new Date(currentYear, currentMonth - 1, 1);
    const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

    const newThisMonth = await prisma.shop.count({
      where: {
        installedAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    const churnedThisMonth = await prisma.shop.count({
      where: {
        uninstalledAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    // 3. Plan breakdown — grouped by Shop.planKey's actual value, not a hardcoded tier list, so
    // a renamed/added/removed SubscriptionPlan is reflected automatically.
    const shops = await prisma.shop.findMany({
      where: { uninstalledAt: null },
      select: { planKey: true },
    });

    const livePlans = await getLivePlans(prisma);

    const distributionMap = new Map();
    shops.forEach((s) => {
      const { label, price } = priceForPlanKey(s.planKey, livePlans);
      const entry = distributionMap.get(label) || { planKey: s.planKey || "free", label, price, count: 0 };
      entry.count += 1;
      distributionMap.set(label, entry);
    });
    const planDistribution = [...distributionMap.values()].sort((a, b) => b.count - a.count);

    // 4. MRR / ARR — sum of (count × live price) across every non-free tier actually in use.
    const mrr = planDistribution.reduce((sum, p) => sum + (p.price > 0 ? p.count * p.price : 0), 0);
    const arr = mrr * 12;

    // 5. Monthly installation/churn chart data for current year
    const monthlyChartData = [];
    for (let m = 1; m <= 12; m++) {
      const start = new Date(currentYear, m - 1, 1);
      const end = new Date(currentYear, m, 0, 23, 59, 59, 999);

      const installs = await prisma.shop.count({
        where: {
          installedAt: { gte: start, lte: end },
        },
      });

      const churned = await prisma.shop.count({
        where: {
          uninstalledAt: { gte: start, lte: end },
        },
      });

      // Calculate revenue estimate for active shops during that period
      const activePeriodShops = await prisma.shop.findMany({
        where: {
          installedAt: { lte: end },
          OR: [{ uninstalledAt: null }, { uninstalledAt: { gte: start } }],
        },
        select: { planKey: true },
      });

      let periodRevenue = 0;
      activePeriodShops.forEach((s) => {
        periodRevenue += priceForPlanKey(s.planKey, livePlans).price;
      });

      monthlyChartData.push({
        month: new Date(currentYear, m - 1, 1).toLocaleString("default", { month: "short" }),
        date: start.toISOString().split("T")[0],
        installs,
        churned,
        revenue: parseFloat(periodRevenue.toFixed(2)),
      });
    }

    // 6. Recent stores
    const recentShopsRaw = await prisma.shop.findMany({
      orderBy: { installedAt: "desc" },
      take: 5,
      select: SHOP_SAFE_SELECT,
    });

    const recentShops = await Promise.all(
      recentShopsRaw.map(async (s) => {
        const session = await prisma.session.findFirst({
          where: { shop: s.domain },
          select: { email: true },
        });
        return {
          ...s,
          email: session?.email || "N/A",
        };
      })
    );

    // 7. Recent activity logs
    const recentActivities = await prisma.adminActivityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    res.json({
      metrics: {
        totalShops,
        activeShops,
        deactivatedShops,
        newThisMonth,
        churnedThisMonth,
        mrr,
        arr,
        planDistribution,
      },
      monthlyChartData,
      recentShops,
      recentActivities,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/stores — Stores auditor list with full filters ────────────
router.get("/stores", validateSuperAdmin, async (req, res) => {
  try {
    const {
      search = "",
      statusFilter = "all", // all | active | deactivated
      planFilter = "all", // all | free | starter | pro | business
      dateFrom = "",
      dateTo = "",
      sortBy = "installedAt",
      sortDir = "desc",
      page = "1",
      limit = "20",
    } = req.query;

    const take = parseInt(limit, 10);
    const skip = (parseInt(page, 10) - 1) * take;

    // Build Prisma query filters
    const where = {};

    if (search) {
      where.domain = { contains: search };
    }

    if (statusFilter === "active") {
      where.uninstalledAt = null;
    } else if (statusFilter === "deactivated") {
      where.uninstalledAt = { not: null };
    }

    if (planFilter !== "all") {
      where.planKey = { contains: planFilter };
    }

    if (dateFrom || dateTo) {
      where.installedAt = {};
      if (dateFrom) where.installedAt.gte = new Date(dateFrom);
      if (dateTo) where.installedAt.lte = new Date(dateTo);
    }

    const orderObj = {};
    orderObj[sortBy] = sortDir.toLowerCase() === "asc" ? "asc" : "desc";

    const [shops, total] = await Promise.all([
      prisma.shop.findMany({
        where,
        orderBy: orderObj,
        take,
        skip,
        select: SHOP_SAFE_SELECT,
      }),
      prisma.shop.count({ where }),
    ]);

    // Fetch plan overrides
    const overrides = await prisma.shopPlanOverride.findMany();
    const overridesMap = new Map(overrides.map((o) => [o.shopDomain, o]));

    // Format shops and fetch their contact emails
    const formattedShops = await Promise.all(
      shops.map(async (s) => {
        const override = overridesMap.get(s.domain);
        const session = await prisma.session.findFirst({
          where: { shop: s.domain },
          select: { email: true },
        });

        return {
          ...s,
          email: session?.email || "N/A",
          hasOverride: !!override,
          overridePlan: override?.overridePlan || null,
          overrideExpiresAt: override?.expiresAt || null,
        };
      })
    );

    // Per-shop sync-health rollup, merged in by shopId — avoids an N+1 frontend fetch per row.
    const shopIds = shops.map((s) => s.id);
    const syncRows = shopIds.length
      ? await prisma.shopifyArticle.findMany({
          where: { post: { shopId: { in: shopIds } } },
          select: { syncState: true, post: { select: { shopId: true } } },
        })
      : [];
    const syncByShop = new Map();
    syncRows.forEach((r) => {
      const shopId = r.post?.shopId;
      if (!shopId) return;
      const acc = syncByShop.get(shopId) || { healthy: 0, conflict: 0, error: 0, total: 0 };
      acc.total += 1;
      if (r.syncState === "conflict") acc.conflict += 1;
      else if (r.syncState === "error") acc.error += 1;
      else acc.healthy += 1;
      syncByShop.set(shopId, acc);
    });

    const storesWithSyncHealth = formattedShops.map((s) => ({
      ...s,
      syncHealth: syncByShop.get(s.id) || { healthy: 0, conflict: 0, error: 0, total: 0 },
    }));

    res.json({
      stores: storesWithSyncHealth,
      total,
      page: parseInt(page, 10),
      limit: take,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/stores/:domain — Individual store detail metrics ─────────
router.get("/stores/:domain", validateSuperAdmin, async (req, res) => {
  try {
    const { domain } = req.params;

    const shop = await prisma.shop.findUnique({
      where: { domain },
      select: SHOP_SAFE_SELECT,
    });

    if (!shop) {
      return res.status(404).json({ error: "Store not found" });
    }

    const session = await prisma.session.findFirst({
      where: { shop: domain },
      select: { email: true },
    });

    const [postsCount, categoriesCount, tagsCount, logs, analytics] = await Promise.all([
      prisma.post.count({ where: { shopId: shop.id } }),
      prisma.category.count({ where: { shopId: shop.id } }),
      prisma.tag.count({ where: { shopId: shop.id } }),
      prisma.adminActivityLog.findMany({
        where: { targetType: "shop", targetId: shop.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      getShopAnalytics(shop.id, 30).catch(() => null),
    ]);

    res.json({
      store: {
        ...shop,
        email: session?.email || "N/A",
        postsCount,
        categoriesCount,
        tagsCount,
        dailyViews: analytics ? analytics.daily.map((d) => ({ date: d.date, views: d.views })) : [],
      },
      logs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /admin-api/stores/:domain/deactivate — Soft deactivate store ────────
router.post("/stores/:domain/deactivate", validateSuperAdmin, async (req, res) => {
  try {
    const { domain } = req.params;

    const shop = await prisma.shop.findUnique({ where: { domain } });
    if (!shop) {
      return res.status(404).json({ error: "Store not found" });
    }

    // Set uninstalledAt to deactivate
    const updated = await prisma.shop.update({
      where: { domain },
      data: { uninstalledAt: new Date() },
      select: SHOP_SAFE_SELECT,
    });

    // Log Activity
    await prisma.adminActivityLog.create({
      data: {
        action: `Soft deactivated store: ${domain}`,
        targetType: "shop",
        targetId: shop.id,
        meta: { domain },
      },
    });

    res.json({ success: true, store: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /admin-api/stores/:domain/reactivate — Restore/reactivate store ─────
router.post("/stores/:domain/reactivate", validateSuperAdmin, async (req, res) => {
  try {
    const { domain } = req.params;

    const shop = await prisma.shop.findUnique({ where: { domain } });
    if (!shop) {
      return res.status(404).json({ error: "Store not found" });
    }

    // Restore uninstalledAt to null
    const updated = await prisma.shop.update({
      where: { domain },
      data: { uninstalledAt: null },
      select: SHOP_SAFE_SELECT,
    });

    // Log Activity
    await prisma.adminActivityLog.create({
      data: {
        action: `Reactivated store: ${domain}`,
        targetType: "shop",
        targetId: shop.id,
        meta: { domain },
      },
    });

    res.json({ success: true, store: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/stores/export — Export CSV Report ────────────────────────
router.get("/stores/export", validateSuperAdmin, async (req, res) => {
  try {
    const shops = await prisma.shop.findMany({
      orderBy: { installedAt: "desc" },
      select: SHOP_SAFE_SELECT,
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="stores-${new Date().toISOString().split("T")[0]}.csv"`);

    res.write("ID,Domain,Email,Plan,Status,Installed At,Deactivated At\n");

    for (const s of shops) {
      const session = await prisma.session.findFirst({
        where: { shop: s.domain },
        select: { email: true },
      });

      const email = session?.email || "N/A";
      const status = s.uninstalledAt ? "Deactivated" : "Active";
      const inst = s.installedAt ? s.installedAt.toISOString().split("T")[0] : "";
      const deact = s.uninstalledAt ? s.uninstalledAt.toISOString().split("T")[0] : "";

      res.write(`"${s.id}","${s.domain}","${email}","${s.planKey}","${status}","${inst}","${deact}"\n`);
    }

    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /admin-api/stores/:domain/override — Plan Override ──────────────────
router.post("/stores/:domain/override", validateSuperAdmin, async (req, res) => {
  try {
    const { domain } = req.params;
    const { plan, expiresAt } = req.body;

    if (!plan) {
      return res.status(400).json({ error: "Override plan is required" });
    }

    const shop = await prisma.shop.findUnique({ where: { domain } });
    if (!shop) {
      return res.status(404).json({ error: "Store not found" });
    }

    const expiryDate = expiresAt ? new Date(expiresAt) : null;

    // Upsert Plan Override
    await prisma.shopPlanOverride.upsert({
      where: { shopDomain: domain },
      create: {
        shopDomain: domain,
        overridePlan: plan,
        expiresAt: expiryDate,
      },
      update: {
        overridePlan: plan,
        expiresAt: expiryDate,
      },
    });

    // Update Shop planKey
    await prisma.shop.update({
      where: { domain },
      data: { planKey: plan },
    });

    // Log Activity
    await prisma.adminActivityLog.create({
      data: {
        action: `Override plan for ${domain} to ${plan}`,
        targetType: "shop",
        targetId: shop.id,
        meta: { plan, expiresAt: expiryDate },
      },
    });

    res.json({ success: true, message: `Overrode plan for ${domain} to ${plan}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /admin-api/stores/:domain/delete — Force delete store records ───────
router.post("/stores/:domain/delete", validateSuperAdmin, async (req, res) => {
  try {
    const { domain } = req.params;

    const shop = await prisma.shop.findUnique({ where: { domain } });
    if (!shop) {
      return res.status(404).json({ error: "Store not found" });
    }

    // Cascade delete via Prisma
    await prisma.shop.delete({ where: { domain } });

    // Clean overrides if any
    await prisma.shopPlanOverride.deleteMany({ where: { shopDomain: domain } });

    // Log Activity
    await prisma.adminActivityLog.create({
      data: {
        action: `Force deleted store ${domain} from app database`,
        targetType: "shop",
        targetId: shop.id,
      },
    });

    res.json({ success: true, message: `Successfully deleted store ${domain} database records.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/activities — Audit admin logs ────────────────────────────
router.get("/activities", validateSuperAdmin, async (req, res) => {
  try {
    const { page = "1", limit = "20", search = "", targetType = "", dateFrom = "", dateTo = "" } = req.query;
    const take = parseInt(limit, 10);
    const skip = (parseInt(page, 10) - 1) * take;

    const where = {};
    if (search) where.action = { contains: search };
    if (targetType) where.targetType = targetType;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [activities, total, volumeRows] = await Promise.all([
      prisma.adminActivityLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.adminActivityLog.count({ where }),
      prisma.adminActivityLog.findMany({
        where: { ...where, createdAt: { ...(where.createdAt || {}), gte: where.createdAt?.gte || since90 } },
        select: { createdAt: true },
      }),
    ]);

    const volumeMap = {};
    volumeRows.forEach((r) => {
      const key = r.createdAt.toISOString().split("T")[0];
      volumeMap[key] = (volumeMap[key] || 0) + 1;
    });
    const dailyVolume = Object.entries(volumeMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    res.json({ activities, total, page: parseInt(page, 10), limit: take, dailyVolume });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/pricing/features — List editable plan features ────────────
router.get("/pricing/features", validateSuperAdmin, async (req, res) => {
  try {
    const features = await prisma.planFeature.findMany({
      orderBy: [{ plan: "asc" }, { featureKey: "asc" }],
    });
    res.json({ features });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/pricing/comparison — Feature comparison matrix (Free/Starter/Pro) ──
// Every cell is computed live from the same PlanFeature rows the modals above edit — never
// hand-typed copy, so this table can't drift out of sync with what's actually gated.
router.get("/pricing/comparison", validateSuperAdmin, async (req, res) => {
  try {
    const rows = buildFeatureComparisonTable(["free", "starter", "pro"]);
    res.json({ rows, planLabels: ["Free", "Starter", "Pro"] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /admin-api/pricing/features/:id — Update individual feature limit ───
router.post("/pricing/features/:id", validateSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { enabled, limit } = req.body;

    const updated = await prisma.planFeature.update({
      where: { id },
      data: {
        enabled: enabled === true,
        limit: limit !== undefined ? (limit === null ? null : parseInt(limit, 10)) : undefined,
      },
    });

    // Refresh memory cache in PlanFeatureService
    await refreshPlanFeaturesCache();

    // Log Activity
    await prisma.adminActivityLog.create({
      data: {
        action: `Updated Plan Feature limits for: ${updated.plan} (${updated.featureKey})`,
        targetType: "feature",
        targetId: updated.id,
        meta: { plan: updated.plan, featureKey: updated.featureKey, enabled, limit },
      },
    });

    res.json({ success: true, feature: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/pricing/plans — Get all dynamic subscription plans ───────
router.get("/pricing/plans", validateSuperAdmin, async (req, res) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    // Subscriber count per plan — one groupBy, merged in. Matches the same case-insensitive
    // substring convention PlanFeatureService.getFeaturesForPlan and the revenue-analytics route
    // already use for mapping a Shop.planKey to a plan bucket, since planKey is set from either
    // the live Shopify subscription name or this plan's own `name` field (see billing.js /check).
    const grouped = await prisma.shop.groupBy({ by: ["planKey"], _count: true });
    const plansWithCounts = plans.map((plan) => {
      const planNameLower = plan.name.toLowerCase();
      const subscriberCount = grouped
        .filter((g) => (g.planKey || "").toLowerCase() === planNameLower)
        .reduce((sum, g) => sum + g._count, 0);
      return { ...plan, subscriberCount };
    });

    res.json({ plans: plansWithCounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /admin-api/pricing/plans — Create a new dynamic subscription plan ──
router.post("/pricing/plans", validateSuperAdmin, async (req, res) => {
  try {
    const { name, title, price, currency, interval, trialDays, description, features, isActive, isRecommended, sortOrder } = req.body;

    if (!name || !title) return res.status(400).json({ error: "Name and Title are required." });
    const validationError = validatePlanFields({ price, trialDays });
    if (validationError) return res.status(400).json({ error: validationError });

    // At most one plan is ever "Recommended" (matches the single badge the merchant billing page
    // shows) — clearing every other plan's flag first, in the same transaction as the create,
    // means a newly-recommended plan can never end up sharing the badge with a stale one.
    const newPlan = await prisma.$transaction(async (tx) => {
      if (isRecommended) {
        await tx.subscriptionPlan.updateMany({ data: { isRecommended: false } });
      }
      return tx.subscriptionPlan.create({
        data: {
          name,
          title,
          price,
          currency,
          interval,
          trialDays: trialDays !== undefined ? parseInt(trialDays, 10) || 0 : 0,
          description,
          features: Array.isArray(features) ? features : [],
          isActive: isActive !== undefined ? isActive : true,
          isRecommended: isRecommended !== undefined ? isRecommended : false,
          sortOrder: sortOrder || 0,
        },
      });
    });
    res.json({ success: true, plan: newPlan });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: `A plan with the slug "${req.body.name}" already exists.` });
    }
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /admin-api/pricing/plans/:id — Edit a dynamic subscription plan ─────
router.put("/pricing/plans/:id", validateSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, title, price, currency, interval, trialDays, description, features, isActive, isRecommended, sortOrder } = req.body;

    const validationError = validatePlanFields({ price, trialDays });
    if (validationError) return res.status(400).json({ error: validationError });

    // Same single-badge guarantee as the create route above.
    const updatedPlan = await prisma.$transaction(async (tx) => {
      if (isRecommended) {
        await tx.subscriptionPlan.updateMany({ where: { id: { not: id } }, data: { isRecommended: false } });
      }
      return tx.subscriptionPlan.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(title && { title }),
          ...(price !== undefined && { price }),
          ...(currency && { currency }),
          ...(interval && { interval }),
          ...(trialDays !== undefined && { trialDays: parseInt(trialDays, 10) || 0 }),
          ...(description !== undefined && { description }),
          ...(features && { features: Array.isArray(features) ? features : [] }),
          ...(isActive !== undefined && { isActive }),
          ...(isRecommended !== undefined && { isRecommended }),
          ...(sortOrder !== undefined && { sortOrder }),
        },
      });
    });
    res.json({ success: true, plan: updatedPlan });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: `A plan with the slug "${req.body.name}" already exists.` });
    }
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /admin-api/pricing/plans/:id — Delete a dynamic subscription plan ──
router.delete("/pricing/plans/:id", validateSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.subscriptionPlan.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Shared by the create/update AI credit pack routes below — same reasoning as
// validatePlanFields: an emptied price/credits field must not reach a non-nullable Decimal/Int
// column as raw NaN/null, and neither should ever go negative or (for credits) zero.
function validateCreditPackFields({ price, credits }) {
  if (price !== undefined) {
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) return "Price must be a number greater than 0.";
  }
  if (credits !== undefined) {
    const n = parseInt(credits, 10);
    if (!Number.isFinite(n) || n <= 0) return "Credits must be a whole number greater than 0.";
  }
  return null;
}

// ─── GET /admin-api/ai-credit-packs — every pack, active or not ───────────────
router.get("/ai-credit-packs", validateSuperAdmin, async (req, res) => {
  try {
    const packs = await prisma.aiCreditPack.findMany({ orderBy: { sortOrder: "asc" } });

    // Purchase count per pack (all statuses, not just APPROVED) — same "surface real usage
    // before letting an admin delete something" purpose as pricing/plans' subscriberCount.
    const grouped = await prisma.aiCreditPurchase.groupBy({ by: ["packKey"], _count: true });
    const packsWithCounts = packs.map((pack) => ({
      ...pack,
      price: Number(pack.price),
      purchaseCount: grouped.find((g) => g.packKey === pack.key)?._count || 0,
    }));

    res.json({ packs: packsWithCounts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /admin-api/ai-credit-packs — Create a new AI credit pack ────────────
router.post("/ai-credit-packs", validateSuperAdmin, async (req, res) => {
  try {
    const { key, credits, price, currency, isActive, isRecommended, sortOrder } = req.body;

    if (!key || !String(key).trim()) return res.status(400).json({ error: "Key is required." });
    const validationError = validateCreditPackFields({ price, credits });
    if (validationError) return res.status(400).json({ error: validationError });

    // At most one pack is ever "Best value" (matches the single badge the merchant billing page
    // shows) — same single-badge guarantee as pricing/plans' isRecommended.
    const newPack = await prisma.$transaction(async (tx) => {
      if (isRecommended) {
        await tx.aiCreditPack.updateMany({ data: { isRecommended: false } });
      }
      return tx.aiCreditPack.create({
        data: {
          key: String(key).trim(),
          credits: parseInt(credits, 10),
          price,
          currency: currency || "USD",
          isActive: isActive !== undefined ? isActive : true,
          isRecommended: isRecommended !== undefined ? isRecommended : false,
          sortOrder: sortOrder || 0,
        },
      });
    });
    res.json({ success: true, pack: { ...newPack, price: Number(newPack.price) } });
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(409).json({ error: `A credit pack with the key "${req.body.key}" already exists.` });
    }
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /admin-api/ai-credit-packs/:id — Edit an AI credit pack ──────────────
router.put("/ai-credit-packs/:id", validateSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { credits, price, currency, isActive, isRecommended, sortOrder } = req.body;

    const validationError = validateCreditPackFields({ price, credits });
    if (validationError) return res.status(400).json({ error: validationError });

    // `key` is deliberately not editable here — it's a purchase's permanent snapshot join key
    // (AiCreditPurchase.packKey), and renaming it out from under existing purchase history would
    // orphan their label. Price/credits/currency/active/sortOrder only affect future purchases.
    // Same single-badge guarantee as the create route above.
    const updatedPack = await prisma.$transaction(async (tx) => {
      if (isRecommended) {
        await tx.aiCreditPack.updateMany({ where: { id: { not: id } }, data: { isRecommended: false } });
      }
      return tx.aiCreditPack.update({
        where: { id },
        data: {
          ...(credits !== undefined && { credits: parseInt(credits, 10) }),
          ...(price !== undefined && { price }),
          ...(currency && { currency }),
          ...(isActive !== undefined && { isActive }),
          ...(isRecommended !== undefined && { isRecommended }),
          ...(sortOrder !== undefined && { sortOrder }),
        },
      });
    });
    res.json({ success: true, pack: { ...updatedPack, price: Number(updatedPack.price) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /admin-api/ai-credit-packs/:id — Delete an AI credit pack ─────────
router.delete("/ai-credit-packs/:id", validateSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.aiCreditPack.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── GET /admin-api/revenue/analytics — MRR breakdown reports ──────────────────
router.get("/revenue/analytics", validateSuperAdmin, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const livePlans = await getLivePlans(prisma);

    // Calculate dynamic MRR/ARR based on active installations
    const activeShops = await prisma.shop.findMany({
      where: { uninstalledAt: null },
      select: { planKey: true },
    });

    let mrr = 0;
    activeShops.forEach((s) => {
      mrr += priceForPlanKey(s.planKey, livePlans).price;
    });

    const arr = mrr * 12;

    // Monthly table details
    const monthlyBreakdown = [];
    for (let m = 1; m <= 12; m++) {
      const start = new Date(currentYear, m - 1, 1);
      const end = new Date(currentYear, m, 0, 23, 59, 59, 999);

      const newsCount = await prisma.shop.count({
        where: {
          installedAt: { gte: start, lte: end },
        },
      });

      const churnedCount = await prisma.shop.count({
        where: {
          uninstalledAt: { gte: start, lte: end },
        },
      });

      const activeShopsInMonth = await prisma.shop.findMany({
        where: {
          installedAt: { lte: end },
          OR: [{ uninstalledAt: null }, { uninstalledAt: { gte: start } }],
        },
        select: { planKey: true },
      });

      let revenue = 0;
      activeShopsInMonth.forEach((s) => {
        revenue += priceForPlanKey(s.planKey, livePlans).price;
      });

      monthlyBreakdown.push({
        month: new Date(currentYear, m - 1, 1).toLocaleString("default", { month: "long" }),
        new: newsCount,
        churned: churnedCount,
        revenue: parseFloat(revenue.toFixed(2)),
      });
    }

    res.json({
      mrr,
      arr,
      monthlyBreakdown,
      filterYear: currentYear,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/revenue/export — Export CSV of monthly revenue ───────────
router.get("/revenue/export", validateSuperAdmin, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const livePlans = await getLivePlans(prisma);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="revenue-${currentYear}.csv"`);
    res.write("Month,New Stores,Churned,Revenue\n");

    for (let m = 1; m <= 12; m++) {
      const start = new Date(currentYear, m - 1, 1);
      const end = new Date(currentYear, m, 0, 23, 59, 59, 999);

      const newsCount = await prisma.shop.count({
        where: {
          installedAt: { gte: start, lte: end },
        },
      });

      const churnedCount = await prisma.shop.count({
        where: {
          uninstalledAt: { gte: start, lte: end },
        },
      });

      const activeShopsInMonth = await prisma.shop.findMany({
        where: {
          installedAt: { lte: end },
          OR: [{ uninstalledAt: null }, { uninstalledAt: { gte: start } }],
        },
        select: { planKey: true },
      });

      let revenue = 0;
      activeShopsInMonth.forEach((s) => {
        revenue += priceForPlanKey(s.planKey, livePlans).price;
      });

      const monthName = new Date(currentYear, m - 1, 1).toLocaleString("default", { month: "long" });
      res.write(`"${monthName}",${newsCount},${churnedCount},${revenue.toFixed(2)}\n`);
    }

    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//  BILLING COUPONS — SaaS subscription discount codes
// ═══════════════════════════════════════════════════════════════════════════

const COUPON_CODE_RE = /^[A-Z0-9_-]+$/;

function validateCouponPayload(body) {
  const code = String(body.code || "").trim().toUpperCase();
  if (!code || !COUPON_CODE_RE.test(code)) {
    return { error: "Code must be uppercase letters, numbers, underscores, or hyphens only." };
  }
  const discountType = body.discountType === "FIXED_AMOUNT" ? "FIXED_AMOUNT" : "PERCENTAGE";
  const percentOff = discountType === "PERCENTAGE" ? parseFloat(body.percentOff) : null;
  const amountOff = discountType === "FIXED_AMOUNT" ? parseFloat(body.amountOff) : null;
  // Capped at 99%, not 100 — a 100%-off coupon produces a $0 subscription line item, which
  // Shopify's appSubscriptionCreate rejects with a userError at real charge time (billing.js),
  // surfacing as a generic "Failed to process subscription" with no indication the coupon was
  // the cause. The admin UI's own field already advertises this cap; the backend now actually
  // enforces it instead of silently allowing 100 through.
  if (discountType === "PERCENTAGE" && (!(percentOff > 0) || percentOff > 99)) {
    return { error: "Percent off must be a number between 0 and 99 (100% would produce a $0 charge, which Shopify rejects)." };
  }
  if (discountType === "FIXED_AMOUNT" && !(amountOff > 0)) {
    return { error: "Amount off must be a positive number." };
  }
  const durationMonths = parseInt(body.durationMonths, 10);
  if (!(durationMonths > 0)) {
    return { error: "Duration (months) must be a positive integer." };
  }
  const appliesTo = ["SPECIFIC_PLANS", "SPECIFIC_STORES"].includes(body.appliesTo)
    ? body.appliesTo
    : "ALL_PAID_PLANS";

  return {
    data: {
      code,
      discountType,
      percentOff,
      amountOff,
      durationMonths,
      description: body.description || null,
      active: body.active !== undefined ? Boolean(body.active) : true,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      totalUses: body.totalUses !== undefined && body.totalUses !== null && body.totalUses !== ""
        ? parseInt(body.totalUses, 10) : null,
      usesPerStore: body.usesPerStore ? parseInt(body.usesPerStore, 10) : 1,
      appliesTo,
    },
    planIds: Array.isArray(body.planIds) ? body.planIds.map((id) => parseInt(id, 10)) : [],
    shopDomains: Array.isArray(body.shopDomains)
      ? body.shopDomains.map((d) => String(d).trim()).filter(Boolean)
      : [],
  };
}

// Fixed-amount coupons can otherwise be saved against a plan cheaper than the discount itself,
// making the coupon permanently broken from creation — Shopify's own appSubscriptionCreate
// rejects discount.value.amount >= the plan price outright at the moment a merchant actually
// tries to claim it. Checked against every plan the coupon could ever apply to: exactly the
// selected plans for SPECIFIC_PLANS, or every active paid plan for ALL_PAID_PLANS/
// SPECIFIC_STORES (a store-scoped coupon can still match any paid plan the merchant picks).
// Percentage coupons are never checked here — they're already capped at 99% above.
async function validateCouponAmountAgainstPlans(data, planIds) {
  if (data.discountType !== "FIXED_AMOUNT") return null;

  const applicablePlans = data.appliesTo === "SPECIFIC_PLANS" && planIds.length > 0
    ? await prisma.subscriptionPlan.findMany({ where: { id: { in: planIds } } })
    : await prisma.subscriptionPlan.findMany({ where: { isActive: true, price: { gt: 0 } } });

  const amountCents = Math.round(Number(data.amountOff) * 100);
  const tooLarge = applicablePlans.filter((p) => amountCents >= Math.round(Number(p.price) * 100));
  if (tooLarge.length === 0) return null;

  const named = tooLarge.map((p) => `${p.title} ($${Number(p.price).toFixed(2)})`).join(", ");
  return `Discount amount ($${Number(data.amountOff).toFixed(2)}) must be less than the plan price — too large for: ${named}`;
}

// Re-syncs a coupon's CouponPlan/CouponShop join rows to exactly match what was submitted —
// simplest robust approach for a small join-table set (delete then recreate inside a
// transaction), same posture as the rest of this admin CRUD surface.
async function syncCouponRelations(couponId, planIds, shopDomains) {
  await prisma.$transaction([
    prisma.couponPlan.deleteMany({ where: { couponId } }),
    prisma.couponShop.deleteMany({ where: { couponId } }),
    ...(planIds.length
      ? [prisma.couponPlan.createMany({ data: planIds.map((planId) => ({ couponId, planId })) })]
      : []),
    ...(shopDomains.length
      ? [prisma.couponShop.createMany({ data: shopDomains.map((shopDomain) => ({ couponId, shopDomain })) })]
      : []),
  ]);
}

// ─── GET /admin-api/coupons — List all coupons ───────────────────────────────
router.get("/coupons", validateSuperAdmin, async (req, res) => {
  try {
    const coupons = await prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        plans: { include: { plan: { select: { id: true, name: true, title: true } } } },
        shops: true,
        _count: { select: { claims: { where: countedClaimsWhere() } } },
      },
    });
    res.json({ coupons });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /admin-api/coupons — Create a coupon ───────────────────────────────
router.post("/coupons", validateSuperAdmin, async (req, res) => {
  try {
    const { data, error, planIds, shopDomains } = validateCouponPayload(req.body);
    if (error) return res.status(400).json({ error });

    const priceError = await validateCouponAmountAgainstPlans(data, planIds);
    if (priceError) return res.status(400).json({ error: priceError });

    const existing = await prisma.coupon.findUnique({ where: { code: data.code } });
    if (existing) return res.status(400).json({ error: "A coupon with this code already exists." });

    const coupon = await prisma.coupon.create({ data });
    if (data.appliesTo === "SPECIFIC_PLANS" || data.appliesTo === "SPECIFIC_STORES") {
      await syncCouponRelations(coupon.id, planIds, shopDomains);
    }

    await prisma.adminActivityLog.create({
      data: {
        action: `Created coupon: ${coupon.code}`,
        targetType: "coupon",
        targetId: coupon.id,
        meta: { code: coupon.code, discountType: coupon.discountType },
      },
    });

    res.json({ success: true, coupon });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /admin-api/coupons/:id — Edit a coupon ──────────────────────────────
router.put("/coupons/:id", validateSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { data, error, planIds, shopDomains } = validateCouponPayload(req.body);
    if (error) return res.status(400).json({ error });

    const priceError = await validateCouponAmountAgainstPlans(data, planIds);
    if (priceError) return res.status(400).json({ error: priceError });

    const codeOwner = await prisma.coupon.findUnique({ where: { code: data.code } });
    if (codeOwner && codeOwner.id !== id) {
      return res.status(400).json({ error: "A coupon with this code already exists." });
    }

    const coupon = await prisma.coupon.update({ where: { id }, data });
    await syncCouponRelations(coupon.id, planIds, shopDomains);

    await prisma.adminActivityLog.create({
      data: {
        action: `Updated coupon: ${coupon.code}`,
        targetType: "coupon",
        targetId: coupon.id,
        meta: { code: coupon.code },
      },
    });

    res.json({ success: true, coupon });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /admin-api/coupons/:id/toggle — Flip active on/off from the list row ──
router.post("/coupons/:id/toggle", validateSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const coupon = await prisma.coupon.findUnique({ where: { id } });
    if (!coupon) return res.status(404).json({ error: "Coupon not found" });

    const updated = await prisma.coupon.update({ where: { id }, data: { active: !coupon.active } });

    await prisma.adminActivityLog.create({
      data: {
        action: `${updated.active ? "Activated" : "Deactivated"} coupon: ${updated.code}`,
        targetType: "coupon",
        targetId: id,
        meta: { code: updated.code },
      },
    });

    res.json({ success: true, coupon: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Shared by GET /coupons/usage (JSON, for the UI) and GET /coupons/usage/export (CSV) so both
// surfaces always agree — the export is never allowed to drift from what the screen shows.
//
// KPI semantics (deliberately narrower than the CouponClaim "used" definition used elsewhere):
// only status "APPROVED" counts toward money figures here — a PENDING claim is an in-flight
// checkout that was never actually approved by Shopify, so it costs nothing yet and would
// overstate real discount spend if included. The table below still lists PENDING rows (an admin
// needs to see they exist), just excluded from the KPI totals.
async function buildCouponUsageRows(query) {
  const { from, to, couponId, status, search } = query;

  const where = {};
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999Z`);
  }
  if (couponId) where.couponId = parseInt(couponId, 10);
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { shopDomain: { contains: search } },
      { couponCode: { contains: search } },
    ];
  }

  const claims = await prisma.couponClaim.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const plans = await prisma.subscriptionPlan.findMany({ select: { name: true, interval: true } });
  const intervalByPlanName = Object.fromEntries(plans.map((p) => [p.name, p.interval]));

  const now = new Date();
  const rows = claims.map((claim) => {
    const isAnnual = intervalByPlanName[claim.planTier] === "ANNUAL";
    const priceBeforeDiscount = Number(claim.priceBeforeDiscount);
    const discountedPrice = Number(claim.discountedPrice);
    const saving = Math.round((priceBeforeDiscount - discountedPrice) * 100) / 100;
    const cycles = isAnnual ? Math.max(1, Math.round(claim.couponDurationMonths / 12)) : claim.couponDurationMonths;
    const total = Math.round(discountedPrice * cycles * 100) / 100;
    const fullPriceFrom = new Date(claim.createdAt);
    fullPriceFrom.setMonth(fullPriceFrom.getMonth() + claim.couponDurationMonths);
    const counted = claim.status === "APPROVED";
    const stillActive = counted && fullPriceFrom > now;

    return {
      id: claim.id,
      claimedAt: claim.createdAt,
      couponId: claim.couponId,
      couponCode: claim.couponCode,
      shopDomain: claim.shopDomain,
      planTier: claim.planTier,
      cycle: isAnnual ? "Yearly" : "Monthly",
      price: discountedPrice,
      saving,
      cycles,
      total,
      fullPriceFrom,
      status: claim.status,
      counted,
      stillActive,
    };
  });

  const countedRows = rows.filter((r) => r.counted);
  const kpis = {
    claims: countedRows.length,
    stores: new Set(countedRows.map((r) => r.shopDomain)).size,
    activeDiscounts: countedRows.filter((r) => r.stillActive).length,
    discountPerMonth: Math.round(
      countedRows.filter((r) => r.stillActive)
        .reduce((sum, r) => sum + (r.cycle === "Yearly" ? r.saving / 12 : r.saving), 0) * 100
    ) / 100,
    committedDiscount: Math.round(countedRows.reduce((sum, r) => sum + r.saving * r.cycles, 0) * 100) / 100,
  };

  return { rows, kpis };
}

// ─── GET /admin-api/coupons/usage — Coupon usage analytics (JSON) ───────────
router.get("/coupons/usage", validateSuperAdmin, async (req, res) => {
  try {
    const { rows, kpis } = await buildCouponUsageRows(req.query);
    res.json({ rows, kpis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/coupons/usage/export — Coupon usage analytics (CSV) ─────
router.get("/coupons/usage/export", validateSuperAdmin, async (req, res) => {
  try {
    const { rows } = await buildCouponUsageRows(req.query);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="coupon-usage-${Date.now()}.csv"`);
    res.write("Claimed,Coupon,Store,Plan,Cycle,Price,Saving,Cycles,Total,Full Price From,Status\n");
    for (const r of rows) {
      res.write(
        `"${r.claimedAt.toISOString().slice(0, 10)}","${r.couponCode}","${r.shopDomain}","${r.planTier}",` +
        `"${r.cycle}",${r.price.toFixed(2)},${r.saving.toFixed(2)},${r.cycles},${r.total.toFixed(2)},` +
        `"${r.fullPriceFrom.toISOString().slice(0, 10)}","${r.status}"\n`
      );
    }
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /admin-api/coupons/:id — Delete a coupon ─────────────────────────
router.delete("/coupons/:id", validateSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const coupon = await prisma.coupon.findUnique({ where: { id } });
    if (!coupon) return res.status(404).json({ error: "Coupon not found" });

    await prisma.coupon.delete({ where: { id } });

    await prisma.adminActivityLog.create({
      data: {
        action: `Deleted coupon: ${coupon.code}`,
        targetType: "coupon",
        targetId: id,
        meta: { code: coupon.code },
      },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

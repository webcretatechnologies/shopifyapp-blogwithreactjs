import express from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { refreshPlanFeaturesCache, buildFeatureComparisonTable } from "../services/PlanFeatureService.js";

const router = express.Router();
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

    // 3. Plan breakdown
    const shops = await prisma.shop.findMany({
      where: { uninstalledAt: null },
      select: { planKey: true },
    });

    const planBreakdown = {
      free: 0,
      starter: 0,
      pro: 0,
      business: 0,
    };

    shops.forEach((s) => {
      const plan = (s.planKey || "free").toLowerCase();
      if (plan.includes("starter")) planBreakdown.starter++;
      else if (plan.includes("pro")) planBreakdown.pro++;
      else if (plan.includes("business")) planBreakdown.business++;
      else planBreakdown.free++;
    });

    // 4. MRR / ARR Calculations
    const pricingRates = {
      free: 0.0,
      starter: 4.99,
      pro: 9.99,
      business: 19.99,
    };

    const mrr =
      planBreakdown.starter * pricingRates.starter +
      planBreakdown.pro * pricingRates.pro +
      planBreakdown.business * pricingRates.business;

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
        const plan = (s.planKey || "free").toLowerCase();
        if (plan.includes("starter")) periodRevenue += pricingRates.starter;
        else if (plan.includes("pro")) periodRevenue += pricingRates.pro;
        else if (plan.includes("business")) periodRevenue += pricingRates.business;
      });

      monthlyChartData.push({
        month: new Date(currentYear, m - 1, 1).toLocaleString("default", { month: "short" }),
        installs,
        churned,
        revenue: parseFloat(periodRevenue.toFixed(2)),
      });
    }

    // 6. Recent stores
    const recentShopsRaw = await prisma.shop.findMany({
      orderBy: { installedAt: "desc" },
      take: 5,
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
        planBreakdown,
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

    res.json({
      stores: formattedShops,
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
    });

    if (!shop) {
      return res.status(404).json({ error: "Store not found" });
    }

    const session = await prisma.session.findFirst({
      where: { shop: domain },
      select: { email: true },
    });

    const [postsCount, categoriesCount, tagsCount, logs] = await Promise.all([
      prisma.post.count({ where: { shopId: shop.id } }),
      prisma.category.count({ where: { shopId: shop.id } }),
      prisma.tag.count({ where: { shopId: shop.id } }),
      prisma.adminActivityLog.findMany({
        where: { targetType: "shop", targetId: shop.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    res.json({
      store: {
        ...shop,
        email: session?.email || "N/A",
        postsCount,
        categoriesCount,
        tagsCount,
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
    const { page = "1", limit = "20" } = req.query;
    const take = parseInt(limit, 10);
    const skip = (parseInt(page, 10) - 1) * take;

    const [activities, total] = await Promise.all([
      prisma.adminActivityLog.findMany({
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.adminActivityLog.count(),
    ]);

    res.json({ activities, total, page: parseInt(page, 10), limit: take });
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

// ─── POST /admin-api/pricing/features/reset — Reset features to defaults ──────
router.post("/pricing/features/reset", validateSuperAdmin, async (req, res) => {
  try {
    // Delete existing features and trigger re-seed in PlanFeatureService
    await prisma.planFeature.deleteMany({});
    await refreshPlanFeaturesCache();

    // Log Activity
    await prisma.adminActivityLog.create({
      data: {
        action: `Reset Plan Features to system defaults`,
        targetType: "setting",
      },
    });

    res.json({ success: true, message: "Successfully reset all plan features to defaults." });
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
    const { name, title, price, currency, interval, trialDays, description, features, isActive, sortOrder } = req.body;
    const newPlan = await prisma.subscriptionPlan.create({
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
        sortOrder: sortOrder || 0,
      },
    });
    res.json({ success: true, plan: newPlan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /admin-api/pricing/plans/:id — Edit a dynamic subscription plan ─────
router.put("/pricing/plans/:id", validateSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, title, price, currency, interval, trialDays, description, features, isActive, sortOrder } = req.body;
    const updatedPlan = await prisma.subscriptionPlan.update({
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
        ...(sortOrder !== undefined && { sortOrder }),
      },
    });
    res.json({ success: true, plan: updatedPlan });
  } catch (err) {
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


// ─── GET /admin-api/revenue/analytics — MRR breakdown reports ──────────────────
router.get("/revenue/analytics", validateSuperAdmin, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const dbPlans = await prisma.subscriptionPlan.findMany();
    const pricingRates = {};
    dbPlans.forEach(p => {
      // Map names to lowercase key, e.g. "Blogger Starter" -> "starter"
      const lowerName = p.name.toLowerCase();
      if (lowerName.includes("starter")) pricingRates.starter = parseFloat(p.price);
      else if (lowerName.includes("pro")) pricingRates.pro = parseFloat(p.price);
      else if (lowerName.includes("business")) pricingRates.business = parseFloat(p.price);
      else pricingRates[p.name] = parseFloat(p.price);
    });
    // Fallbacks
    pricingRates.free = 0.0;

    // Calculate dynamic MRR/ARR based on active installations
    const activeShops = await prisma.shop.findMany({
      where: { uninstalledAt: null },
      select: { planKey: true },
    });

    let mrr = 0;
    activeShops.forEach((s) => {
      const plan = s.planKey || "free";
      const planLower = plan.toLowerCase();
      let added = false;
      
      // Exact match or partial match
      if (pricingRates[plan]) { mrr += pricingRates[plan]; added = true; }
      else if (planLower.includes("starter") && pricingRates.starter) { mrr += pricingRates.starter; added = true; }
      else if (planLower.includes("pro") && pricingRates.pro) { mrr += pricingRates.pro; added = true; }
      else if (planLower.includes("business") && pricingRates.business) { mrr += pricingRates.business; added = true; }
      
      // Custom generic fallback
      if (!added && pricingRates[plan]) { mrr += pricingRates[plan]; }
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
        const plan = (s.planKey || "free").toLowerCase();
        if (plan.includes("starter")) revenue += pricingRates.starter;
        else if (plan.includes("pro")) revenue += pricingRates.pro;
        else if (plan.includes("business")) revenue += pricingRates.business;
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
    const dbPlans = await prisma.subscriptionPlan.findMany();
    const pricingRates = {};
    dbPlans.forEach(p => {
      // Map names to lowercase key, e.g. "Blogger Starter" -> "starter"
      const lowerName = p.name.toLowerCase();
      if (lowerName.includes("starter")) pricingRates.starter = parseFloat(p.price);
      else if (lowerName.includes("pro")) pricingRates.pro = parseFloat(p.price);
      else if (lowerName.includes("business")) pricingRates.business = parseFloat(p.price);
      else pricingRates[p.name] = parseFloat(p.price);
    });
    // Fallbacks
    pricingRates.free = 0.0;

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
        const plan = s.planKey || "free";
        const planLower = plan.toLowerCase();
        let added = false;
        
        // Exact match or partial match
        if (pricingRates[plan]) { revenue += pricingRates[plan]; added = true; }
        else if (planLower.includes("starter") && pricingRates.starter) { revenue += pricingRates.starter; added = true; }
        else if (planLower.includes("pro") && pricingRates.pro) { revenue += pricingRates.pro; added = true; }
        else if (planLower.includes("business") && pricingRates.business) { revenue += pricingRates.business; added = true; }
        
        // Custom generic fallback
        if (!added && pricingRates[plan]) { revenue += pricingRates[plan]; }
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
const COUNTED_CLAIM_STATUSES = ["PENDING", "APPROVED"];

function validateCouponPayload(body) {
  const code = String(body.code || "").trim().toUpperCase();
  if (!code || !COUPON_CODE_RE.test(code)) {
    return { error: "Code must be uppercase letters, numbers, underscores, or hyphens only." };
  }
  const discountType = body.discountType === "FIXED_AMOUNT" ? "FIXED_AMOUNT" : "PERCENTAGE";
  const percentOff = discountType === "PERCENTAGE" ? parseFloat(body.percentOff) : null;
  const amountOff = discountType === "FIXED_AMOUNT" ? parseFloat(body.amountOff) : null;
  if (discountType === "PERCENTAGE" && (!(percentOff > 0) || percentOff > 100)) {
    return { error: "Percent off must be a number between 0 and 100." };
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
        _count: { select: { claims: { where: { status: { in: COUNTED_CLAIM_STATUSES } } } } },
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
      { coupon: { code: { contains: search } } },
    ];
  }

  const claims = await prisma.couponClaim.findMany({
    where,
    include: { coupon: true },
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
    const cycles = isAnnual ? Math.max(1, Math.round(claim.coupon.durationMonths / 12)) : claim.coupon.durationMonths;
    const total = Math.round(discountedPrice * cycles * 100) / 100;
    const fullPriceFrom = new Date(claim.createdAt);
    fullPriceFrom.setMonth(fullPriceFrom.getMonth() + claim.coupon.durationMonths);
    const counted = claim.status === "APPROVED";
    const stillActive = counted && fullPriceFrom > now;

    return {
      id: claim.id,
      claimedAt: claim.createdAt,
      couponId: claim.couponId,
      couponCode: claim.coupon.code,
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

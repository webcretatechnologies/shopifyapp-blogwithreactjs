import express from "express";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import EmailService from "../services/EmailService.js";
import { refreshPlanFeaturesCache } from "../services/PlanFeatureService.js";

const router = express.Router();
const prisma = new PrismaClient();

const SECRET = process.env.SHOPIFY_API_SECRET || "super-admin-secret-key-123";
const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "changeme-in-production";

// Pre-defined templates for Email Center
const EMAIL_TEMPLATES = {
  welcome: {
    name: "Welcome Email",
    subject: "Welcome to Blogger!",
    body: "Hi {shop_name},\n\nWelcome to Blogger! We're excited to have you on board.\n\nIf you need any help, reply to this email.\n\nBest,\nThe Blogger Team",
  },
  deactivation_notice: {
    name: "Deactivation Notice",
    subject: "Your Blogger subscription has been deactivated",
    body: "Hi {shop_name},\n\nYour subscription to Blogger on {domain} has been deactivated.\n\nIf this was a mistake, please reply to this email.\n\nBest,\nThe Blogger Team",
  },
  plan_upgrade_prompt: {
    name: "Plan Upgrade Prompt",
    subject: "Unlock more with Blogger Pro",
    body: "Hi {shop_name},\n\nYou're currently on the Free plan. Upgrade to Pro to unlock premium features.\n\nReply to this email to learn more.\n\nBest,\nThe Blogger Team",
  },
  payment_failed: {
    name: "Payment Failed Alert",
    subject: "Action required: Payment failed for Blogger",
    body: "Hi {shop_name},\n\nWe were unable to process your payment for Blogger. Please update your billing details in Shopify.\n\nBest,\nThe Blogger Team",
  },
  monthly_newsletter: {
    name: "Monthly Newsletter",
    subject: "Blogger — Monthly Update",
    body: "Hi {shop_name},\n\nHere's what's new this month at Blogger...\n\n[Add your content here]\n\nBest,\nThe Blogger Team",
  },
};

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
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Generate JWT token
    const token = jwt.sign({ superAdmin: true }, SECRET, { expiresIn: "1d" });
    res.json({ token, success: true });
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

    const session = await prisma.session.findFirst({
      where: { shop: domain },
      select: { email: true },
    });

    // Send deactivation notification email
    if (session?.email) {
      const personalSubject = EMAIL_TEMPLATES.deactivation_notice.subject.replace("{app_name}", "Blogger");
      const personalBody = EMAIL_TEMPLATES.deactivation_notice.body
        .replace("{shop_name}", domain)
        .replace("{domain}", domain)
        .replace("{app_name}", "Blogger");

      await EmailService.sendEmail({
        to: session.email,
        subject: personalSubject,
        body: personalBody,
        template: "deactivation_notice",
        shopDomain: domain,
      });
    }

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

    const session = await prisma.session.findFirst({
      where: { shop: domain },
      select: { email: true },
    });

    // Send reactivation notification email
    if (session?.email) {
      const personalSubject = `Your Blogger subscription has been reactivated!`;
      const personalBody = `Hi ${domain},\n\nWe're happy to inform you that your Blogger subscription for ${domain} has been reactivated successfully.\n\nBest,\nThe Blogger Team`;

      await EmailService.sendEmail({
        to: session.email,
        subject: personalSubject,
        body: personalBody,
        template: "reactivation",
        shopDomain: domain,
      });
    }

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

// ─── POST /admin-api/stores/:domain/email — Send individual email ───────────
router.post("/admin-api/stores/:domain/email", validateSuperAdmin, async (req, res) => {
  try {
    const { domain } = req.params;
    const { subject, body } = req.body;

    if (!subject || !body) {
      return res.status(400).json({ error: "Subject and body are required" });
    }

    const session = await prisma.session.findFirst({
      where: { shop: domain },
      select: { email: true },
    });

    if (!session || !session.email) {
      return res.status(400).json({ error: "No email address found on file for this shop session." });
    }

    const result = await EmailService.sendEmail({
      to: session.email,
      subject,
      body,
      template: "custom",
      shopDomain: domain,
    });

    res.json({ success: true, message: `Email sent to ${session.email} successfully.`, result });
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

// ─── GET /admin-api/emails — Audit sent email logs ────────────────────────────
router.get("/emails", validateSuperAdmin, async (req, res) => {
  try {
    const { page = "1", limit = "20" } = req.query;
    const take = parseInt(limit, 10);
    const skip = (parseInt(page, 10) - 1) * take;

    const [emails, total] = await Promise.all([
      prisma.emailLog.findMany({
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.emailLog.count(),
    ]);

    res.json({ emails, total, page: parseInt(page, 10), limit: take });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/emails/templates — Retrieve presets ───────────────────────
router.get("/emails/templates", validateSuperAdmin, (req, res) => {
  res.json({ templates: EMAIL_TEMPLATES });
});

// ─── POST /admin-api/emails/send-bulk — Send bulk personalized emails ─────────
router.post("/emails/send-bulk", validateSuperAdmin, async (req, res) => {
  try {
    const { recipientType, recipientPlanId, subject, body, templateKey } = req.body;

    if (!subject || !body) {
      return res.status(400).json({ error: "Subject and body are required" });
    }

    // Resolve target stores based on filters
    const where = {};
    if (recipientType === "active") {
      where.uninstalledAt = null;
    } else if (recipientType === "deactivated") {
      where.uninstalledAt = { not: null };
    } else if (recipientType === "by_plan" && recipientPlanId) {
      where.planKey = { contains: recipientPlanId };
    }

    const shops = await prisma.shop.findMany({ where });
    let sentCount = 0;

    for (const shop of shops) {
      const session = await prisma.session.findFirst({
        where: { shop: shop.domain },
        select: { email: true },
      });

      if (session?.email) {
        // Substitute placeholders
        const personalSubject = subject
          .replace(/{shop_name}/g, shop.domain)
          .replace(/{domain}/g, shop.domain)
          .replace(/{app_name}/g, "Blogger");

        const personalBody = body
          .replace(/{shop_name}/g, shop.domain)
          .replace(/{domain}/g, shop.domain)
          .replace(/{app_name}/g, "Blogger");

        await EmailService.sendEmail({
          to: session.email,
          subject: personalSubject,
          body: personalBody,
          template: templateKey || "custom",
          shopDomain: shop.domain,
        });

        sentCount++;
      }
    }

    // Log Activity
    await prisma.adminActivityLog.create({
      data: {
        action: `Sent bulk customized email to ${sentCount} store(s)`,
        targetType: "email",
        meta: { recipientType, recipientPlanId, subject, sentCount },
      },
    });

    res.json({ success: true, message: `Successfully queued/sent emails to ${sentCount} store(s).` });
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

// ─── GET /admin-api/settings — Retrieve billing enabled setting ───────────────
router.get("/settings", validateSuperAdmin, async (req, res) => {
  try {
    const pricingSetting = await prisma.adminSetting.findUnique({
      where: { key: "pricing_enabled" },
    });

    res.json({
      pricingEnabled: pricingSetting ? pricingSetting.value === "true" : true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /admin-api/settings — Update billing settings ───────────────────────
router.post("/settings", validateSuperAdmin, async (req, res) => {
  try {
    const { pricingEnabled } = req.body;

    const value = pricingEnabled ? "true" : "false";

    await prisma.adminSetting.upsert({
      where: { key: "pricing_enabled" },
      create: { key: "pricing_enabled", value },
      update: { value },
    });

    await prisma.adminActivityLog.create({
      data: {
        action: `Pricing toggled to: ${value}`,
        targetType: "setting",
        meta: { pricingEnabled: value },
      },
    });

    res.json({ success: true, pricingEnabled });
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

// ─── GET /admin-api/revenue/analytics — MRR breakdown reports ──────────────────
router.get("/revenue/analytics", validateSuperAdmin, async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    const pricingRates = {
      free: 0.0,
      starter: 4.99,
      pro: 9.99,
      business: 19.99,
    };

    // Calculate dynamic MRR/ARR based on active installations
    const activeShops = await prisma.shop.findMany({
      where: { uninstalledAt: null },
      select: { planKey: true },
    });

    let mrr = 0;
    activeShops.forEach((s) => {
      const plan = (s.planKey || "free").toLowerCase();
      if (plan.includes("starter")) mrr += pricingRates.starter;
      else if (plan.includes("pro")) mrr += pricingRates.pro;
      else if (plan.includes("business")) mrr += pricingRates.business;
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
    const pricingRates = {
      free: 0.0,
      starter: 4.99,
      pro: 9.99,
      business: 19.99,
    };

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
        const plan = (s.planKey || "free").toLowerCase();
        if (plan.includes("starter")) revenue += pricingRates.starter;
        else if (plan.includes("pro")) revenue += pricingRates.pro;
        else if (plan.includes("business")) revenue += pricingRates.business;
      });

      const monthName = new Date(currentYear, m - 1, 1).toLocaleString("default", { month: "long" });
      res.write(`"${monthName}",${newsCount},${churnedCount},${revenue.toFixed(2)}\n`);
    }

    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin-api/chats — Retrieve all active chat rooms & messages ──────────
router.get("/chats", validateSuperAdmin, (req, res) => {
  const chatHistory = req.app.get("chatHistory") || {};
  res.json({ chats: chatHistory });
});

// ─── POST /admin-api/chats/:room/reply — Reply to a chat room ───────────────
router.post("/chats/:room/reply", validateSuperAdmin, (req, res) => {
  const { room } = req.params;
  const { message } = req.body;
  const chatHistory = req.app.get("chatHistory") || {};
  const io = req.app.get("io");

  if (!chatHistory[room]) {
    chatHistory[room] = [];
  }

  const reply = {
    room,
    sender: "Support",
    senderName: "Support",
    text: message,
    message: message,
    timestamp: new Date().toISOString(),
  };

  chatHistory[room].push(reply);

  if (chatHistory[room].length > 100) {
    chatHistory[room] = chatHistory[room].slice(-100);
  }

  if (io) {
    io.to(room).emit("new_message", reply);
  }

  res.json({ success: true, reply });
});

export default router;

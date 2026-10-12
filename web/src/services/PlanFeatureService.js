/**
 * PlanFeatureService
 * Port of Laravel's PlanFeature model logic — manages plan-based feature gating.
 * Loads dynamically from database with synchronous caching.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Default plan feature map (mirrors Laravel's PlanFeature::mapForPlan)
const PLAN_DEFAULTS = {
  // Tier definitions below follow the merchant's own manually-authored feature list (each tier
  // is additive — "Starter = everything in Free, plus ..." — same as the pricing page itself
  // presents it). Block-family gating (product/product_text/product_sidebar/product_switcher/
  // product_slider/featured_product) now unlocks as ONE unit at Starter rather than progressively,
  // matching "Shopify Product Blocks" being a single line item, not several.
  free: {
    heading: { enabled: true, limit: null },
    text: { enabled: true, limit: null },
    image: { enabled: true, limit: null },
    divider: { enabled: true, limit: null },
    list: { enabled: true, limit: null },
    faq: { enabled: false, limit: null },
    image_text: { enabled: true, limit: null },
    video: { enabled: true, limit: null },
    table: { enabled: true, limit: null },
    button: { enabled: true, limit: null },
    featured_product: { enabled: false, limit: null },
    product: { enabled: false, limit: null },
    product_card: { enabled: false, limit: null },
    product_text: { enabled: false, limit: null },
    product_sidebar: { enabled: false, limit: null },
    product_slider: { enabled: false, limit: null },
    product_switcher: { enabled: false, limit: null },
    countdown: { enabled: false, limit: null },
    reviews: { enabled: false, limit: null },
    hero: { enabled: true, limit: null },
    announcement: { enabled: true, limit: null },
    custom_css: { enabled: false, limit: null },
    article_limit: { enabled: true, limit: 2 },
    toc: { enabled: false, limit: null },
    clone_article: { enabled: false, limit: null },
    post_scheduling: { enabled: false, limit: null },
    sync_actions: { enabled: false, limit: null },
    related_posts_manual: { enabled: false, limit: null },
    blog_sidebar: { enabled: false, limit: null },
    listing_layout: { enabled: false, limit: null },
    translations: { enabled: false, limit: null },
    seo_advanced: { enabled: true, limit: null },
    meta_robots: { enabled: false, limit: null },
    rich_snippets: { enabled: false, limit: null },
    xml_sitemap: { enabled: false, limit: null },
    theme_style_sync: { enabled: true, limit: null },
    device_visibility: { enabled: false, limit: null },
    remove_branding: { enabled: false, limit: null },
    analytics_dashboard: { enabled: true, limit: null },
    analytics_advanced: { enabled: false, limit: null },
    templates_premium: { enabled: true, limit: null },
    template_limit: { enabled: true, limit: 1 },
    ai_credits: { enabled: true, limit: 2 },
    custom_code_injection: { enabled: false, limit: null },
  },
  starter: {
    heading: { enabled: true, limit: null },
    text: { enabled: true, limit: null },
    image: { enabled: true, limit: null },
    divider: { enabled: true, limit: null },
    list: { enabled: true, limit: null },
    faq: { enabled: true, limit: null },
    image_text: { enabled: true, limit: null },
    video: { enabled: true, limit: null },
    table: { enabled: true, limit: null },
    button: { enabled: true, limit: null },
    featured_product: { enabled: true, limit: null },
    product: { enabled: true, limit: null },
    product_card: { enabled: true, limit: null },
    product_text: { enabled: true, limit: null },
    product_sidebar: { enabled: true, limit: null },
    product_slider: { enabled: true, limit: null },
    product_switcher: { enabled: true, limit: null },
    countdown: { enabled: false, limit: null },
    reviews: { enabled: false, limit: null },
    hero: { enabled: true, limit: null },
    announcement: { enabled: true, limit: null },
    custom_css: { enabled: true, limit: null },
    article_limit: { enabled: true, limit: 30 },
    toc: { enabled: true, limit: null },
    clone_article: { enabled: true, limit: null },
    post_scheduling: { enabled: false, limit: null },
    sync_actions: { enabled: true, limit: null },
    related_posts_manual: { enabled: true, limit: null },
    blog_sidebar: { enabled: false, limit: null },
    listing_layout: { enabled: true, limit: null },
    translations: { enabled: false, limit: null },
    seo_advanced: { enabled: true, limit: null },
    meta_robots: { enabled: true, limit: null },
    rich_snippets: { enabled: true, limit: null },
    xml_sitemap: { enabled: false, limit: null },
    theme_style_sync: { enabled: true, limit: null },
    device_visibility: { enabled: false, limit: null },
    remove_branding: { enabled: true, limit: null },
    analytics_dashboard: { enabled: true, limit: null },
    analytics_advanced: { enabled: false, limit: null },
    templates_premium: { enabled: true, limit: null },
    template_limit: { enabled: true, limit: 10 },
    ai_credits: { enabled: true, limit: 15 },
    custom_code_injection: { enabled: false, limit: null },
  },
  pro: {
    heading: { enabled: true, limit: null },
    text: { enabled: true, limit: null },
    image: { enabled: true, limit: null },
    divider: { enabled: true, limit: null },
    list: { enabled: true, limit: null },
    faq: { enabled: true, limit: null },
    image_text: { enabled: true, limit: null },
    video: { enabled: true, limit: null },
    table: { enabled: true, limit: null },
    button: { enabled: true, limit: null },
    featured_product: { enabled: true, limit: null },
    product: { enabled: true, limit: null },
    product_card: { enabled: true, limit: null },
    product_text: { enabled: true, limit: null },
    product_sidebar: { enabled: true, limit: null },
    product_slider: { enabled: true, limit: null },
    product_switcher: { enabled: true, limit: null },
    countdown: { enabled: true, limit: null },
    reviews: { enabled: true, limit: null },
    hero: { enabled: true, limit: null },
    announcement: { enabled: true, limit: null },
    custom_css: { enabled: true, limit: null },
    article_limit: { enabled: true, limit: null },
    toc: { enabled: true, limit: null },
    clone_article: { enabled: true, limit: null },
    post_scheduling: { enabled: true, limit: null },
    sync_actions: { enabled: true, limit: null },
    related_posts_manual: { enabled: true, limit: null },
    blog_sidebar: { enabled: true, limit: null },
    listing_layout: { enabled: true, limit: null },
    translations: { enabled: true, limit: null },
    seo_advanced: { enabled: true, limit: null },
    meta_robots: { enabled: true, limit: null },
    rich_snippets: { enabled: true, limit: null },
    xml_sitemap: { enabled: true, limit: null },
    theme_style_sync: { enabled: true, limit: null },
    device_visibility: { enabled: true, limit: null },
    remove_branding: { enabled: true, limit: null },
    analytics_dashboard: { enabled: true, limit: null },
    analytics_advanced: { enabled: true, limit: null },
    templates_premium: { enabled: true, limit: null },
    template_limit: { enabled: true, limit: null },
    ai_credits: { enabled: true, limit: 40 },
    custom_code_injection: { enabled: true, limit: null },
  },
  business: {
    heading: { enabled: true, limit: null },
    text: { enabled: true, limit: null },
    image: { enabled: true, limit: null },
    divider: { enabled: true, limit: null },
    list: { enabled: true, limit: null },
    faq: { enabled: true, limit: null },
    image_text: { enabled: true, limit: null },
    video: { enabled: true, limit: null },
    table: { enabled: true, limit: null },
    button: { enabled: true, limit: null },
    featured_product: { enabled: true, limit: null },
    product: { enabled: true, limit: null },
    product_card: { enabled: true, limit: null },
    product_text: { enabled: true, limit: null },
    product_sidebar: { enabled: true, limit: null },
    product_slider: { enabled: true, limit: null },
    product_switcher: { enabled: true, limit: null },
    countdown: { enabled: true, limit: null },
    reviews: { enabled: true, limit: null },
    hero: { enabled: true, limit: null },
    announcement: { enabled: true, limit: null },
    custom_css: { enabled: true, limit: null },
    article_limit: { enabled: true, limit: null },
    toc: { enabled: true, limit: null },
    clone_article: { enabled: true, limit: null },
    post_scheduling: { enabled: true, limit: null },
    sync_actions: { enabled: true, limit: null },
    related_posts_manual: { enabled: true, limit: null },
    blog_sidebar: { enabled: true, limit: null },
    listing_layout: { enabled: true, limit: null },
    translations: { enabled: true, limit: null },
    seo_advanced: { enabled: true, limit: null },
    meta_robots: { enabled: true, limit: null },
    rich_snippets: { enabled: true, limit: null },
    xml_sitemap: { enabled: true, limit: null },
    theme_style_sync: { enabled: true, limit: null },
    device_visibility: { enabled: true, limit: null },
    remove_branding: { enabled: true, limit: null },
    analytics_dashboard: { enabled: true, limit: null },
    analytics_advanced: { enabled: true, limit: null },
    templates_premium: { enabled: true, limit: null },
    template_limit: { enabled: true, limit: null },
    ai_credits: { enabled: true, limit: 100 },
    custom_code_injection: { enabled: true, limit: null },
  },
};

let cachedFeatures = { ...PLAN_DEFAULTS };

/** Keys whose plan placement was changed in code — upsert so existing DBs match. */
const PLACEMENT_SYNC_KEYS = ["blog_sidebar", "listing_layout"];

/**
 * Writes PLAN_DEFAULTS into PlanFeature. Missing rows are created. `overwriteKeys`
 * are updated even when a row already exists (used when a feature moves between plans).
 */
export async function upsertPlanFeaturesFromDefaults({ overwriteKeys = [] } = {}) {
  for (const [plan, fMap] of Object.entries(PLAN_DEFAULTS)) {
    for (const [featureKey, opt] of Object.entries(fMap)) {
      const existing = await prisma.planFeature.findUnique({
        where: { plan_featureKey: { plan, featureKey } },
      });
      if (!existing) {
        await prisma.planFeature.create({
          data: { plan, featureKey, enabled: opt.enabled, limit: opt.limit },
        });
      } else if (overwriteKeys.includes(featureKey)) {
        await prisma.planFeature.update({
          where: { plan_featureKey: { plan, featureKey } },
          data: { enabled: opt.enabled, limit: opt.limit },
        });
      }
    }
  }
}

export async function initPlanFeatures() {
  try {
    const count = await prisma.planFeature.count();
    if (count === 0) {
      // Seed default features into MySQL
      const dataToCreate = [];
      for (const [plan, fMap] of Object.entries(PLAN_DEFAULTS)) {
        for (const [featureKey, opt] of Object.entries(fMap)) {
          dataToCreate.push({
            plan,
            featureKey,
            enabled: opt.enabled,
            limit: opt.limit,
          });
        }
      }
      await prisma.planFeature.createMany({
        data: dataToCreate,
      });
    } else {
      await upsertPlanFeaturesFromDefaults({ overwriteKeys: PLACEMENT_SYNC_KEYS });
    }

    // Retrieve live values from database
    const dbFeatures = await prisma.planFeature.findMany();
    const newCache = {
      free: {},
      starter: {},
      pro: {},
      business: {},
    };

    dbFeatures.forEach((f) => {
      const p = f.plan.toLowerCase();
      if (!newCache[p]) newCache[p] = {};
      newCache[p][f.featureKey] = {
        enabled: f.enabled,
        limit: f.limit,
      };
    });

    // Fill in fallback defaults if database entries are missing
    for (const [plan, fMap] of Object.entries(PLAN_DEFAULTS)) {
      for (const [featureKey, opt] of Object.entries(fMap)) {
        if (!newCache[plan] || !newCache[plan][featureKey]) {
          if (!newCache[plan]) newCache[plan] = {};
          newCache[plan][featureKey] = opt;
        }
      }
    }

    cachedFeatures = newCache;
  } catch (err) {
    console.error("Failed to initialize plan features:", err);
  }
}

// Fire initialization on startup
initPlanFeatures();

export function refreshPlanFeaturesCache() {
  return initPlanFeatures();
}

export function getFeaturesForPlan(planKey) {
  const plan = (planKey || "free").toLowerCase().trim();
  // Map "blogger starter/pro/business" strings to key categories
  let key = "free";
  if (plan.includes("starter")) key = "starter";
  else if (plan.includes("pro")) key = "pro";
  else if (plan.includes("business")) key = "business";
  
  return cachedFeatures[key] || cachedFeatures["free"];
}

export function isFeatureEnabled(planKey, featureKey) {
  const features = getFeaturesForPlan(planKey);
  return features[featureKey]?.enabled ?? false;
}

export function getFeatureLimit(planKey, featureKey) {
  const features = getFeaturesForPlan(planKey);
  return features[featureKey]?.limit ?? null;
}

export function getArticleLimit(planKey) {
  return getFeatureLimit(planKey, "article_limit");
}

function calculateArticlePeriodRollover(shop, now) {
  const planKey = shop.planKey || "free";
  const startedAt = validDate(shop.articlePeriodStartedAt);
  const storedEnd = validDate(shop.articlePeriodEndsAt);
  const planChanged = shop.articlePeriodPlanKey !== planKey;

  if (planChanged || !startedAt) {
    return { shouldReset: true, periodStartedAt: now, periodEndsAt: nextCalendarMonth(now) };
  }

  let periodEnd = storedEnd || nextCalendarMonth(startedAt);
  if (periodEnd > now) return { shouldReset: false };

  const anchorDay = startedAt.getUTCDate();
  let periodStart = periodEnd;
  do {
    periodStart = periodEnd;
    periodEnd = nextCalendarMonth(periodEnd, anchorDay);
  } while (periodEnd <= now);
  return { shouldReset: true, periodStartedAt: periodStart, periodEndsAt: periodEnd };
}

/** Refresh the paid article allowance. Free's article cap is intentionally lifetime and is
 * therefore enforced from its Post count instead of this period ledger. */
export async function refreshArticlePeriod(shop, prismaClient, attempt = 0) {
  if (!shop || resolvePlanBucket(shop.planKey) === "free") return shop;
  const rollover = calculateArticlePeriodRollover(shop, new Date());
  if (!rollover.shouldReset) return shop;

  const { count } = await prismaClient.shop.updateMany({
    where: {
      id: shop.id,
      planKey: shop.planKey,
      articlePeriodUsed: shop.articlePeriodUsed || 0,
      articlePeriodStartedAt: shop.articlePeriodStartedAt || null,
      articlePeriodEndsAt: shop.articlePeriodEndsAt || null,
      articlePeriodPlanKey: shop.articlePeriodPlanKey || null,
    },
    data: {
      articlePeriodUsed: 0,
      articlePeriodStartedAt: rollover.periodStartedAt,
      articlePeriodEndsAt: rollover.periodEndsAt,
      articlePeriodPlanKey: shop.planKey || "free",
    },
  });
  if (count === 1) return {
    ...shop, articlePeriodUsed: 0,
    articlePeriodStartedAt: rollover.periodStartedAt,
    articlePeriodEndsAt: rollover.periodEndsAt,
    articlePeriodPlanKey: shop.planKey || "free",
  };
  const current = await prismaClient.shop.findUnique({ where: { id: shop.id } });
  if (!current || attempt >= 2) return current || shop;
  return refreshArticlePeriod(current, prismaClient, attempt + 1);
}

/** Atomically reserve one paid-plan article slot immediately before a Post is created. */
export async function reserveArticleAllowance(shop, prismaClient, attempt = 0) {
  const current = await refreshArticlePeriod(shop, prismaClient);
  const limit = getArticleLimit(current?.planKey);
  if (!current || limit == null || resolvePlanBucket(current.planKey) === "free") {
    return { allowed: true, reserved: false, shop: current };
  }
  const { count } = await prismaClient.shop.updateMany({
    where: {
      id: current.id,
      planKey: current.planKey,
      articlePeriodPlanKey: current.articlePeriodPlanKey,
      articlePeriodEndsAt: current.articlePeriodEndsAt,
      articlePeriodUsed: { lt: limit },
    },
    data: { articlePeriodUsed: { increment: 1 } },
  });
  if (count === 1) return { allowed: true, reserved: true, shop: { ...current, articlePeriodUsed: (current.articlePeriodUsed || 0) + 1 } };
  if (attempt >= 1) return { allowed: false, reserved: false, shop: current };
  const latest = await prismaClient.shop.findUnique({ where: { id: current.id } });
  return reserveArticleAllowance(latest, prismaClient, attempt + 1);
}

/** Release a reservation only if Post creation itself failed before a row was persisted. */
export async function releaseArticleAllowance(reservation, prismaClient) {
  if (!reservation?.reserved || !reservation.shop) return;
  await prismaClient.shop.updateMany({
    where: {
      id: reservation.shop.id,
      planKey: reservation.shop.planKey,
      articlePeriodPlanKey: reservation.shop.articlePeriodPlanKey,
      articlePeriodEndsAt: reservation.shop.articlePeriodEndsAt,
      articlePeriodUsed: { gt: 0 },
    },
    data: { articlePeriodUsed: { decrement: 1 } },
  });
}

export function getArticleUsageStatus(planKey, articlePeriodUsed = 0, lifetimePostCount = 0) {
  const limit = getArticleLimit(planKey);
  const used = resolvePlanBucket(planKey) === "free"
    ? Math.max(0, lifetimePostCount || 0)
    : Math.max(0, articlePeriodUsed || 0);
  return { used, limit, remaining: limit == null ? null : Math.max(0, limit - used) };
}

/**
 * How many templates of their own a shop may keep. null = unlimited (Pro and above).
 */
export function getSavedTemplateLimit(planKey) {
  return getFeatureLimit(planKey, "template_limit");
}

/**
 * How many AI article generations a shop gets each month. null = unlimited.
 *
 * Paid-plan allowances refresh monthly even when Shopify charges the subscription annually.
 * The Free plan remains a one-time, lifetime allowance.
 */
export function getAiCreditLimit(planKey) {
  return getFeatureLimit(planKey, "ai_credits");
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Move to the next calendar-month boundary without Date#setMonth's Jan 31 -> Mar 3 rollover. */
function nextCalendarMonth(date, anchorDay = date.getUTCDate()) {
  const next = new Date(date);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    0,
    next.getUTCHours(),
    next.getUTCMinutes(),
    next.getUTCSeconds(),
    next.getUTCMilliseconds(),
  )).getUTCDate();
  next.setUTCDate(Math.min(anchorDay, lastDay));
  return next;
}

function calculateAiCreditRollover(shop, now, billingPeriodEnd = null) {
  const planKey = shop.planKey || "free";
  const startedAt = validDate(shop.aiCreditPeriodStartedAt);
  const storedEnd = validDate(shop.aiCreditPeriodEndsAt);
  const suppliedEnd = validDate(billingPeriodEnd);
  const planChanged = shop.aiCreditPeriodPlanKey !== planKey;

  // A subscription renewal date is useful only when it is the next monthly boundary. Annual
  // subscription renewals must never turn the monthly credit allowance into a yearly allowance.
  const suppliedMonthlyEnd = suppliedEnd && suppliedEnd > now &&
    suppliedEnd.getTime() - now.getTime() <= 35 * 24 * 60 * 60 * 1000
    ? suppliedEnd
    : null;

  if (planChanged || !startedAt) {
    return {
      shouldReset: true,
      periodStartedAt: now,
      periodEndsAt: suppliedMonthlyEnd || nextCalendarMonth(now),
    };
  }

  let periodEnd = storedEnd || suppliedMonthlyEnd || nextCalendarMonth(startedAt);
  if (periodEnd > now) return { shouldReset: false };

  const anchorDay = startedAt.getUTCDate();
  let periodStart = periodEnd;
  do {
    periodStart = periodEnd;
    periodEnd = nextCalendarMonth(periodEnd, anchorDay);
  } while (periodEnd <= now);

  return { shouldReset: true, periodStartedAt: periodStart, periodEndsAt: periodEnd };
}

/** Refresh paid plan-funded allowances once per calendar month. Free-plan credits and one-time
 * purchased credits never expire here. aiCreditsUsed retains aiCreditsPurchasedUsed as its
 * baseline so the existing two-pool calculation still reports zero plan usage after a reset.
 *
 * The compare-and-set guards make rollover safe when several app requests arrive together at a
 * boundary: only the first request that still sees the old period/counters can reset them. */
export async function refreshAiCreditPeriod(shop, prismaClient, billingPeriodEnd = null, attempt = 0) {
  if (!shop) return shop;
  const planKey = shop.planKey || "free";
  // Free includes a small, lifetime credit allowance. Only paid subscription tiers replenish.
  if (resolvePlanBucket(planKey) === "free") return shop;

  const now = new Date();
  const rollover = calculateAiCreditRollover(shop, now, billingPeriodEnd);
  if (!rollover.shouldReset) return shop;

  const { count } = await prismaClient.shop.updateMany({
    where: {
      id: shop.id,
      planKey: shop.planKey,
      aiCreditsUsed: shop.aiCreditsUsed || 0,
      aiCreditsPurchasedUsed: shop.aiCreditsPurchasedUsed || 0,
      aiCreditPeriodStartedAt: shop.aiCreditPeriodStartedAt || null,
      aiCreditPeriodEndsAt: shop.aiCreditPeriodEndsAt || null,
      aiCreditPeriodPlanKey: shop.aiCreditPeriodPlanKey || null,
    },
    data: {
      aiCreditsUsed: shop.aiCreditsPurchasedUsed || 0,
      aiCreditPeriodStartedAt: rollover.periodStartedAt,
      aiCreditPeriodEndsAt: rollover.periodEndsAt,
      aiCreditPeriodPlanKey: planKey,
    },
  });

  if (count === 1) {
    return {
      ...shop,
      aiCreditsUsed: shop.aiCreditsPurchasedUsed || 0,
      aiCreditPeriodStartedAt: rollover.periodStartedAt,
      aiCreditPeriodEndsAt: rollover.periodEndsAt,
      aiCreditPeriodPlanKey: planKey,
    };
  }

  // Another request changed the counters or completed the rollover first. Re-read rather than
  // overwriting its work; bound the retries so a very busy shop can never spin indefinitely.
  const current = await prismaClient.shop.findUnique({ where: { id: shop.id } });
  if (!current || attempt >= 2) return current || shop;
  return refreshAiCreditPeriod(current, prismaClient, billingPeriodEnd, attempt + 1);
}

/**
 * The real, downgrade-proof answer to "can this shop generate right now, and from which pool":
 * two independent buckets — the plan's own ai_credits allowance, and whatever's been topped up
 * via one-time AiCreditPurchase packs (Shop.aiCreditsPurchased) — rather than one flat
 * "planLimit + purchased" ceiling compared against one flat lifetime-used counter.
 *
 * That flat approach breaks the moment a plan downgrade shrinks the plan's own limit below what
 * the shop already used: e.g. Pro (100 credits) used 63, buys a 10-pack, downgrades to Free
 * (3 credits) — a flat check sees `used(63) >= planLimit(3) + purchased(10) = 13` and blocks
 * generation entirely, silently stranding the 10 credits they just paid for. Tracking
 * aiCreditsPurchasedUsed separately from aiCreditsUsed means the purchased pool's own remaining
 * balance (10 - 0 = 10) is checked independently of the plan's — so those 10 stay spendable on
 * Free, and only once BOTH pools are exhausted does generation actually block.
 *
 * meterUsed/meterLimit are a display-safe used/limit pair for progress-bar UIs: in the downgrade
 * scenario above, a raw `aiCreditsUsed(63) of effectiveLimit(13)` pair would render as a broken
 * >100% bar with "0 left" while generation is actually still allowed - meterUsed is derived from
 * `effectiveLimit - remaining` instead, so it's always <= effectiveLimit and matches what's
 * actually true (a normal shop with no downgrade quirk sees meterUsed === aiCreditsUsed exactly).
 */
export function getAiCreditStatus(planKey, aiCreditsUsed = 0, aiCreditsPurchased = 0, aiCreditsPurchasedUsed = 0, freeAiCreditsUsed = 0) {
  const planLimit = getAiCreditLimit(planKey);
  const purchased = Math.max(0, aiCreditsPurchased || 0);
  const purchasedUsed = Math.max(0, aiCreditsPurchasedUsed || 0);
  const purchasedRemaining = Math.max(0, purchased - purchasedUsed);

  if (planLimit == null) {
    // Plan itself is already unlimited - nothing ever needs to draw from the purchased pool.
    return {
      planLimit: null,
      effectiveLimit: null,
      remaining: null,
      purchasedRemaining,
      meterUsed: Math.max(0, aiCreditsUsed || 0),
      meterLimit: null,
      canGenerate: true,
      nextCreditSource: "plan",
    };
  }

  const planCreditsUsed = resolvePlanBucket(planKey) === "free"
    ? Math.max(0, freeAiCreditsUsed || 0)
    : Math.max(0, (aiCreditsUsed || 0) - purchasedUsed);
  const planRemaining = Math.max(0, planLimit - planCreditsUsed);
  const remaining = planRemaining + purchasedRemaining;
  const effectiveLimit = planLimit + purchased;

  return {
    planLimit,
    effectiveLimit,
    remaining,
    purchasedRemaining,
    meterUsed: Math.max(0, effectiveLimit - remaining),
    meterLimit: effectiveLimit,
    canGenerate: remaining > 0,
    // Which pool the NEXT generation should draw from - the plan's own allowance first, the
    // purchased pool only once that's exhausted for the CURRENT plan (so a downgrade that shrinks
    // the plan's allowance correctly routes new generations to the purchased pool immediately).
    nextCreditSource: planRemaining > 0 ? "plan" : "purchased",
  };
}

function resolvePlanBucket(planKey) {
  const plan = (planKey || "free").toLowerCase().trim();
  if (plan.includes("starter")) return "starter";
  if (plan.includes("pro")) return "pro";
  if (plan.includes("business")) return "business";
  return "free";
}

// The merchant pricing page's bullet list is the merchant's own exact, literal, hand-specified
// copy — not auto-composed from raw featureKey labels. Each tier is additive ("Starter =
// everything in Free, plus ...", "Pro = everything in Starter, plus ..."), matching how the page
// itself presents it with an "All X Plan features +" banner.
//
// A bullet is NOT pinned to a fixed tier. Each entry in MASTER_BULLETS is `{ label, keys }` —
// `keys` are the PlanFeature featureKey(s) it represents (several keys, e.g. "Shopify Product
// Blocks", only count as satisfied when EVERY one of them is enabled); `keys: []` marks a bullet
// with no backing gate at all (always-on copy like "Drag & Drop Builder") that's simply pinned to
// Free, where it's written. Every other bullet is shown on whichever tier is the FIRST (cheapest,
// scanning Free -> Starter -> Pro) to have it enabled — never on more than one tier at once, and
// never on none if it's enabled anywhere. This is what makes Sync Features fully live and
// two-way: disabling a bullet's keys on the tier it's currently shown on doesn't delete it from
// the page, it re-appears on the next tier up that still has it enabled (e.g. disable "FAQ Block"
// on Starter while it's still enabled on Pro — it now shows on Pro instead of vanishing);
// enabling it on a cheaper tier pulls it back down. Disabling it everywhere is the only way to
// make it disappear entirely, which is correct — there's genuinely nothing to sell at that point.
//
// The article-count bullet is handled separately per tier (own wording, own live limit) since
// it's numeric and always present, never a moving boolean.
const ARTICLE_LIMIT_RENDER = {
  free: (f) => `Up to ${f.article_limit?.limit ?? 2} Articles (lifetime)`,
  starter: (f) => `Up to ${f.article_limit?.limit ?? 30} Monthly Articles`,
  pro: () => "Unlimited Articles",
};
ARTICLE_LIMIT_RENDER.business = ARTICLE_LIMIT_RENDER.pro;

// Saved templates are the app's second numeric cap, so they get the same per-tier treatment as
// articles: always present, wording driven by the live PlanFeature limit rather than a boolean.
const AI_CREDIT_RENDER = (f) => {
  const limit = f.ai_credits?.limit;
  if (limit === 0) return null;
  return limit == null ? "Unlimited AI Credits" : `${limit} AI Credits`;
};

const TEMPLATE_LIMIT_RENDER = (f) => {
  const limit = f.template_limit?.limit;
  return limit == null ? "Unlimited Saved Templates" : `${limit} Saved Templates`;
};

const PRICE_ORDER = ["free", "starter", "pro"];

const MASTER_BULLETS = [
  { label: "Drag & Drop Builder", keys: [] },
  { label: "Analytics Dashboard", keys: ["analytics_dashboard"] },
  { label: "SEO Meta (basic)", keys: [] },
  { label: "Author", keys: [] },
  { label: "Blog Management", keys: [] },
  { label: "21+ Blog Templates", keys: [] },
  { label: "Sync Theme Colors", keys: ["theme_style_sync"] },
  { label: "Blog Comments", keys: [] },
  { label: "Import Shopify Blogs", keys: [] },
  { label: "Clone Article", keys: ["clone_article"] },
  { label: "Shopify Product Blocks", keys: ["product", "product_card", "product_text", "product_sidebar", "product_slider", "product_switcher", "featured_product"] },
  { label: "FAQ Block", keys: ["faq"] },
  { label: "Table Of Content", keys: ["toc"] },
  { label: "2 Way Sync", keys: ["sync_actions"] },
  { label: "Meta Robots & Rich Snippets", keys: ["meta_robots", "rich_snippets"] },
  { label: "Custom CSS", keys: ["custom_css"] },
  { label: "Related Posts", keys: ["related_posts_manual"] },
  { label: "Listing Layout", keys: ["listing_layout"] },
  { label: "Blog Sidebar", keys: ["blog_sidebar"] },
  { label: "Remove \"Powered By\" Branding", keys: ["remove_branding"] },
  { label: "Blog Post Scheduling", keys: ["post_scheduling"] },
  { label: "Multi Language Translation", keys: ["translations"] },
  { label: "Hide Sections Based on Device", keys: ["device_visibility"] },
  { label: "XML sitemap", keys: ["xml_sitemap"] },
  { label: "Custom Global Header & Footer", keys: ["custom_code_injection"] },
  { label: "Advanced Analytics", keys: ["analytics_advanced"] },
];

function isBulletEnabled(bullet, features) {
  return bullet.keys.length === 0 || bullet.keys.every((k) => features[k]?.enabled);
}

function getFeaturesByPriceTier() {
  return { free: getFeaturesForPlan("free"), starter: getFeaturesForPlan("starter"), pro: getFeaturesForPlan("pro") };
}

// `bucket` may be "business" (a dead tier that mirrors pro) — treated as pro's position for the
// purposes of "which tier is this" in the Free->Starter->Pro scan, but rendered with the
// business bucket's own article-limit row (which mirrors pro's value in the DB anyway).
function buildBulletsForBucket(bucket, featuresByPriceTier) {
  const ownFeatures = bucket === "business" ? getFeaturesForPlan("business") : featuresByPriceTier[bucket];
  const articleRender = ARTICLE_LIMIT_RENDER[bucket] || ARTICLE_LIMIT_RENDER.pro;
  const bullets = [articleRender(ownFeatures), TEMPLATE_LIMIT_RENDER(ownFeatures)];
  const aiBullet = AI_CREDIT_RENDER(ownFeatures);
  if (aiBullet) bullets.push(aiBullet);
  const comparableTier = bucket === "business" ? "pro" : bucket;
  for (const bullet of MASTER_BULLETS) {
    if (bullet.keys.length === 0) {
      if (bucket === "free") bullets.push(bullet.label);
      continue;
    }
    const firstEnabledTier = PRICE_ORDER.find((tier) => isBulletEnabled(bullet, featuresByPriceTier[tier]));
    if (firstEnabledTier === comparableTier) bullets.push(bullet.label);
  }
  return bullets;
}

/**
 * Builds the merchant-facing "what's included" bullet list for one plan in isolation. Needs every
 * tier's live features (not just this plan's own) to correctly compute which tier a movable
 * bullet currently floats to — see MASTER_BULLETS above. Used by Super Admin's plan cards, where
 * each plan needs to be inspected on its own.
 */
export function buildFeatureBulletsForPlan(planKey) {
  const bucket = resolvePlanBucket(planKey);
  return buildBulletsForBucket(bucket, getFeaturesByPriceTier());
}

/**
 * Builds the merchant-facing pricing page's per-plan bullet lists — the merchant's own exact,
 * literal copy per tier, additive ("Starter = Free's list is implied via the 'All Free Plan
 * features +' banner, then exactly its own rows; Pro likewise off Starter"), with every movable
 * bullet placed on whichever tier currently has it enabled first (see MASTER_BULLETS above).
 * `planKeysAscendingByPrice` must already be sorted cheapest-first (the same order the pricing
 * page renders cards in).
 *
 * Returns one entry per input plan: `{ basedOnIndex, bullets }` — `basedOnIndex` is the index of
 * the plan this one's "All X Plan features +" banner refers to (null for the cheapest/first plan).
 */
export function buildTieredPlanFeatures(planKeysAscendingByPrice) {
  const featuresByPriceTier = getFeaturesByPriceTier();
  return planKeysAscendingByPrice.map((planKey, index) => {
    const bucket = resolvePlanBucket(planKey);
    const bullets = buildBulletsForBucket(bucket, featuresByPriceTier);
    return { basedOnIndex: index > 0 ? index - 1 : null, bullets };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  Super Admin's "Plans & Billing" feature-comparison matrix
// ═══════════════════════════════════════════════════════════════════════════
//
// Every cell is computed live from the same PlanFeature rows the Sync Features/Sync Limits
// modals edit — nothing here is hand-typed marketing copy that can drift from what's actually
// gated. Each row's `cell(features)` gets the resolved feature map for one plan (from
// getFeaturesForPlan) and returns `{ icon, text }`. `icon` is one of "yes" | "no" | "partial" —
// the caller renders the actual glyph, this only classifies the cell so the UI stays consistent.
const FEATURE_COMPARISON_ROWS = [
  { feature: "Drag & Drop Builder", cell: () => ({ icon: "yes", text: "" }) }, // core editor is unrestricted at every tier
  {
    feature: "2-Way Synchronization",
    cell: (f) => (f.sync_actions?.enabled
      ? { icon: "yes", text: "Full 2-way (reconcile, bulk resync)" }
      : { icon: "partial", text: "Push only" }),
  },
  {
    feature: "Analytics",
    cell: (f) => {
      if (!f.analytics_dashboard?.enabled) return { icon: "no", text: "" };
      if (f.analytics_advanced?.enabled) return { icon: "yes", text: "Full + revenue, funnel, export" };
      return { icon: "partial", text: "Dashboard (views & visitors)" };
    },
  },
  {
    feature: "Multi-Language Support",
    cell: (f) => (f.translations?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }),
  },
  {
    feature: "Import Shopify Blogs",
    cell: (f) => {
      const limit = f.article_limit?.limit;
      return { icon: "yes", text: limit == null ? "Unlimited (counts toward article total)" : `Counts toward ${limit}-article limit` };
    },
  },
  {
    feature: "Blog Templates",
    cell: (f) => {
      const saved = f.template_limit?.limit;
      const own = saved == null ? "save unlimited of your own" : `save ${saved} of your own`;
      return { icon: "yes", text: `Full library (21) + ${own}` };
    },
  },
  {
    feature: "AI Credits",
    cell: (f) => {
      const limit = f.ai_credits?.limit;
      if (limit === 0) return { icon: "no", text: "" };
      return limit == null
        ? { icon: "yes", text: "Unlimited" }
        : { icon: "partial", text: `${limit} credits (one-off allowance)` };
    },
  },
  {
    feature: "Shopify Product Blocks",
    cell: (f) => (["product", "product_card", "product_text", "product_sidebar", "product_switcher", "product_slider", "featured_product"].some((k) => f[k]?.enabled)
      ? { icon: "yes", text: "" }
      : { icon: "no", text: "" }),
  },
  { feature: "Clone Article", cell: (f) => (f.clone_article?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "FAQ Blocks", cell: (f) => (f.faq?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "Related Blogs", cell: (f) => (f.related_posts_manual?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "Listing Layout", cell: (f) => (f.listing_layout?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "Blog Sidebar", cell: (f) => (f.blog_sidebar?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "Author Attribution", cell: () => ({ icon: "yes", text: "" }) }, // free-text field, unrestricted at every tier
  { feature: "Table of Contents", cell: (f) => (f.toc?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "Hide Sections by Device", cell: (f) => (f.device_visibility?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "SEO Meta (title, description, Open Graph, canonical URL)", cell: () => ({ icon: "yes", text: "" }) }, // unrestricted at every tier
  { feature: "Blog Post Scheduling", cell: (f) => (f.post_scheduling?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "Manage Blog Categories (News, Recipes, etc.)", cell: () => ({ icon: "yes", text: "Unlimited" }) }, // multi-blog management is unrestricted at every tier
  { feature: "Meta Robots (noindex/nofollow)", cell: (f) => (f.meta_robots?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "Rich Snippets (JSON-LD)", cell: (f) => (f.rich_snippets?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "Blog Comments", cell: () => ({ icon: "yes", text: "" }) }, // moderation stays free at every tier — trust/safety, not a growth lever
  { feature: "XML Sitemap", cell: (f) => (f.xml_sitemap?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "Sync with Your Theme Styles", cell: (f) => (f.theme_style_sync?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "Custom CSS", cell: (f) => (f.custom_css?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "Custom Global Header & Footer Code", cell: (f) => (f.custom_code_injection?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "Remove \"Powered By\" Branding", cell: (f) => (f.remove_branding?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "Badge shown" }) },
];

/**
 * Builds the full Free/Starter/Pro feature-comparison matrix for Super Admin's Pricing module —
 * every cell computed live from the real PlanFeature rows, so it can never drift from what's
 * actually gated the way a hand-typed comparison table would. `planKeys` lets the caller supply
 * the plan-tier order/keys to compare (defaults to the standard three).
 */
export function buildFeatureComparisonTable(planKeys = ["free", "starter", "pro"]) {
  const featuresByPlan = planKeys.map((key) => getFeaturesForPlan(key));
  return FEATURE_COMPARISON_ROWS.map((row, index) => ({
    number: index + 1,
    feature: row.feature,
    cells: planKeys.map((_, i) => row.cell(featuresByPlan[i])),
  }));
}

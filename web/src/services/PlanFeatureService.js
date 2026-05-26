/**
 * PlanFeatureService
 * Port of Laravel's PlanFeature model logic — manages plan-based feature gating.
 * Loads dynamically from database with synchronous caching.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Default plan feature map (mirrors Laravel's PlanFeature::mapForPlan)
const PLAN_DEFAULTS = {
  free: {
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
    blog: { enabled: true, limit: 3 },
    product: { enabled: false, limit: null },
    product_text: { enabled: false, limit: null },
    product_sidebar: { enabled: false, limit: null },
    product_slider: { enabled: false, limit: null },
    product_switcher: { enabled: false, limit: null },
    countdown: { enabled: false, limit: null },
    reviews: { enabled: false, limit: null },
    hero: { enabled: true, limit: null },
    announcement: { enabled: true, limit: null },
    custom_css: { enabled: false, limit: null },
    custom_js: { enabled: false, limit: null },
    article_limit: { enabled: true, limit: 3 },
    blog_select: { enabled: false, limit: null },
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
    blog: { enabled: true, limit: 5 },
    product: { enabled: true, limit: null },
    product_text: { enabled: true, limit: null },
    product_sidebar: { enabled: false, limit: null },
    product_slider: { enabled: true, limit: null },
    product_switcher: { enabled: false, limit: null },
    countdown: { enabled: false, limit: null },
    reviews: { enabled: false, limit: null },
    hero: { enabled: true, limit: null },
    announcement: { enabled: true, limit: null },
    custom_css: { enabled: false, limit: null },
    custom_js: { enabled: false, limit: null },
    article_limit: { enabled: true, limit: 20 },
    blog_select: { enabled: true, limit: 1 },
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
    blog: { enabled: true, limit: null },
    product: { enabled: true, limit: null },
    product_text: { enabled: true, limit: null },
    product_sidebar: { enabled: true, limit: null },
    product_slider: { enabled: true, limit: null },
    product_switcher: { enabled: true, limit: null },
    countdown: { enabled: true, limit: null },
    reviews: { enabled: true, limit: null },
    hero: { enabled: true, limit: null },
    announcement: { enabled: true, limit: null },
    custom_css: { enabled: true, limit: null },
    custom_js: { enabled: false, limit: null },
    article_limit: { enabled: true, limit: null },
    blog_select: { enabled: true, limit: null },
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
    blog: { enabled: true, limit: null },
    product: { enabled: true, limit: null },
    product_text: { enabled: true, limit: null },
    product_sidebar: { enabled: true, limit: null },
    product_slider: { enabled: true, limit: null },
    product_switcher: { enabled: true, limit: null },
    countdown: { enabled: true, limit: null },
    reviews: { enabled: true, limit: null },
    hero: { enabled: true, limit: null },
    announcement: { enabled: true, limit: null },
    custom_css: { enabled: true, limit: null },
    custom_js: { enabled: true, limit: null },
    article_limit: { enabled: true, limit: null },
    blog_select: { enabled: true, limit: null },
  },
};

let cachedFeatures = { ...PLAN_DEFAULTS };

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

export function maxSectionsForPlan(planKey) {
  const limits = { free: 5, starter: 15, pro: null, business: null };
  const plan = (planKey || "free").toLowerCase().trim();
  let key = "free";
  if (plan.includes("starter")) key = "starter";
  else if (plan.includes("pro")) key = "pro";
  else if (plan.includes("business")) key = "business";

  return limits[key] ?? null;
}

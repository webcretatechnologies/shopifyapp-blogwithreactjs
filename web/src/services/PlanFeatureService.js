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
    article_limit: { enabled: true, limit: 5 },
    blog_select: { enabled: false, limit: null },
    toc: { enabled: false, limit: null },
    clone_article: { enabled: false, limit: null },
    post_scheduling: { enabled: false, limit: null },
    sync_actions: { enabled: false, limit: null },
    related_posts_manual: { enabled: false, limit: null },
    translations: { enabled: false, limit: null },
    seo_advanced: { enabled: true, limit: null },
    meta_robots: { enabled: false, limit: null },
    rich_snippets: { enabled: false, limit: null },
    xml_sitemap: { enabled: false, limit: null },
    theme_style_sync: { enabled: true, limit: null },
    max_blogs: { enabled: true, limit: 1 },
    device_visibility: { enabled: false, limit: null },
    remove_branding: { enabled: false, limit: null },
    analytics_dashboard: { enabled: true, limit: null },
    analytics_advanced: { enabled: false, limit: null },
    templates_premium: { enabled: false, limit: null },
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
    blog: { enabled: true, limit: 5 },
    product: { enabled: true, limit: null },
    product_text: { enabled: true, limit: null },
    product_sidebar: { enabled: true, limit: null },
    product_slider: { enabled: true, limit: null },
    product_switcher: { enabled: true, limit: null },
    countdown: { enabled: false, limit: null },
    reviews: { enabled: false, limit: null },
    hero: { enabled: true, limit: null },
    announcement: { enabled: true, limit: null },
    custom_css: { enabled: true, limit: null },
    custom_js: { enabled: false, limit: null },
    article_limit: { enabled: true, limit: 20 },
    blog_select: { enabled: true, limit: 1 },
    toc: { enabled: true, limit: null },
    clone_article: { enabled: true, limit: null },
    post_scheduling: { enabled: false, limit: null },
    sync_actions: { enabled: true, limit: null },
    related_posts_manual: { enabled: true, limit: null },
    translations: { enabled: false, limit: null },
    seo_advanced: { enabled: true, limit: null },
    meta_robots: { enabled: true, limit: null },
    rich_snippets: { enabled: true, limit: null },
    xml_sitemap: { enabled: false, limit: null },
    theme_style_sync: { enabled: true, limit: null },
    max_blogs: { enabled: true, limit: 3 },
    device_visibility: { enabled: false, limit: null },
    remove_branding: { enabled: true, limit: null },
    analytics_dashboard: { enabled: true, limit: null },
    analytics_advanced: { enabled: false, limit: null },
    templates_premium: { enabled: true, limit: null },
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
    toc: { enabled: true, limit: null },
    clone_article: { enabled: true, limit: null },
    post_scheduling: { enabled: true, limit: null },
    sync_actions: { enabled: true, limit: null },
    related_posts_manual: { enabled: true, limit: null },
    translations: { enabled: true, limit: null },
    seo_advanced: { enabled: true, limit: null },
    meta_robots: { enabled: true, limit: null },
    rich_snippets: { enabled: true, limit: null },
    xml_sitemap: { enabled: true, limit: null },
    theme_style_sync: { enabled: true, limit: null },
    max_blogs: { enabled: true, limit: null },
    device_visibility: { enabled: true, limit: null },
    remove_branding: { enabled: true, limit: null },
    analytics_dashboard: { enabled: true, limit: null },
    analytics_advanced: { enabled: true, limit: null },
    templates_premium: { enabled: true, limit: null },
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
    toc: { enabled: true, limit: null },
    clone_article: { enabled: true, limit: null },
    post_scheduling: { enabled: true, limit: null },
    sync_actions: { enabled: true, limit: null },
    related_posts_manual: { enabled: true, limit: null },
    translations: { enabled: true, limit: null },
    seo_advanced: { enabled: true, limit: null },
    meta_robots: { enabled: true, limit: null },
    rich_snippets: { enabled: true, limit: null },
    xml_sitemap: { enabled: true, limit: null },
    theme_style_sync: { enabled: true, limit: null },
    max_blogs: { enabled: true, limit: null },
    device_visibility: { enabled: true, limit: null },
    remove_branding: { enabled: true, limit: null },
    analytics_dashboard: { enabled: true, limit: null },
    analytics_advanced: { enabled: true, limit: null },
    templates_premium: { enabled: true, limit: null },
    custom_code_injection: { enabled: true, limit: null },
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

// DB-driven (PlanFeature "section_limit" row per plan, editable from Super Admin's Sync Limits
// modal) — the hardcoded map is now only a last-resort fallback if that row is somehow missing,
// not the primary source. Previously this was hardcoded here with no admin UI to change it.
const FALLBACK_SECTION_LIMITS = { free: 5, starter: 15, pro: null, business: null };

export function maxSectionsForPlan(planKey) {
  const features = getFeaturesForPlan(planKey);
  if (features && "section_limit" in features) {
    return features.section_limit?.limit ?? null;
  }
  const plan = (planKey || "free").toLowerCase().trim();
  let key = "free";
  if (plan.includes("starter")) key = "starter";
  else if (plan.includes("pro")) key = "pro";
  else if (plan.includes("business")) key = "business";
  return FALLBACK_SECTION_LIMITS[key] ?? null;
}

function resolvePlanBucket(planKey) {
  const plan = (planKey || "free").toLowerCase().trim();
  if (plan.includes("starter")) return "starter";
  if (plan.includes("pro")) return "pro";
  if (plan.includes("business")) return "business";
  return "free";
}

// The merchant pricing page's bullet list is the merchant's own exact, literal, hand-specified
// copy — not auto-composed from raw featureKey labels. Each tier below is additive ("Starter =
// everything in Free, plus ...", "Pro = everything in Starter, plus ..."), matching how the page
// itself presents it with an "All X Plan features +" banner. Article/section-count rows use the
// real live limit from PlanFeature so they never drift if an admin changes a cap later; every
// other row is fixed text, deliberately — the merchant asked for exact wording and an exact count
// per tier, not an auto-generated summary of every underlying toggle.
const TIER_ROWS = {
  free: [
    () => "Drag & Drop Builder",
    (f) => `Up to ${f.article_limit?.limit ?? 5} Articles`,
    (f) => `Up to ${f.section_limit?.limit ?? 15} Sections Per Article`,
    () => "Analytics Dashboard",
    () => "SEO Meta (basic)",
    () => "Author",
    () => "Blog Management",
    () => "Blog Templates",
    () => "Sync Theme Colors",
    () => "Blog Comments",
  ],
  starter: [
    (f) => `Up to ${f.article_limit?.limit ?? 20} Articles`,
    (f) => `Up to ${f.section_limit?.limit ?? 30} Sections Per Article`,
    () => "Clone Article",
    () => "Shopify Product Blocks",
    () => "FAQ Block",
    () => "Table Of Content",
    () => "2 Way Sync",
    () => "Meta Robots & Rich Snippets",
    () => "Custom CSS",
    () => "Analytics Dashboard",
    () => "Related Posts",
  ],
  pro: [
    () => "Unlimited Articles",
    () => "Unlimited Sections Per Article",
    () => "Blog Post Scheduling",
    () => "Multi Language Translation",
    () => "Hide Sections Based on Device",
    () => "XML sitemap",
    () => "Custom Global Header & Footer",
    () => "Advanced Analytics",
  ],
};
TIER_ROWS.business = TIER_ROWS.pro; // dead tier, mirrors pro

/**
 * Builds the merchant-facing "what's included" bullet list for one plan in isolation — the full
 * literal TIER_ROWS list for that plan's bucket (not a diff against any other plan). Used by
 * Super Admin's plan cards, where each plan needs to be inspected on its own.
 */
export function buildFeatureBulletsForPlan(planKey) {
  const features = getFeaturesForPlan(planKey);
  const bucket = resolvePlanBucket(planKey);
  return TIER_ROWS[bucket].map((row) => row(features));
}

/**
 * Builds the merchant-facing pricing page's per-plan bullet lists straight from TIER_ROWS — the
 * merchant's own exact, literal copy per tier, additive ("Starter = Free's list is implied via the
 * 'All Free Plan features +' banner, then exactly its own rows; Pro likewise off Starter").
 * `planKeysAscendingByPrice` must already be sorted cheapest-first (the same order the pricing
 * page renders cards in).
 *
 * Returns one entry per input plan: `{ basedOnIndex, bullets }` — `basedOnIndex` is the index of
 * the plan this one's "All X Plan features +" banner refers to (null for the cheapest/first plan).
 */
export function buildTieredPlanFeatures(planKeysAscendingByPrice) {
  return planKeysAscendingByPrice.map((planKey, index) => {
    const features = getFeaturesForPlan(planKey);
    const bucket = resolvePlanBucket(planKey);
    const bullets = TIER_ROWS[bucket].map((row) => row(features));
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
    cell: (f) => (f.templates_premium?.enabled
      ? { icon: "yes", text: "Full library (18)" }
      : { icon: "partial", text: "3 basic" }),
  },
  {
    feature: "Shopify Product Blocks",
    cell: (f) => (["product", "product_text", "product_sidebar", "product_switcher", "product_slider", "featured_product"].some((k) => f[k]?.enabled)
      ? { icon: "yes", text: "" }
      : { icon: "no", text: "" }),
  },
  { feature: "Clone Article", cell: (f) => (f.clone_article?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "FAQ Blocks", cell: (f) => (f.faq?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "Related Blogs (manual)", cell: (f) => (f.related_posts_manual?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "Automatic only" }) },
  { feature: "Author Attribution", cell: () => ({ icon: "yes", text: "" }) }, // free-text field, unrestricted at every tier
  { feature: "Table of Contents", cell: (f) => (f.toc?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "Hide Sections by Device", cell: (f) => (f.device_visibility?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  { feature: "SEO Meta (title, description, Open Graph, canonical URL)", cell: () => ({ icon: "yes", text: "" }) }, // unrestricted at every tier
  { feature: "Blog Post Scheduling", cell: (f) => (f.post_scheduling?.enabled ? { icon: "yes", text: "" } : { icon: "no", text: "" }) },
  {
    feature: "Manage Blog Categories (News, Recipes, etc.)",
    cell: (f) => {
      const limit = f.max_blogs?.limit;
      return { icon: "yes", text: limit == null ? "Unlimited" : `Up to ${limit}` };
    },
  },
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

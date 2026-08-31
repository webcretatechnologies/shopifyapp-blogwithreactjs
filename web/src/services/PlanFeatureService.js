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
    article_limit: { enabled: true, limit: 5 },
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
    templates_premium: { enabled: false, limit: null },
    template_limit: { enabled: true, limit: 2 },
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
    article_limit: { enabled: true, limit: 20 },
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
    template_limit: { enabled: true, limit: 5 },
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

/**
 * How many templates of their own a shop may keep. null = unlimited (Pro and above).
 * Saving a template is not the same thing as `templates_premium`, which gates the paid
 * half of the library — every plan can save some of its own layouts.
 */
export function getSavedTemplateLimit(planKey) {
  return getFeatureLimit(planKey, "template_limit");
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
  free: (f) => `Up to ${f.article_limit?.limit ?? 5} Articles`,
  starter: (f) => `Up to ${f.article_limit?.limit ?? 20} Articles`,
  pro: () => "Unlimited Articles",
};
ARTICLE_LIMIT_RENDER.business = ARTICLE_LIMIT_RENDER.pro;

// Saved templates are the app's second numeric cap, so they get the same per-tier treatment as
// articles: always present, wording driven by the live PlanFeature limit rather than a boolean.
const TEMPLATE_LIMIT_RENDER = (f) => {
  const limit = f.template_limit?.limit;
  return limit == null ? "Unlimited Saved Templates" : `Save ${limit} of Your Own Templates`;
};

const PRICE_ORDER = ["free", "starter", "pro"];

const MASTER_BULLETS = [
  { label: "Drag & Drop Builder", keys: [] },
  { label: "Analytics Dashboard", keys: ["analytics_dashboard"] },
  { label: "SEO Meta (basic)", keys: [] },
  { label: "Author", keys: [] },
  { label: "Blog Management", keys: [] },
  { label: "Blog Templates", keys: [] },
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
      return f.templates_premium?.enabled
        ? { icon: "yes", text: `Full library (21) + ${own}` }
        : { icon: "partial", text: `3 basic + ${own}` };
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

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

// Internal, per-key labels — used by Super Admin's Sync Features modal, where an admin is
// managing individual gating toggles and needs to see exactly which key they're touching.
const FEATURE_LABELS = {
  heading: "Heading blocks",
  text: "Text blocks",
  image: "Image blocks",
  image_text: "Image + text blocks",
  video: "Video embeds",
  divider: "Divider blocks",
  button: "Button blocks",
  list: "List blocks",
  faq: "FAQ blocks",
  table: "Table blocks",
  product: "Product blocks",
  product_text: "Product + text blocks",
  product_sidebar: "Product sidebar blocks",
  product_switcher: "Product switcher blocks",
  product_slider: "Product slider blocks",
  featured_product: "Featured product blocks",
  blog: "Blog post list blocks",
  countdown: "Countdown timer blocks",
  reviews: "Reviews blocks",
  hero: "Hero banner blocks",
  announcement: "Announcement bar blocks",
  custom_css: "Custom CSS",
  custom_js: "Custom JavaScript",
};

// Display order for the flat per-key bullets below — content-editor basics first, code/dev
// features last (the more "premium" a feature reads, the later it appears in the list).
const FEATURE_KEY_ORDER = [
  "heading", "text", "image", "image_text", "video", "divider", "button", "list", "faq", "table",
  "blog", "hero", "announcement", "countdown", "reviews",
  "product", "product_text", "product_sidebar", "product_switcher", "product_slider", "featured_product",
  "custom_css", "custom_js",
];

function limitBullets(features) {
  const bullets = [];
  const articleLimit = features.article_limit?.limit;
  bullets.push(articleLimit == null ? "Unlimited articles" : `Up to ${articleLimit} articles`);
  const sectionLimit = features.section_limit?.limit;
  if (sectionLimit !== undefined) {
    bullets.push(sectionLimit == null ? "Unlimited sections per article" : `Up to ${sectionLimit} sections per article`);
  }
  return bullets;
}

// Used only for a plan with nothing to diff against (the cheapest/first tier on the pricing
// page) — that plan's bullet list would otherwise be all ~14 of its enabled keys spelled out
// individually, which is exactly the raw-dump problem this rollup exists to avoid. Every other
// tier's list is short already (it's just what's new), so only the baseline needs grouping.
// `keys` maps each member featureKey to a short descriptor phrase, not a full sentence — the
// parenthetical is built from *only the descriptors whose key is actually enabled*, so a group
// never claims sub-capabilities a plan doesn't really have.
const BASELINE_GROUPS = [
  {
    label: "Rich content editor",
    keys: {
      heading: "headings", text: "text", image: "images", image_text: "image + text",
      video: "video", divider: "dividers", button: "buttons", list: "lists",
      faq: "FAQs", table: "tables",
    },
  },
  { label: "Related & recent posts blocks", keys: { blog: "blog post lists" } },
  {
    label: "Marketing blocks",
    keys: { hero: "hero banners", announcement: "announcement bars", countdown: "countdowns", reviews: "reviews" },
  },
  {
    label: "Product blocks",
    keys: {
      product: "product spotlights", product_text: "product + text", product_sidebar: "sidebars",
      product_switcher: "switchers", product_slider: "sliders", featured_product: "featured picks",
    },
  },
  { label: "Custom CSS & JavaScript", keys: { custom_css: "CSS", custom_js: "JavaScript" } },
];

const MAX_GROUP_DETAIL_ITEMS = 4;

function baselineGroupBullets(features) {
  const bullets = [];
  for (const group of BASELINE_GROUPS) {
    const enabled = Object.entries(group.keys)
      .filter(([key]) => features[key]?.enabled)
      .map(([, descriptor]) => descriptor);
    if (enabled.length === 0) continue;

    if (Object.keys(group.keys).length === 1) {
      bullets.push(group.label); // single-member group — parenthetical would just repeat the label
      continue;
    }
    const shown = enabled.length > MAX_GROUP_DETAIL_ITEMS
      ? [...enabled.slice(0, MAX_GROUP_DETAIL_ITEMS), `${enabled.length - MAX_GROUP_DETAIL_ITEMS} more`]
      : enabled;
    bullets.push(`${group.label} (${shown.join(", ")})`);
  }
  return bullets;
}

/**
 * Builds the merchant-facing "what's included" bullet list for one plan in isolation — limits,
 * then every enabled feature key's label, full detail, no reference to any other plan. Used by
 * Super Admin's plan cards, where each plan needs to be inspected on its own; the merchant-facing
 * pricing page uses `buildTieredPlanFeatures` instead so tiers don't repeat each other's bullets.
 */
export function buildFeatureBulletsForPlan(planKey) {
  const features = getFeaturesForPlan(planKey);
  const bullets = limitBullets(features);
  for (const key of FEATURE_KEY_ORDER) {
    if (features[key]?.enabled) bullets.push(FEATURE_LABELS[key]);
  }
  return bullets;
}

/**
 * Builds the merchant-facing pricing page's per-plan bullet lists the way real tiered pricing
 * pages do it: each plan only lists what's *new* versus the plan immediately below it in price —
 * one bullet per newly-enabled feature key, not the same "Heading blocks" line repeated on every
 * single card. `planKeysAscendingByPrice` must already be sorted cheapest-first (the same order
 * the pricing page renders cards in), so "previous" means "next cheaper tier".
 *
 * Returns one entry per input plan: `{ basedOnIndex, bullets }` — `basedOnIndex` is the index of
 * the plan this one's "All X Plan features +" refers to (null for the cheapest/first plan, which
 * gets its full bullet list with nothing to diff against).
 */
export function buildTieredPlanFeatures(planKeysAscendingByPrice) {
  let previouslyEnabledKeys = new Set();

  return planKeysAscendingByPrice.map((planKey, index) => {
    const features = getFeaturesForPlan(planKey);
    const bullets = limitBullets(features);
    const currentEnabledKeys = new Set(FEATURE_KEY_ORDER.filter((key) => features[key]?.enabled));

    if (index === 0) {
      bullets.push(...baselineGroupBullets(features));
    } else {
      for (const key of FEATURE_KEY_ORDER) {
        if (currentEnabledKeys.has(key) && !previouslyEnabledKeys.has(key)) bullets.push(FEATURE_LABELS[key]);
      }
    }

    previouslyEnabledKeys = currentEnabledKeys;
    return { basedOnIndex: index > 0 ? index - 1 : null, bullets };
  });
}

// The PlanFeature table stores both boolean block-feature toggles (heading, text, image, faq,
// product, hero, custom_css, ...) and numeric usage limits (article_limit, blog, blog_select,
// section_limit) in one flat table. Super Admin's card UI splits editing into two focused
// modals — "Sync Features" (toggles) and "Sync Limits" (numeric caps) — purely by partitioning
// on featureKey; the underlying data/API is identical either way.
export const PLAN_LIMIT_KEYS = ["article_limit", "blog", "blog_select", "section_limit"];

export function isLimitKey(featureKey) {
  return PLAN_LIMIT_KEYS.includes(featureKey);
}

// PlanFeature rows live in 4 fixed tier buckets (free/starter/pro/business), while
// SubscriptionPlan rows can be more numerous (e.g. "Blogger Starter" + "Blogger Starter Annual").
// This mirrors PlanFeatureService.getFeaturesForPlan's exact substring-matching convention on the
// backend, so a plan card's Sync Features/Sync Limits buttons edit the same bucket the backend
// actually gates on for that plan — monthly/annual variants of the same tier intentionally share
// one bucket, same as real feature gating already does.
export function planFeatureBucket(subscriptionPlanName) {
  const lower = (subscriptionPlanName || "").toLowerCase();
  if (lower.includes("starter")) return "starter";
  if (lower.includes("pro")) return "pro";
  if (lower.includes("business")) return "business";
  return "free";
}

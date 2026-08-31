// The PlanFeature table stores both boolean block-feature toggles (heading, text, image, faq,
// product, hero, custom_css, ...) and numeric usage limits in one flat table. Super Admin's card
// UI splits editing into two focused modals — "Sync Features" (toggles) and "Sync Limits"
// (numeric caps) — purely by partitioning on featureKey; the underlying data/API is identical
// either way.
//
// article_limit and template_limit are the real, enforced numeric caps in the app — articles in
// posts.js/import.js/wizard.js, saved templates in blogTemplates.js's POST /mine. `blog` and `blog_select` were legacy PlanFeature rows with a `limit` value that was
// never read by any enforcement code — dead data, not real gates — and `max_blogs` (Shopify blog
// count) was a real cap that's been intentionally removed app-wide, by request, so multi-blog
// management is unrestricted at every plan now. None of the three show up here anymore, which
// means Sync Limits only ever surfaces caps that actually do something.
export const PLAN_LIMIT_KEYS = ["article_limit", "template_limit"];

export function isLimitKey(featureKey) {
  return PLAN_LIMIT_KEYS.includes(featureKey);
}

// The exact, complete bullet list for each tier, in the exact order and wording it appears on the
// merchant-facing Plans & Billing page (PlanFeatureService.js's TIER_ROWS) — nothing more, nothing
// less. Sync Features shows precisely this list per plan, not a dump of every PlanFeature row
// that happens to exist in the DB (block-editor keys like Countdown/Reviews/Announcement/Hero/
// Divider/etc. are real DB rows but were never checked by any gate and were never marketed here —
// showing them was the exact confusion this list fixes).
//
// `keys: [...]` is the underlying PlanFeature featureKey(s) this bullet toggles — a bullet
// backed by more than one key (e.g. "Shopify Product Blocks" covers 7 block-type keys; "Meta
// Robots & Rich Snippets" covers 2) is ONE checkbox that flips all of them together, same as it's
// sold as one line item, not several an admin has to reconcile by hand. `keys: []` means the
// bullet has no backing gate at all (e.g. "Drag & Drop Builder", "Author" — always on for every
// plan, nothing to toggle) — rendered as a checked, disabled row so the list still visibly
// matches the pricing page, without pretending it's editable. The "Up to N / Unlimited Articles"
// bullet is the article_limit PlanFeature row, already numeric — it's edited from "Sync Limits",
// not here, so it isn't repeated in this list. Same for the saved-template cap (template_limit).
//
// Keep in sync with TIER_ROWS by hand — duplicating wording deliberately rather than importing
// across the frontend/backend boundary.
export const TIER_BULLETS = {
  free: [
    { label: "Drag & Drop Builder", keys: [] },
    { label: "Analytics Dashboard", keys: ["analytics_dashboard"] },
    { label: "SEO Meta (basic)", keys: [] },
    { label: "Author", keys: [] },
    { label: "Blog Management", keys: [] },
    { label: "Blog Templates", keys: [] },
    { label: "Sync Theme Colors", keys: ["theme_style_sync"] },
    { label: "Blog Comments", keys: [] },
    { label: "Import Shopify Blogs", keys: [] },
  ],
  starter: [
    { label: "Clone Article", keys: ["clone_article"] },
    { label: "Shopify Product Blocks", keys: ["product", "product_card", "product_text", "product_sidebar", "product_slider", "product_switcher", "featured_product"] },
    { label: "FAQ Block", keys: ["faq"] },
    { label: "Table Of Content", keys: ["toc"] },
    { label: "2 Way Sync", keys: ["sync_actions"] },
    { label: "Meta Robots & Rich Snippets", keys: ["meta_robots", "rich_snippets"] },
    { label: "Custom CSS", keys: ["custom_css"] },
    { label: "Analytics Dashboard", keys: ["analytics_dashboard"] },
    { label: "Related Posts", keys: ["related_posts_manual"] },
    { label: "Listing Layout", keys: ["listing_layout"] },
    { label: "Remove \"Powered By\" Branding", keys: ["remove_branding"] },
  ],
  pro: [
    { label: "Blog Sidebar", keys: ["blog_sidebar"] },
    { label: "Blog Post Scheduling", keys: ["post_scheduling"] },
    { label: "Multi Language Translation", keys: ["translations"] },
    { label: "Hide Sections Based on Device", keys: ["device_visibility"] },
    { label: "XML sitemap", keys: ["xml_sitemap"] },
    { label: "Custom Global Header & Footer", keys: ["custom_code_injection"] },
    { label: "Advanced Analytics", keys: ["analytics_advanced"] },
  ],
};
TIER_BULLETS.business = TIER_BULLETS.pro; // dead tier, mirrors pro — same as TIER_ROWS itself

// Each plan card on the pricing page only prints what's *new* on that tier ("All Free Plan
// features +" ...), and TIER_BULLETS above reflects that grouping — but Sync Features itself
// needs to be a real editor, not just a mirror of "what tier a feature currently happens to
// belong to". If a feature only ever appears in the modal of the tier it originated on, there's
// no way to move it to a *different* tier — e.g. degrading "Multi Language Translation" (a
// Pro-origin bullet) down to Starter needs a checkbox for it on Starter's own modal, which a
// tier-scoped list can never offer since Pro-only bullets wouldn't be there. So every plan's
// modal shows the same universal set — the union of every bullet across every tier, deduped by
// label — and which ones happen to be checked simply reflects that specific plan's own DB rows.
// Moving a feature to a different plan is then just: open that plan's modal, tick or untick the
// box, Sync Features. No code change, no re-deploy.
function buildUniversalBullets() {
  const seen = new Set();
  const result = [];
  for (const tier of ["free", "starter", "pro"]) {
    for (const bullet of TIER_BULLETS[tier] || []) {
      if (seen.has(bullet.label)) continue;
      seen.add(bullet.label);
      result.push(bullet);
    }
  }
  return result;
}

const UNIVERSAL_BULLETS = buildUniversalBullets();

export const CUMULATIVE_TIER_BULLETS = {
  free: UNIVERSAL_BULLETS,
  starter: UNIVERSAL_BULLETS,
  pro: UNIVERSAL_BULLETS,
  business: UNIVERSAL_BULLETS,
};

// PlanFeature rows live in 4 fixed tier buckets (free/starter/pro/business), while
// SubscriptionPlan rows can be more numerous (e.g. "Starter Plan" + "Starter Plan Annual").
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

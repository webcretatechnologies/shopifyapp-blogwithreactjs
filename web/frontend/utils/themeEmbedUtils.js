/**
 * Theme editor deep links for this app's theme app embeds.
 *
 * App embeds are OFF by default after install. Shopify's activateAppId deep link
 * opens the theme editor App embeds panel with that block already focused /
 * toggled on for preview — merchant only clicks Save.
 *
 * @see https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration#app-embed-block-deep-linking
 */

// client_id — not a secret. Same source App Bridge uses (vite injects VITE_SHOPIFY_API_KEY
// from SHOPIFY_API_KEY). Never hardcode: production builds must not point at the dev app.
const APP_CLIENT_ID =
  import.meta.env.VITE_SHOPIFY_API_KEY ||
  (typeof document !== "undefined"
    ? document.querySelector('meta[name="shopify-api-key"]')?.content
    : "") ||
  "";

export const THEME_EMBED_HANDLES = {
  analyticsTracker: "app-embed",
  metaRobots: "meta-robots",
};

function normalizeShopDomain(shop) {
  return String(shop || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");
}

/**
 * Prefer admin.shopify.com/store/{handle} — works reliably when the merchant is
 * already inside the modern Admin host (embedded apps). Fall back to
 * https://{shop}/admin/... for atypical domains.
 */
function themeEditorBaseUrl(shop) {
  const domain = normalizeShopDomain(shop);
  if (!domain) return null;

  if (/\.myshopify\.com$/i.test(domain)) {
    const handle = domain.split(".")[0];
    return `https://admin.shopify.com/store/${handle}/themes/current/editor`;
  }

  return `https://${domain}/admin/themes/current/editor`;
}

/**
 * Deep link that opens the theme editor App embeds panel with a specific
 * embed pre-activated (preview on). Merchant reviews and clicks Save.
 *
 * @param {string} shop - e.g. "my-store.myshopify.com"
 * @param {string} handle - Liquid filename without extension (app-embed, meta-robots)
 * @param {string} [template] - Optional editor preview template (index|product|article|blog|collection)
 */
export function themeAppEmbedUrl(shop, handle, template = "index") {
  const base = themeEditorBaseUrl(shop);
  if (!base || !APP_CLIENT_ID || !handle) return "#";

  const params = new URLSearchParams({
    context: "apps",
    activateAppId: `${APP_CLIENT_ID}/${handle}`,
  });
  if (template) params.set("template", template);
  return `${base}?${params.toString()}`;
}

/** Blog Meta Robots app embed — article preview context (robots apply on articles). */
export function metaRobotsActivateUrl(shop) {
  return themeAppEmbedUrl(shop, THEME_EMBED_HANDLES.metaRobots, "article");
}

/** Analytics Tracker app embed — blog index preview (listing CSS + tracker). */
export function analyticsTrackerActivateUrl(shop) {
  return themeAppEmbedUrl(shop, THEME_EMBED_HANDLES.analyticsTracker, "blog");
}

/** Themes library — for stores whose theme can't host app embeds. */
export function browseThemesUrl(shop) {
  const domain = normalizeShopDomain(shop);
  if (!domain) return "https://admin.shopify.com/";
  if (/\.myshopify\.com$/i.test(domain)) {
    return `https://admin.shopify.com/store/${domain.split(".")[0]}/themes`;
  }
  return `https://${domain}/admin/themes`;
}

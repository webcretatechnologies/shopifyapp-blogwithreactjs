// The app's client_id — not a secret, safe to reference client-side for deep links. Read from the
// same build-time variable App Bridge itself uses (vite.config.js sets VITE_SHOPIFY_API_KEY from
// SHOPIFY_API_KEY), because hardcoding it meant a production build kept pointing these theme-editor
// deep links at the dev app record, where the embed blocks don't exist.
const APP_CLIENT_ID =
  import.meta.env.VITE_SHOPIFY_API_KEY ||
  document.querySelector('meta[name="shopify-api-key"]')?.content ||
  "";

/**
 * Deep link into the theme editor with the given app embed block pre-activated,
 * so the merchant only has to click Save — no searching for the toggle themselves.
 * See: https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration
 */
export function metaRobotsActivateUrl(shop) {
  return `https://${shop}/admin/themes/current/editor?context=apps&template=article&activateAppId=${APP_CLIENT_ID}/meta-robots`;
}

// Block handle "app-embed" matches the filename extensions/analytics-tracker/blocks/app-embed.liquid.
export function analyticsTrackerActivateUrl(shop) {
  return `https://${shop}/admin/themes/current/editor?context=apps&template=article&activateAppId=${APP_CLIENT_ID}/app-embed`;
}

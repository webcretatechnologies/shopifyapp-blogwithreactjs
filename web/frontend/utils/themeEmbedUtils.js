// Matches client_id in shopify.app.toml — not a secret, safe to reference client-side for deep links.
const APP_CLIENT_ID = "946c7f95fc6780b88559e90d45ad7f96";

/**
 * Deep link into the theme editor with the given app embed block pre-activated,
 * so the merchant only has to click Save — no searching for the toggle themselves.
 * See: https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration
 */
export function metaRobotsActivateUrl(shop) {
  return `https://${shop}/admin/themes/current/editor?context=apps&template=article&activateAppId=${APP_CLIENT_ID}/meta-robots`;
}

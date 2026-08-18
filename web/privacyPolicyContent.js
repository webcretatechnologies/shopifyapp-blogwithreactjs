import { APP_NAME } from "./src/utils/appName.js";

// Kept as a plain template-string module (not a .html file read from disk) so it can pull
// APP_NAME from the same single source of truth as the rest of the app, and so the effective
// date can be set explicitly by whoever last reviewed this policy rather than silently
// reflecting "today" on every server restart.
const LAST_UPDATED = "2026-08-18";

export const PRIVACY_POLICY_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy — ${APP_NAME}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 760px; margin: 0 auto; padding: 48px 24px 96px; color: #202223; line-height: 1.6; }
  h1 { font-size: 28px; margin-bottom: 4px; }
  .updated { color: #6d7175; font-size: 14px; margin-bottom: 40px; }
  h2 { font-size: 20px; margin-top: 40px; margin-bottom: 12px; }
  p, li { font-size: 15px; }
  ul { padding-left: 22px; }
  a { color: #005bd3; }
</style>
</head>
<body>
<h1>Privacy Policy</h1>
<p class="updated">Last updated: ${LAST_UPDATED}</p>

<p>This Privacy Policy explains what data ${APP_NAME} ("the App", "we", "us") accesses, stores, and processes when a merchant installs it on their Shopify store, and how that data is handled.</p>

<h2>1. Information we access</h2>
<p>When a merchant installs the App, Shopify grants it access to the following store data, strictly to provide the App's blogging and content features:</p>
<ul>
  <li><strong>Blog articles and blogs</strong> — to read, create, update, and sync blog post content between the App and the merchant's Shopify store.</li>
  <li><strong>Products</strong> — to let merchants reference and embed products inside blog content (e.g. product cards, buy buttons, product grids).</li>
  <li><strong>Theme data (read-only)</strong> — to detect whether the App's theme app extension is active, and to match the App's styling to the merchant's active theme colors and fonts.</li>
  <li><strong>Store and app-subscription information</strong> — to identify the store, manage billing through the Shopify Billing API, and enforce plan-based feature access.</li>
  <li><strong>Order data (limited)</strong> — the App reads order attribution data (a cart attribute set when a shopper reaches checkout from App-generated content) to report which blog posts contributed to sales. This does not include payment details, and is used only in aggregate, anonymous analytics — never tied to a specific shopper's identity.</li>
</ul>
<p>The App does <strong>not</strong> access, store, or process shopper/customer personal information such as names, email addresses, phone numbers, or physical addresses. It does not integrate with or read customer records.</p>

<h2>2. Storefront analytics</h2>
<p>The App's theme extension collects anonymous page-view and engagement events (e.g. which blog post was viewed, which internal links or embedded products were clicked) to power the App's built-in analytics dashboard. These events are not linked to any individual shopper's identity — no names, emails, or account information are collected or stored alongside this data.</p>

<h2>3. How we use store data</h2>
<p>Data accessed by the App is used solely to operate the App's features for the installing merchant: compiling and publishing blog content, keeping the App and the merchant's Shopify blog in sync, displaying analytics, and enforcing the merchant's subscription plan. We do not sell store or customer data, and we do not use it for advertising or share it with unrelated third parties.</p>

<h2>4. Data retention</h2>
<p>Store data is retained for as long as the App remains installed on the merchant's store. If a merchant uninstalls the App, all associated data is permanently deleted from our systems, consistent with Shopify's mandatory data-protection requirements for app developers.</p>

<h2>5. Customer data requests</h2>
<p>The App does not collect or store customer-identifying personal information. Because of this, there is no App-held customer data to return or delete in response to a data subject access or deletion request — any such request is handled automatically and results in no data being found, since none exists.</p>

<h2>6. Data security</h2>
<p>All data exchanged between the App and Shopify is encrypted in transit using TLS/HTTPS. Access to the App's backend and database is restricted to the systems required to operate the App.</p>

<h2>7. Third-party services</h2>
<p>The App may use Shopify's own APIs and infrastructure to operate (e.g. the Shopify Admin API, Shopify Billing API). It does not share store or shopper data with unrelated third-party services.</p>

<h2>8. Changes to this policy</h2>
<p>We may update this Privacy Policy from time to time. Material changes will be reflected by updating the "Last updated" date at the top of this page.</p>

<h2>9. Contact us</h2>
<p>If you have questions about this Privacy Policy or how your data is handled, please contact us through the App's support channel listed on its Shopify App Store listing.</p>

</body>
</html>
`;

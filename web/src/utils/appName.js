// Single source of truth for the app's display name on the backend — read from APP_NAME in the
// root .env. Falls back to the live app name so nothing breaks if the env var is ever unset.
export const APP_NAME = process.env.APP_NAME || "SmartBlog – AI, SEO & Insights";

// The URL the "Powered by {APP_NAME}" badge links to — read from APP_BRANDING_URL in the root
// .env. Empty by default (placeholder, not decided yet); the badge renders as plain text with no
// link until this is set.
export const APP_BRANDING_URL = process.env.APP_BRANDING_URL || "";

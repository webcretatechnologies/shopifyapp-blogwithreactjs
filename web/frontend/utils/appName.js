// Single source of truth for the app's display name on the frontend — read from VITE_APP_NAME,
// which vite.config.js exposes from the root .env's APP_NAME (not the final name yet; change that
// one value instead of hunting down every hardcoded string). Falls back to "Blogger" only so
// nothing breaks if the env var is ever unset.
export const APP_NAME = import.meta.env.VITE_APP_NAME || "Blogger";

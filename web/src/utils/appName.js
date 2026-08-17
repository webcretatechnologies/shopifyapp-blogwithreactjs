// Single source of truth for the app's display name on the backend — read from APP_NAME in the
// root .env (not the final name yet; change that one value instead of hunting down every
// hardcoded string). Falls back to "Blogger" only so nothing breaks if the env var is ever unset.
export const APP_NAME = process.env.APP_NAME || "Blogger";

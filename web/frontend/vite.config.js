import { defineConfig } from "vite";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";
import dotenv from "dotenv";

const __vite_dirname = dirname(fileURLToPath(import.meta.url));
// Load from root .env (two levels up: frontend -> web -> root)
dotenv.config({ path: join(__vite_dirname, "../../.env") });

if (
  process.env.npm_lifecycle_event === "build" &&
  !process.env.CI &&
  !process.env.SHOPIFY_API_KEY
) {
  throw new Error(
    "\n\nThe frontend build will not work without an API key. Set the SHOPIFY_API_KEY environment variable when running the build command, for example:" +
      "\n\nSHOPIFY_API_KEY=<your-api-key> npm run build\n"
  );
}

process.env.VITE_SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;

const proxyOptions = {
  target: `http://127.0.0.1:${process.env.BACKEND_PORT}`,
  changeOrigin: false,
  secure: true,
  ws: false,
};

const host = process.env.HOST
  ? process.env.HOST.replace(/https?:\/\//, "")
  : "localhost";

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: process.env.FRONTEND_PORT,
    clientPort: 443,
  };
}

export default defineConfig({
  root: dirname(fileURLToPath(import.meta.url)),
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
    alias: {
      react: join(__vite_dirname, "node_modules/react"),
      "react-dom": join(__vite_dirname, "node_modules/react-dom"),
    },
    dedupe: ["react", "react-dom"],
  },
  server: {
    host: "localhost",
    port: process.env.FRONTEND_PORT,
    hmr: hmrConfig,
    proxy: {
      "^/(\\?.*)?$": proxyOptions,
      "^/api(/|(\\?.*)?$)": proxyOptions,
      "^/admin-api(/|(\\?.*)?$)": proxyOptions,
      "^/uploads(/|(\\?.*)?$)": proxyOptions,
      "^/chat-socket(/|(\\?.*)?$)": { ...proxyOptions, ws: true },
      // Public, storefront-facing routes mounted directly on Express (before Shopify auth) —
      // without these, Vite's dev server swallows them and returns the app shell instead of
      // proxying to Express, since they don't match any of the prefixes above. Production has
      // no separate Vite process, so this gap is dev-only.
      "^/styles\\.css(/|(\\?.*)?$)": proxyOptions,
      "^/track(/|(\\?.*)?$)": proxyOptions,
      "^/sitemap-index\\.xml(/|(\\?.*)?$)": proxyOptions,
    },
  },
});

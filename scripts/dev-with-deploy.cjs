/* eslint-disable no-console */
// scripts/dev-with-deploy.cjs
//
// `shopify app dev`'s own "Update URLs: Yes" step only patches a temporary, session-scoped
// "dev preview" tied to whichever store you picked for that run — it never updates the app's
// real, persisted config in Shopify Partners. That's fine for reusing the same store you always
// test on (its preview session just keeps getting refreshed), but a genuine fresh OAuth install
// on a DIFFERENT store checks the actually-deployed config, which stays stuck on whatever
// shopify.app.toml's placeholder/last-deployed URLs were (this app's checked-in `example.com`
// placeholder, until this script started running `shopify app deploy` automatically) — producing
// an "invalid_request: redirect_uri not whitelisted" error on any store other than the one with
// a live preview session.
//
// This wraps `shopify app dev` unmodified (all its normal output, theme extension dev server,
// GraphiQL, etc. still run exactly as before) and, the moment it reports the live tunnel URL,
// also rewrites shopify.app.toml + the root .env with that URL and runs a real
// `shopify app deploy`, so the app becomes installable on ANY dev store, not just the
// currently-previewed one.

const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const TOML_PATH = path.resolve(__dirname, "..", "shopify.app.toml");
const ENV_PATH = path.resolve(__dirname, "..", ".env");
const TUNNEL_URL_RE = /Using URL:\s*(https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com)/;

let deployTriggered = false;

function upsertEnvVar(content, key, value) {
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}\\s*=.*$`, "m");
  if (re.test(content)) return content.replace(re, line);
  if (content.length && !content.endsWith("\n")) content += "\n";
  return content + line + "\n";
}

function applyTunnelUrlAndDeploy(tunnelUrl) {
  if (deployTriggered) return;
  deployTriggered = true;

  try {
    if (fs.existsSync(TOML_PATH)) {
      let toml = fs.readFileSync(TOML_PATH, "utf8");
      toml = toml.replace(/application_url\s*=\s*"[^"]*"/, `application_url = "${tunnelUrl}"`);
      toml = toml.replace(/"https:\/\/[^"]*\/api\/auth\/callback"/g, `"${tunnelUrl}/api/auth/callback"`);
      // [app_proxy] url = "..." — this app's storefront proxy endpoint (web/src/routes/proxy.js)
      toml = toml.replace(/^(\s*)url\s*=\s*"https:\/\/[^"]*\/api\/proxy"/m, `$1url = "${tunnelUrl}/api/proxy"`);
      fs.writeFileSync(TOML_PATH, toml);
      console.log(`\n[AutoDeploy] shopify.app.toml updated with ${tunnelUrl}`);
    } else {
      console.warn(`[AutoDeploy] shopify.app.toml not found at ${TOML_PATH}`);
    }

    if (fs.existsSync(ENV_PATH)) {
      let env = fs.readFileSync(ENV_PATH, "utf8");
      env = upsertEnvVar(env, "HOST", tunnelUrl);
      fs.writeFileSync(ENV_PATH, env);
      console.log("[AutoDeploy] .env HOST updated (informational only — the running dev process");
      console.log("[AutoDeploy] already has the correct live HOST injected by the Shopify CLI itself).");
    } else {
      console.warn(`[AutoDeploy] .env not found at ${ENV_PATH}`);
    }

    console.log("[AutoDeploy] Deploying updated URLs to Shopify Partners so this app installs on ANY dev store...");
    execSync("npx shopify app deploy --allow-updates --no-build", { stdio: "inherit" });
    console.log("[AutoDeploy] Deploy complete.\n");
  } catch (err) {
    console.warn("[AutoDeploy] Failed to auto-deploy URLs:", err.message);
    console.warn("[AutoDeploy] Fix manually: npx shopify app deploy --allow-updates");
  }
}

const child = spawn("npx", ["shopify", "app", "dev", ...process.argv.slice(2)], {
  stdio: ["inherit", "pipe", "inherit"],
});

const rl = readline.createInterface({ input: child.stdout });
rl.on("line", (line) => {
  process.stdout.write(line + "\n");
  const match = line.match(TUNNEL_URL_RE);
  if (match) applyTunnelUrlAndDeploy(match[1]);
});

child.on("close", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("[AutoDeploy] Failed to start `shopify app dev`:", err.message);
  process.exit(1);
});

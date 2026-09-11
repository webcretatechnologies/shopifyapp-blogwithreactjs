/**
 * Consolidates theme app-embed activation checks into one settings_data.json read:
 * analytics tracker + meta robots, whether the theme supports app embeds at all, and
 * missing OAuth scopes.
 */
import shopify from "../../shopify.js";

const REQUIRED_SCOPES = [
  "read_content",
  "write_content",
  "read_products",
  "write_products",
  "read_customers",
  "read_orders",
  "read_themes",
  "write_themes",
  "read_script_tags",
  "write_script_tags",
  "write_files",
  "read_locales",
  "read_translations",
  "write_translations",
];

export function getMissingScopes(session) {
  const granted = new Set((session?.scope || "").split(",").map((s) => s.trim()).filter(Boolean));
  const hasScope = (scope) => {
    if (granted.has(scope)) return true;
    if (scope.startsWith("read_")) return granted.has("write_" + scope.slice("read_".length));
    return false;
  };
  return REQUIRED_SCOPES.filter((s) => !hasScope(s));
}

/** Shopify often prefixes settings_data.json with a /* ... *\/ banner. */
function parseThemeJson(raw) {
  if (!raw || typeof raw !== "string") throw new Error("Theme asset was empty");
  const stripped = raw.replace(/^\uFEFF/, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  return JSON.parse(stripped);
}

/**
 * Theme app embed block `type` looks like:
 *   shopify://apps/{app-handle}/blocks/{block-handle}/{uuid}
 *
 * App handle varies by install (Blogger React - Local, Blog Builder - Aauram, App Store name).
 * Match our embeds by block handle + a loose app-handle allowlist — never require one brand name.
 */
function isEnabled(block) {
  return block && block.disabled !== true;
}

function blockType(block) {
  return String(block?.type || "").toLowerCase();
}

/** True when this block is our Meta Robots app embed. */
function isMetaRobotsEmbed(block) {
  return blockType(block).includes("/blocks/meta-robots/");
}

/**
 * Tokens that appear in our app handles across local / production / App Store names.
 * Production "Blog Builder - Aauram" → shopify://apps/blog-builder-aauram/...
 * Local "Blogger React - Local" → ...blogger-react...
 * Must NOT rely only on "blogger" — "blog-builder" does not contain that substring.
 */
const OUR_APP_HANDLE_HINTS = [
  "blog-builder",
  "blog_builder",
  "blogbuilder",
  "blogger",
  "blog-react",
  "blogger-react",
  "shopifyblog",
  "blog-app",
];

function looksLikeOurApp(typeLower) {
  return OUR_APP_HANDLE_HINTS.some((hint) => typeLower.includes(hint));
}

/** True when this block is our Analytics Tracker app embed (filename app-embed.liquid). */
function isAnalyticsTrackerEmbed(block) {
  const t = blockType(block);
  if (!t.includes("/blocks/app-embed/")) return false;
  // Prefer a positive app-handle match so we don't claim another app's generic app-embed.
  if (looksLikeOurApp(t)) return true;
  // Extension name in some installs includes "analytics"
  if (t.includes("analytics")) return true;
  return false;
}

/**
 * Reads the shop's main theme's config/settings_data.json once and derives embed status.
 * Fails soft — never throws to the merchant UI.
 */
export async function getEmbedStatus(session) {
  const result = {
    themeSupportsAppEmbeds: false,
    analyticsTracker: { active: false },
    metaRobots: { active: false },
  };

  try {
    const client = new shopify.api.clients.Rest({ session });
    const themesReq = await client.get({ path: "themes" });
    const mainTheme = themesReq.body.themes.find((t) => t.role === "main");
    if (!mainTheme) return result;

    const assetReq = await client.get({
      path: `themes/${mainTheme.id}/assets`,
      query: { "asset[key]": "config/settings_data.json" },
    });
    const settingsData = parseThemeJson(assetReq.body.asset.value);

    let current = settingsData.current;
    if (typeof current === "string" && settingsData.presets?.[current]) {
      current = settingsData.presets[current];
    }
    const blocks = current?.blocks;

    // Vintage/legacy themes never have current.blocks — they can't host app embeds.
    if (!blocks || typeof blocks !== "object") return result;
    result.themeSupportsAppEmbeds = true;

    const blockList = Object.values(blocks);

    const metaRobotsBlock = blockList.find((b) => isMetaRobotsEmbed(b) && isEnabled(b));
    result.metaRobots.active = !!metaRobotsBlock;

    // Prefer same app prefix as meta-robots when that embed exists (precise), else scan all.
    let analyticsBlock = null;
    const anyMeta = blockList.find((b) => isMetaRobotsEmbed(b));
    if (anyMeta?.type) {
      const prefix = anyMeta.type.split("/blocks/")[0];
      analyticsBlock = blockList.find(
        (b) =>
          isEnabled(b) &&
          String(b.type || "").startsWith(`${prefix}/blocks/app-embed/`)
      );
    }
    if (!analyticsBlock) {
      analyticsBlock = blockList.find((b) => isAnalyticsTrackerEmbed(b) && isEnabled(b));
    }
    result.analyticsTracker.active = !!analyticsBlock;

    return result;
  } catch (err) {
    console.error("[ThemeEmbedStatusService] getEmbedStatus error:", err.message);
    return result;
  }
}

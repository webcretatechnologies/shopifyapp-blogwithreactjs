/**
 * Consolidates what used to be two near-duplicate theme-asset reads
 * (web/index.js's old GET /api/shop/extension-status, web/src/routes/settings.js's old
 * GET /api/settings/meta-robots-status) into one theme + config/settings_data.json fetch, plus
 * two signals neither of those endpoints reported: whether the merchant's theme supports app
 * embeds at all (legacy/vintage themes never do), and whether the current session is missing any
 * OAuth scope this app requires.
 */
import shopify from "../../shopify.js";

// Mirrors shopify.app.toml's [access_scopes] scopes list. Kept as a plain array here (rather than
// parsed from the TOML at runtime) since this file has no TOML parser dependency and the scope
// list only changes when a developer deliberately edits shopify.app.toml.
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
  // Shopify's Admin API scope model grants read access implicitly whenever the matching write
  // scope is present (e.g. `write_content` alone already includes `read_content`) — comparing
  // literally against REQUIRED_SCOPES without this rule produces false positives for every
  // read_* scope whose write_* counterpart is granted, which is exactly what real session data
  // showed during verification (write_content present, read_content "missing" but not actually).
  const hasScope = (scope) => {
    if (granted.has(scope)) return true;
    if (scope.startsWith("read_")) return granted.has("write_" + scope.slice("read_".length));
    return false;
  };
  return REQUIRED_SCOPES.filter((s) => !hasScope(s));
}

/**
 * Reads the shop's main theme's config/settings_data.json once and derives every embed-related
 * status signal from it. Fails safe on any error (no main theme, asset missing, malformed JSON,
 * API error) — every field defaults to "not active"/"unsupported" rather than throwing, since a
 * merchant should never see a 500 just because their theme looks unusual.
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
    const settingsData = JSON.parse(assetReq.body.asset.value);
    const blocks = settingsData.current?.blocks;

    // Vintage/legacy (pre-Online-Store-2.0) themes never have a `current.blocks` object at all —
    // this is the signal that distinguishes "app embed exists but merchant hasn't turned it on"
    // (blocks present, ours missing/disabled) from "this theme can't run app embeds, period."
    if (!blocks || typeof blocks !== "object") return result;
    result.themeSupportsAppEmbeds = true;

    const blockList = Object.values(blocks);

    const metaRobotsBlock = blockList.find(
      (block) => block.type?.includes("/blocks/meta-robots/") && block.disabled !== true
    );
    result.metaRobots.active = !!metaRobotsBlock;

    // Precise match: derive this app's own block-type prefix (everything before "/blocks/") from
    // the meta-robots block, which already matches precisely — then look for an app-embed block
    // sharing that same prefix. Falls back to the old fuzzy substring match only when no
    // meta-robots block is present to derive a prefix from (e.g. merchant disabled/removed it).
    const anyMetaRobotsBlock = blockList.find((block) => block.type?.includes("/blocks/meta-robots/"));
    let analyticsBlock = null;
    if (anyMetaRobotsBlock) {
      const prefix = anyMetaRobotsBlock.type.split("/blocks/")[0];
      analyticsBlock = blockList.find(
        (block) => block.type?.startsWith(`${prefix}/blocks/app-embed/`) && block.disabled !== true
      );
    } else {
      analyticsBlock = blockList.find((block) => {
        if (!block.type || !block.type.includes("app-embed") || block.disabled === true) return false;
        const typeLower = block.type.toLowerCase();
        return typeLower.includes("blogger") || typeLower.includes("analytics") || typeLower.includes("react");
      });
    }
    result.analyticsTracker.active = !!analyticsBlock;

    return result;
  } catch (err) {
    console.error("[ThemeEmbedStatusService] getEmbedStatus error:", err.message);
    return result;
  }
}

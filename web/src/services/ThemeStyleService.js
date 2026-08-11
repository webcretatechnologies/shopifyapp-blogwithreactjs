/**
 * ThemeStyleService
 * Reads the merchant's actual main theme's colors/fonts via the Admin REST Asset API
 * (config/settings_data.json + config/settings_schema.json) so the app's Appearance
 * settings can be synced from the real theme instead of hand-typed. Read-only — never
 * writes anything to Shopify or the DB.
 */

/** "poppins_n4" -> "Poppins". Font picker values are internal IDs, not CSS font-family
 * names — there's no reliable way to resolve the real web font without theme-side Liquid
 * filters, so this is a best-effort starting point, not a guaranteed-accurate value. */
function humanizeFontId(fontId) {
  if (!fontId || typeof fontId !== "string") return null;
  const base = fontId.split("_")[0];
  if (!base) return null;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** Dawn and most Dawn-derived OS 2.0 themes name their color schemes accent-1/accent-2/
 * background-1/etc — a reasonable, but not universal, convention. Falls back gracefully. */
function extractColorsFromSchemes(colorSchemes) {
  if (!colorSchemes || typeof colorSchemes !== "object") return {};
  const schemeKeys = Object.keys(colorSchemes);
  const findScheme = (...patterns) =>
    schemeKeys.find((k) => patterns.some((p) => k.toLowerCase().includes(p)));

  const accent1Key = findScheme("accent-1", "accent1") || findScheme("accent");
  const accent2Key = findScheme("accent-2", "accent2");
  const baseKey = findScheme("background-1", "background1") || schemeKeys[0];

  const accent1 = accent1Key ? colorSchemes[accent1Key]?.settings : null;
  const accent2 = accent2Key ? colorSchemes[accent2Key]?.settings : null;
  const base = baseKey ? colorSchemes[baseKey]?.settings : null;

  return {
    primary: accent1?.background || base?.button || null,
    secondary: accent2?.background || null,
    background: base?.background || null,
    text: base?.text || null,
  };
}

/** Fallback for themes without a color_schemes structure: scan settings_schema.json for
 * standalone `type: "color"` settings whose id/label hints at brand/button usage. */
function extractColorsFromSchema(settingsSchema, settingsData) {
  if (!Array.isArray(settingsSchema)) return {};
  const current = settingsData?.current || {};
  const hints = { primary: ["primary", "accent", "button"], secondary: ["secondary", "accent_2"] };
  const result = {};

  for (const group of settingsSchema) {
    if (!Array.isArray(group.settings)) continue;
    for (const setting of group.settings) {
      if (setting.type !== "color" || !current[setting.id]) continue;
      const haystack = `${setting.id} ${setting.label || ""}`.toLowerCase();
      for (const [key, patterns] of Object.entries(hints)) {
        if (!result[key] && patterns.some((p) => haystack.includes(p))) {
          result[key] = current[setting.id];
        }
      }
    }
  }
  return result;
}

/** Collects every setting `id` declared anywhere in settings_schema.json, so we only read a
 * `current` value when the theme actually declares that setting — avoids false positives on
 * themes that don't use Dawn's `buttons_radius`/`card_corner_radius` naming convention. */
function schemaSettingIds(settingsSchema) {
  const ids = new Set();
  if (!Array.isArray(settingsSchema)) return ids;
  for (const group of settingsSchema) {
    for (const setting of group.settings || []) {
      if (setting.id) ids.add(setting.id);
    }
  }
  return ids;
}

/** Dawn/OS 2.0 themes expose button and card corner-radius/shadow as top-level numeric
 * settings (`buttons_radius`, `card_corner_radius`, `buttons_shadow_opacity`,
 * `card_shadow_opacity`) — a convention, not a guarantee, so each value is only trusted when
 * the schema confirms the theme actually declares that exact setting id. */
function extractShapeFromSchema(settingsSchema, settingsData) {
  const current = settingsData?.current || {};
  const ids = schemaSettingIds(settingsSchema);

  const readNumber = (id) => (ids.has(id) && typeof current[id] === "number" ? current[id] : null);

  const buttonRadius = readNumber("buttons_radius");
  const cardRadius = readNumber("card_corner_radius");
  const buttonShadowOpacity = readNumber("buttons_shadow_opacity");
  const cardShadowOpacity = readNumber("card_shadow_opacity");

  const hasShadow =
    buttonShadowOpacity === null && cardShadowOpacity === null
      ? null
      : (buttonShadowOpacity || 0) > 0 || (cardShadowOpacity || 0) > 0;

  return { buttonRadius, cardRadius, hasShadow };
}

/**
 * Fetch the shop's main theme colors/font/shape. Fails soft — returns nulls for anything not
 * confidently detected rather than guessing wrong, and never throws for the caller to
 * treat as a hard error unless the theme/session itself is unreachable.
 */
async function fetchThemeStyleTokens(shopify, session) {
  const client = new shopify.api.clients.Rest({ session });

  const themesReq = await client.get({ path: "themes" });
  const mainTheme = themesReq.body.themes.find((t) => t.role === "main");
  if (!mainTheme) throw new Error("Could not find the store's main (published) theme");

  const [dataReq, schemaReq] = await Promise.all([
    client.get({ path: `themes/${mainTheme.id}/assets`, query: { "asset[key]": "config/settings_data.json" } }),
    client.get({ path: `themes/${mainTheme.id}/assets`, query: { "asset[key]": "config/settings_schema.json" } }).catch(() => null),
  ]);

  const settingsData = JSON.parse(dataReq.body.asset.value);
  const settingsSchema = schemaReq ? JSON.parse(schemaReq.body.asset.value) : null;
  const current = settingsData.current || {};

  let colors = extractColorsFromSchemes(current.color_schemes);
  if (!colors.primary && settingsSchema) {
    colors = { ...extractColorsFromSchema(settingsSchema, settingsData), ...colors };
  }

  const fontFamily = humanizeFontId(current.type_body_font || current.type_header_font);
  const shape = extractShapeFromSchema(settingsSchema, settingsData);

  return {
    themeName: mainTheme.name,
    colors: {
      primary: colors.primary || null,
      secondary: colors.secondary || null,
      background: colors.background || null,
      text: colors.text || null,
    },
    fontFamily,
    shape,
  };
}

export default { fetchThemeStyleTokens };

/**
 * ThemeStyleService
 *
 * Theme-agnostic brand-token sync for App Store installs (any theme: Dawn, Spotlight,
 * Horizon, Debut, custom OS 2.0, vintage, ThemeForest, etc.).
 *
 * Strategy (fail soft only when the theme truly has no color data at all):
 *   1. Parse settings_data.json / settings_schema.json (JSONC-safe)
 *   2. Named / Dawn-style color_schemes when present
 *   3. Schema-declared color settings (any id/label)
 *   4. Deep walk of the entire `current` tree for every opaque color
 *   5. Visual heuristics (saturation → brand, luminance → text/background)
 *   6. Optional CSS custom-property peek from common theme assets
 *
 * Read-only — never writes to Shopify or the DB.
 */

/** Shopify often prefixes settings_data.json with a /* ... *\/ banner. */
function parseThemeJson(raw) {
  if (!raw || typeof raw !== "string") throw new Error("Theme asset was empty");
  const stripped = raw.replace(/^\uFEFF/, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  return JSON.parse(stripped);
}

function humanizeFontId(fontId) {
  if (!fontId || typeof fontId !== "string") return null;
  const parts = fontId.split("_");
  if (parts.length < 2) return null;
  const nameParts = parts.slice(0, -1).filter(Boolean);
  if (nameParts.length === 0) return null;
  return nameParts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** Normalize theme color strings to #rrggbb for HTML type="color" inputs. */
export function toHexColor(value) {
  if (value == null || typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v === "transparent" || v === "none") return null;

  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) {
    if (v.length === 4) {
      const r = v[1];
      const g = v[2];
      const b = v[3];
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return `#${v.slice(1, 7)}`.toLowerCase();
  }

  const rgb = v.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i
  );
  if (rgb) {
    const a = rgb[4] != null ? parseFloat(rgb[4]) : 1;
    if (!(a > 0.5)) return null;
    const hex = (n) => {
      const x = Math.max(0, Math.min(255, Math.round(parseFloat(n))));
      return x.toString(16).padStart(2, "0");
    };
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
  }

  const hsl = v.match(
    /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/i
  );
  if (hsl) {
    const a = hsl[4] != null ? parseFloat(hsl[4]) : 1;
    if (!(a > 0.5)) return null;
    const h = parseFloat(hsl[1]) / 360;
    const s = parseFloat(hsl[2]) / 100;
    const l = parseFloat(hsl[3]) / 100;
    const hue2rgb = (p, q, t) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    let r;
    let g;
    let b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    const hex = (n) => Math.round(n * 255).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }

  return null;
}

function pickFirstHex(...candidates) {
  for (const c of candidates) {
    const hex = toHexColor(c);
    if (hex) return hex;
  }
  return null;
}

function hexToRgb(hex) {
  const h = toHexColor(hex);
  if (!h) return null;
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

/** Relative luminance 0..1 (sRGB). */
function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

/** Saturation 0..1 — brand accents tend to be more saturated than grays. */
function saturation(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  return (max - min) / (1 - Math.abs(2 * l - 1));
}

function schemeSetting(settings, ...keys) {
  if (!settings || typeof settings !== "object") return null;
  for (const key of keys) {
    if (settings[key] != null && settings[key] !== "") return settings[key];
  }
  const lowerMap = Object.fromEntries(
    Object.entries(settings).map(([k, v]) => [String(k).toLowerCase(), v])
  );
  for (const key of keys) {
    const hit = lowerMap[key.toLowerCase()];
    if (hit != null && hit !== "") return hit;
  }
  return null;
}

function extractColorsFromSchemes(colorSchemes) {
  if (!colorSchemes || typeof colorSchemes !== "object") return {};

  const entries = Object.entries(colorSchemes).filter(
    ([, v]) => v && typeof v === "object" && v.settings && typeof v.settings === "object"
  );
  if (entries.length === 0) return {};

  const findScheme = (...patterns) =>
    entries.find(([k]) => patterns.some((p) => String(k).toLowerCase().includes(p)));

  const accent1 = findScheme("accent-1", "accent1") || findScheme("accent");
  const accent2 = findScheme("accent-2", "accent2");
  const base =
    findScheme("background-1", "background1", "scheme-1", "scheme1", "default", "main") ||
    entries[0];
  const second = accent2 || (entries.length > 1 ? entries[1] : null);

  const baseSettings = base?.[1]?.settings;
  const accent1Settings = accent1?.[1]?.settings;
  const secondSettings = second?.[1]?.settings;

  return {
    primary: pickFirstHex(
      schemeSetting(
        accent1Settings,
        "background",
        "button",
        "solid_button_background",
        "primary",
        "accent"
      ),
      schemeSetting(
        baseSettings,
        "button",
        "solid_button_background",
        "primary",
        "accent",
        "button_background"
      )
    ),
    secondary: pickFirstHex(
      schemeSetting(
        secondSettings,
        "button",
        "background",
        "solid_button_background",
        "primary",
        "accent"
      ),
      schemeSetting(baseSettings, "secondary_button", "secondary", "accent")
    ),
    background: pickFirstHex(
      schemeSetting(baseSettings, "background", "bg", "page_background", "body_background")
    ),
    text: pickFirstHex(
      schemeSetting(baseSettings, "text", "text_color", "body_text", "foreground", "color_text")
    ),
  };
}

/**
 * Deep-collect every opaque color in an object tree, with a dotted path for scoring.
 * Skips huge section/block trees that are layout, not brand tokens — but still reads
 * color_schemes and top-level settings.
 */
function collectColorsDeep(node, path = "", out = [], depth = 0) {
  if (node == null || depth > 8) return out;

  if (typeof node === "string") {
    const hex = toHexColor(node);
    if (hex) out.push({ hex, path: path || "value" });
    return out;
  }

  if (Array.isArray(node)) {
    // Color lists are rare; still scan shallowly
    node.slice(0, 40).forEach((item, i) => collectColorsDeep(item, `${path}[${i}]`, out, depth + 1));
    return out;
  }

  if (typeof node !== "object") return out;

  for (const [key, value] of Object.entries(node)) {
    const keyLower = String(key).toLowerCase();
    // Skip non-brand noise: section instances, blocks, product media, etc.
    if (
      keyLower === "sections" ||
      keyLower === "blocks" ||
      keyLower === "block_order" ||
      keyLower === "order" ||
      keyLower === "platform_customizations"
    ) {
      continue;
    }
    const nextPath = path ? `${path}.${key}` : key;
    collectColorsDeep(value, nextPath, out, depth + 1);
  }
  return out;
}

/** Score a discovered color for a semantic role based on its path + visual traits. */
function scoreForRole(entry, role) {
  const p = entry.path.toLowerCase();
  let score = 0;

  const has = (...words) => words.some((w) => p.includes(w));
  const sat = saturation(entry.hex);
  const lum = luminance(entry.hex);

  // Shared junk penalties
  if (has("shadow", "overlay", "border", "success", "error", "warning", "sale", "badge", "star")) {
    score -= 40;
  }

  if (role === "primary") {
    if (has("button", "btn", "primary", "brand", "accent", "action", "main", "highlight")) score += 50;
    if (has("scheme-1", "scheme1", "accent-1", "accent1")) score += 20;
    if (has("secondary", "accent-2", "accent2", "background", "text", "label")) score -= 15;
    // Prefer saturated mid-luminance brand colors over near-white/black
    score += Math.round(sat * 35);
    if (lum > 0.85 || lum < 0.08) score -= 25;
  } else if (role === "secondary") {
    if (has("secondary", "accent-2", "accent2", "alt", "scheme-2", "scheme2")) score += 50;
    if (has("button", "accent", "brand")) score += 15;
    if (has("text", "background", "label")) score -= 10;
    score += Math.round(sat * 25);
    if (lum > 0.85 || lum < 0.08) score -= 20;
  } else if (role === "text") {
    if (has("text", "foreground", "font", "heading", "body_text", "typo")) score += 55;
    if (has("button_label", "btn_label")) score -= 20; // often white-on-button
    if (has("background", "button", "accent", "brand")) score -= 25;
    // Prefer dark text
    score += Math.round((1 - lum) * 40);
    if (sat > 0.35) score -= 10; // body text is usually near-neutral
  } else if (role === "background") {
    if (has("background", "bg", "surface", "page", "body_bg")) score += 55;
    if (has("button", "text", "accent", "brand")) score -= 25;
    score += Math.round(lum * 40); // prefer light page backgrounds
    if (sat > 0.4) score -= 10;
  }

  return score;
}

function pickBest(entries, role, used = new Set()) {
  let best = null;
  let bestScore = -Infinity;
  for (const entry of entries) {
    if (used.has(entry.hex)) continue;
    const score = scoreForRole(entry, role);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  // Require a weakly positive score for semantic roles so we don't assign random noise
  // when a better visual fallback exists later — except we still return the best candidate
  // and let the caller decide.
  return best && bestScore > 0 ? best : bestScore > -10 ? best : null;
}

/**
 * Theme-agnostic assignment: use semantic scores when possible, otherwise visual traits
 * so stores without Dawn naming still get real brand colors.
 */
function assignColorsFromPool(entries) {
  if (!entries.length) return {};

  // Dedupe by hex, keep shortest (most specific) path
  const byHex = new Map();
  for (const e of entries) {
    const prev = byHex.get(e.hex);
    if (!prev || e.path.length < prev.path.length) byHex.set(e.hex, e);
  }
  const unique = [...byHex.values()];

  const used = new Set();
  const take = (role) => {
    const hit = pickBest(unique, role, used);
    if (hit) {
      used.add(hit.hex);
      return hit.hex;
    }
    return null;
  };

  let primary = take("primary");
  let secondary = take("secondary");
  let text = take("text");
  let background = take("background");

  // Visual fallbacks when semantic naming is missing (custom / vintage themes)
  const unused = () => unique.filter((e) => !used.has(e.hex));

  if (!primary) {
    const brandish = unused()
      .filter((e) => saturation(e.hex) >= 0.18 && luminance(e.hex) > 0.08 && luminance(e.hex) < 0.9)
      .sort((a, b) => saturation(b.hex) - saturation(a.hex));
    if (brandish[0]) {
      primary = brandish[0].hex;
      used.add(primary);
    }
  }

  if (!secondary) {
    const brandish = unused()
      .filter((e) => saturation(e.hex) >= 0.12 && e.hex !== primary)
      .sort((a, b) => saturation(b.hex) - saturation(a.hex));
    if (brandish[0]) {
      secondary = brandish[0].hex;
      used.add(secondary);
    }
  }

  if (!text) {
    const dark = unused().sort((a, b) => luminance(a.hex) - luminance(b.hex));
    if (dark[0] && luminance(dark[0].hex) < 0.55) {
      text = dark[0].hex;
      used.add(text);
    }
  }

  if (!background) {
    const light = unused().sort((a, b) => luminance(b.hex) - luminance(a.hex));
    if (light[0] && luminance(light[0].hex) > 0.7) {
      background = light[0].hex;
      used.add(background);
    }
  }

  // Absolute last resort: any colors at all, ordered dark→light for text/bg and first for brand
  if (!primary && unique.length) {
    primary = unique.sort((a, b) => saturation(b.hex) - saturation(a.hex))[0].hex;
    used.add(primary);
  }
  if (!text && unique.length) {
    const candidate = unique.find((e) => !used.has(e.hex)) || unique[0];
    text = candidate.hex;
  }
  if (!secondary && unique.length > 1) {
    const candidate = unique.find((e) => e.hex !== primary && e.hex !== text);
    if (candidate) secondary = candidate.hex;
  }

  return { primary: primary || null, secondary: secondary || null, text: text || null, background: background || null };
}

function extractColorsFromSchema(settingsSchema, current) {
  if (!Array.isArray(settingsSchema) || !current || typeof current !== "object") return [];
  const out = [];
  for (const group of settingsSchema) {
    if (!Array.isArray(group.settings)) continue;
    const groupName = group.name || "";
    for (const setting of group.settings) {
      if (setting.type !== "color" && setting.type !== "color_background") continue;
      if (!setting.id || current[setting.id] == null) continue;
      const hex = toHexColor(current[setting.id]);
      if (!hex) continue;
      out.push({
        hex,
        path: `schema.${groupName}.${setting.id}.${setting.label || ""}`,
      });
    }
  }
  return out;
}

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

function extractShapeFromSchema(settingsSchema, current) {
  const ids = schemaSettingIds(settingsSchema);
  const readNumber = (...candidates) => {
    for (const id of candidates) {
      if (ids.has(id) && typeof current?.[id] === "number") return current[id];
      // Some themes store radius as string "8"
      if (ids.has(id) && current?.[id] != null && current[id] !== "") {
        const n = Number(current[id]);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  };

  // Also accept common ids even if schema fetch failed (vintage / broken schema)
  const looseNumber = (...candidates) => {
    for (const id of candidates) {
      if (current?.[id] == null || current[id] === "") continue;
      const n = Number(current[id]);
      if (Number.isFinite(n) && n >= 0 && n <= 80) return n;
    }
    return null;
  };

  const buttonRadius =
    readNumber(
      "buttons_radius",
      "button_radius",
      "buttons_border_radius",
      "btn_radius",
      "button_border_radius",
      "buttons_corner_radius"
    ) ??
    looseNumber(
      "buttons_radius",
      "button_radius",
      "buttons_border_radius",
      "btn_radius",
      "button_border_radius"
    );

  const cardRadius =
    readNumber("card_corner_radius", "cards_radius", "card_radius", "cards_corner_radius") ??
    looseNumber("card_corner_radius", "cards_radius", "card_radius");

  return {
    buttonRadius: buttonRadius != null ? buttonRadius : null,
    cardRadius: cardRadius != null ? cardRadius : null,
  };
}

function mergeColors(...sources) {
  const out = { primary: null, secondary: null, background: null, text: null };
  for (const src of sources) {
    if (!src) continue;
    for (const key of Object.keys(out)) {
      if (!out[key] && src[key]) out[key] = src[key];
    }
  }
  return out;
}

/** Chroma 0..1 (max-min in sRGB) — stabler than HSL saturation for pale tints. */
function chroma(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/** True when a color is a usable brand accent (not white/black/gray/pale cream chrome). */
function isBrandWorthy(hex) {
  const h = toHexColor(hex);
  if (!h) return false;
  const lum = luminance(h);
  // Pale creams / near-black read as chrome, not CTAs — Aauram's #ecdec1 hover must lose to #b6713e
  if (lum > 0.78 || lum < 0.08) return false;
  if (chroma(h) < 0.12) return false;
  return true;
}

function brandScore(hex) {
  // Prefer rich mid-tone accents (real buttons) over washed tints / near-neutrals
  return chroma(hex) * 100 - Math.abs(luminance(hex) - 0.42) * 55;
}

function uniqueHexes(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const h = toHexColor(raw);
    if (!h || seen.has(h)) continue;
    seen.add(h);
    out.push(h);
  }
  return out;
}

/**
 * Parse live storefront HTML for CSS custom properties (--color-button, etc.).
 * This is what shoppers actually see — more accurate than settings_data.json when
 * themes (or checkout apps) stash unrelated colors in theme settings.
 */
function extractColorsFromStorefrontHtml(html) {
  if (!html || typeof html !== "string") return {};

  const byName = new Map(); // varName -> hex[]
  const re = /--([a-zA-Z0-9_-]+)\s*:\s*([^;}\n]+)/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    const name = match[1].toLowerCase();
    const hex = toHexColor(match[2].trim());
    if (!hex) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(hex);
  }
  if (byName.size === 0) return {};

  const vals = (...names) => {
    const out = [];
    for (const n of names) {
      const list = byName.get(n) || [];
      out.push(...list);
    }
    return uniqueHexes(out);
  };

  // Prefer real CTA button fills over hover/accent tints when both exist.
  const buttonPool = uniqueHexes(
    vals("color-button", "color-btn", "color-primary", "color-brand", "color-highlight")
  )
    .filter(isBrandWorthy)
    .sort((a, b) => brandScore(b) - brandScore(a));

  const accentPool = uniqueHexes(
    vals(
      "color-button-hover",
      "color-hover",
      "color-accent",
      "color-secondary-button-hover",
      "color-sale"
    )
  )
    .filter(isBrandWorthy)
    .sort((a, b) => brandScore(b) - brandScore(a));

  // Prefer a mid/dark CTA fill for Primary (white label text). Light golds become Secondary.
  const darkButtons = buttonPool
    .filter((h) => luminance(h) <= 0.55)
    .sort((a, b) => luminance(a) - luminance(b) || brandScore(b) - brandScore(a));
  const primary = darkButtons[0] || buttonPool[0] || accentPool[0] || null;
  const secondary =
    [...buttonPool, ...accentPool].find((h) => h && h !== primary) || null;

  // Body text: prefer dark near-neutral text/title vars (not white-on-dark scheme copies)
  const textPool = uniqueHexes(vals("color-text", "color-title", "color-sub-title", "color-body", "color-foreground"));
  const textDark = textPool
    .filter((h) => luminance(h) < 0.45)
    .sort((a, b) => luminance(a) - luminance(b));
  const text = textDark[0] || textPool[0] || null;

  const bgPool = uniqueHexes(vals("color-background", "color-bg", "color-page", "color-body-bg"));
  const background =
    bgPool.filter((h) => luminance(h) > 0.7).sort((a, b) => luminance(b) - luminance(a))[0] ||
    bgPool[0] ||
    null;

  return {
    primary: primary || null,
    secondary: secondary || null,
    text: text || null,
    background: background || null,
  };
}

/**
 * Fetch the published storefront homepage and read rendered CSS variables.
 * Uses the shop's myshopify domain (always resolves to the live theme). Fail-soft.
 */
async function extractColorsFromLiveStorefront(shopDomain) {
  if (!shopDomain) return {};
  const url = `https://${shopDomain}/`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "ShopifyBlogApp-ThemeSync/1.0",
        Accept: "text/html",
      },
    });
    if (!res.ok) return {};
    const html = await res.text();
    // Cap parse size — vars are almost always in the first styles of <head>
    return extractColorsFromStorefrontHtml(html.slice(0, 400000));
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

/** Peek common CSS assets for --color-* / --button-* custom properties. */
async function extractColorsFromCssAssets(client, themeId) {
  const candidates = [
    "assets/base.css",
    "assets/theme.css",
    "assets/styles.css",
    "assets/global.css",
    "assets/main.css",
    "assets/component-card.css",
  ];

  const found = [];
  const results = await Promise.all(
    candidates.map((key) =>
      client
        .get({ path: `themes/${themeId}/assets`, query: { "asset[key]": key } })
        .then((res) => res.body?.asset?.value || "")
        .catch(() => "")
    )
  );

  const varPatterns = [
    /--color[^:{}]*button[^:{}]*:\s*([^;}+]+)/gi,
    /--color[^:{}]*primary[^:{}]*:\s*([^;}+]+)/gi,
    /--color[^:{}]*accent[^:{}]*:\s*([^;}+]+)/gi,
    /--color[^:{}]*brand[^:{}]*:\s*([^;}+]+)/gi,
    /--color[^:{}]*hover[^:{}]*:\s*([^;}+]+)/gi,
    /--color[^:{}]*text[^:{}]*:\s*([^;}+]+)/gi,
    /--color[^:{}]*foreground[^:{}]*:\s*([^;}+]+)/gi,
    /--color[^:{}]*background[^:{}]*:\s*([^;}+]+)/gi,
    /--button[^:{}]*background[^:{}]*:\s*([^;}+]+)/gi,
  ];

  for (const css of results) {
    if (!css) continue;
    for (const re of varPatterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(css)) !== null) {
        const hex = toHexColor(m[1].trim());
        if (hex) found.push({ hex, path: `css.${m[0].split(":")[0].trim()}` });
      }
    }
  }
  return found;
}

/**
 * Fetch the shop's main theme colors/font/shape — theme-agnostic.
 *
 * Priority:
 *   1. Live storefront CSS variables (what shoppers see — beats checkout-app junk in settings)
 *   2. Dawn / OS 2.0 color_schemes in settings_data.json
 *   3. Schema + deep settings walk + visual heuristics
 *   4. Theme CSS asset peek
 */
async function fetchThemeStyleTokens(shopify, session) {
  const client = new shopify.api.clients.Rest({ session });
  const shopDomain = session?.shop;

  const themesReq = await client.get({ path: "themes" });
  const mainTheme = themesReq.body.themes.find((t) => t.role === "main");
  if (!mainTheme) throw new Error("Could not find the store's main (published) theme");

  const [dataReq, schemaReq, fromStorefront] = await Promise.all([
    client.get({
      path: `themes/${mainTheme.id}/assets`,
      query: { "asset[key]": "config/settings_data.json" },
    }),
    client
      .get({
        path: `themes/${mainTheme.id}/assets`,
        query: { "asset[key]": "config/settings_schema.json" },
      })
      .catch(() => null),
    extractColorsFromLiveStorefront(shopDomain),
  ]);

  const settingsData = parseThemeJson(dataReq.body.asset.value);
  const settingsSchema = schemaReq ? parseThemeJson(schemaReq.body.asset.value) : null;

  let current = settingsData.current;
  if (typeof current === "string" && settingsData.presets?.[current]) {
    current = settingsData.presets[current];
  }
  if (!current || typeof current !== "object") {
    const presetValues = settingsData.presets && Object.values(settingsData.presets);
    current = presetValues?.[0] && typeof presetValues[0] === "object" ? presetValues[0] : {};
  }

  const fromSchemes = extractColorsFromSchemes(current.color_schemes);

  const pool = [
    ...extractColorsFromSchema(settingsSchema, current),
    ...collectColorsDeep(current),
  ];

  // Only dig into theme CSS files when storefront + settings still look thin
  const early = mergeColors(fromStorefront, fromSchemes, assignColorsFromPool(pool));
  if (!early.primary || !early.text) {
    try {
      pool.push(...(await extractColorsFromCssAssets(client, mainTheme.id)));
    } catch {
      /* ignore */
    }
  }

  const fromPool = assignColorsFromPool(pool);
  // Storefront wins — settings often contain Magic Checkout / app blues that aren't the brand.
  const colors = mergeColors(fromStorefront, fromSchemes, fromPool);

  // If secondary collapsed to near-black/white, prefer a second brand accent from storefront pool
  if (colors.secondary && (luminance(colors.secondary) < 0.08 || luminance(colors.secondary) > 0.9)) {
    if (fromStorefront.secondary && isBrandWorthy(fromStorefront.secondary)) {
      colors.secondary = fromStorefront.secondary;
    } else if (colors.primary && fromStorefront.primary && fromStorefront.primary !== colors.primary) {
      colors.secondary = fromStorefront.primary;
    }
  }

  const fontFamily = humanizeFontId(
    current.type_body_font ||
      current.type_header_font ||
      current.font_body ||
      current.font ||
      current.body_font ||
      current.heading_font
  );
  const shape = extractShapeFromSchema(settingsSchema, current);

  const foundAnyColor = Boolean(
    colors.primary || colors.secondary || colors.text || colors.background
  );

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
    foundAnyColor,
    source: fromStorefront.primary || fromStorefront.text ? "storefront" : "theme_settings",
  };
}

export default {
  fetchThemeStyleTokens,
  toHexColor,
  extractColorsFromStorefrontHtml,
};

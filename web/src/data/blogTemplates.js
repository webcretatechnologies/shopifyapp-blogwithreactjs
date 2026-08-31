/**
 * Curated full-page Blog Templates for the drag & drop Builder.
 *
 * Each entry is a Builder block tree (see BlockRegistry.jsx). Omitted settings fall back to
 * registry / theme defaults via normalizeBlocksAst() when the template is applied.
 *
 * Gallery preview compiles this same tree — sample images/products are part of the template
 * so what the merchant sees on the card is what they get in the editor (they replace the
 * samples with their own catalog/files).
 */

// `color` paints the text through Tiptap's textStyle mark rather than a block setting —
// RichText has no colour setting in any of the three renderers, and body copy set on a dark
// section band was rendering near-black on near-black. The mark serialises to an inline
// <span style="color:…">, so it survives the canvas, the gallery preview and the published
// article identically.
const doc = (paragraphs, color) => ({
  type: "doc",
  content: paragraphs.map((p) => ({
    type: "paragraph",
    content: p
      ? [
          {
            type: "text",
            text: p,
            ...(color ? { marks: [{ type: "textStyle", attrs: { color } }] } : {}),
          },
        ]
      : undefined,
  })),
});

const section = (settings, children) => ({
  type: "Section",
  settings: settings || {},
  children,
});

const columns = (count, children, gap) => ({
  type: "ColumnLayout",
  settings: { columns: count, gap: gap || "24px" },
  children: children.map((col) => ({ type: "Column", settings: { width: "100%" }, children: col })),
});

/* ── Palette ──────────────────────────────────────────────────────────────────
 * Every template used to ship the same grey placeholder art, the same yellow
 * callout, the same near-black hero gradient and the same black headings, so 16
 * genuinely different layouts still read as one design in the gallery. Each
 * template now owns a hue and a set of art motifs, and every shared helper below
 * pulls from it — the colour identity is baked into the block tree, so it
 * survives apply → editor → published article the same way the layout does.
 */
const hexToRgb = (hex) => {
  const h = String(hex).replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
};
const mix = (hex, target, amount) => {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return `#${a
    .map((v, i) => Math.max(0, Math.min(255, Math.round(v + (b[i] - v) * amount))).toString(16).padStart(2, "0"))
    .join("")}`;
};
const tintOf = (hex) => mix(hex, "#ffffff", 0.92);
const softOf = (hex) => mix(hex, "#ffffff", 0.74);
const midOf = (hex) => mix(hex, "#ffffff", 0.42);
const deepOf = (hex) => mix(hex, "#0b1220", 0.55);

/**
 * @param {string} accent  the template's hue — headings, TOC, buttons, art
 * @param {object} opts    heroArt / arts motifs, TOC treatment, heading sizing
 */
const palette = (accent, opts = {}) => ({
  accent,
  deep: opts.deep || deepOf(accent),
  mid: midOf(accent),
  soft: softOf(accent),
  tint: opts.tint || tintOf(accent),
  tocBg: opts.tocBg || deepOf(accent),
  tocFg: "#ffffff",
  tocStyle: opts.tocStyle || "panel",
  tocList: opts.tocList || "numbered",
  heroArt: opts.heroArt || "linear",
  arts: opts.arts || ["landscape"],
  // Real photography for the templates that ship a written sample article. Slots with no
  // photo fall back to the generated motif art above, so a template is never image-less.
  heroPhoto: opts.heroPhoto || "",
  photos: opts.photos || [],
  productPhotos: opts.productPhotos || [],
  products: opts.products || null,
  productArt: opts.productArt || "box",
  cardStyle: opts.cardStyle || "shadow",
  h1Color: opts.h1Color || deepOf(accent),
  h1Align: opts.h1Align || "left",
  h1Size: opts.h1Size || "34px",
  h2Color: opts.h2Color || accent,
  h2Align: opts.h2Align,
  h3Color: opts.h3Color || "#202223",
  // Hero-less templates get their opening section painted in the template tint so the
  // gallery card shows the template's colour in the first screen instead of plain white.
  band: opts.band !== false,
  bandRadius: opts.bandRadius != null ? opts.bandRadius : "14px",
});

/* ── Sample art ───────────────────────────────────────────────────────────────
 * SVGs use double-quoted attributes — encodeURIComponent escapes those (%22).
 * It leaves ( ) ' alone though, and a gradient's fill="url(#g)" then closed an
 * unquoted CSS url(…) early, so heroes rendered as an empty grey box in the
 * canvas and on the storefront. Escape those three too, so the URI is safe in
 * url(…), url('…') and src="…".
 */
/**
 * Sample photography comes from Burst (burst.shopify.com) — Shopify's own free stock
 * library, served from their CDN, free for commercial use with no attribution. Using
 * Shopify's CDN rather than bundling megabytes of JPEGs keeps the app light, and the
 * merchant swaps these for their own shots (the "After you use it" checklist says so).
 */
const BURST = "https://burst.shopifycdn.com/photos";
const photo = (slug, width = 1400) => `${BURST}/${slug}.jpg?width=${width}&format=pjpg&exif=0&iptc=0`;

const svgUri = (svg) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg)
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/'/g, "%27")}`;

const svg = (w, h, inner) =>
  svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`);

const rep = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join("");

function heroSrc(s) {
  const { accent, deep, soft, mid } = s;
  switch (s.heroArt) {
    case "split":
      return svg(1400, 560,
        `<rect width="1400" height="560" fill="${deep}"/>` +
        `<path d="M0 560 L1400 40 L1400 560 Z" fill="${accent}"/>` +
        `<circle cx="270" cy="170" r="96" fill="${soft}" opacity="0.4"/>`);
    case "stripes":
      return svg(1400, 560,
        `<rect width="1400" height="560" fill="${accent}"/>` +
        rep(5, (i) => `<rect x="${i * 280}" y="0" width="132" height="560" fill="${deep}" opacity="0.38"/>`));
    case "radial":
      return svg(1400, 560,
        `<defs><radialGradient id="g" cx="0.5" cy="0.38" r="0.8">` +
        `<stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${deep}"/>` +
        `</radialGradient></defs><rect width="1400" height="560" fill="url(#g)"/>` +
        `<circle cx="700" cy="230" r="168" fill="#ffffff" opacity="0.10"/>` +
        `<circle cx="700" cy="230" r="248" fill="#ffffff" opacity="0.06"/>`);
    case "grid":
      return svg(1400, 560,
        `<rect width="1400" height="560" fill="${deep}"/>` +
        rep(12, (i) => {
          const x = 120 + (i % 6) * 200;
          const y = 110 + Math.floor(i / 6) * 200;
          return `<rect x="${x}" y="${y}" width="150" height="150" rx="16" fill="${accent}" opacity="${i % 2 ? 0.55 : 0.85}"/>`;
        }));
    case "wave":
      return svg(1400, 560,
        `<rect width="1400" height="560" fill="${accent}"/>` +
        `<path d="M0 380 C 320 250 560 470 840 350 C 1060 258 1240 330 1400 300 L1400 560 L0 560 Z" fill="${deep}"/>` +
        `<path d="M0 430 C 300 320 620 520 900 410 C 1120 326 1260 390 1400 366 L1400 560 L0 560 Z" fill="${deep}" opacity="0.55"/>`);
    case "arch":
      return svg(1400, 560,
        // Deep ground, accent arch: a light background here left the hero's own white
        // heading text unreadable in the card and on the published article.
        `<rect width="1400" height="560" fill="${deep}"/>` +
        `<path d="M420 560 L420 300 A280 280 0 0 1 980 300 L980 560 Z" fill="${accent}"/>` +
        `<circle cx="700" cy="250" r="70" fill="${soft}" opacity="0.30"/>`);
    case "frame":
      return svg(1400, 560,
        `<rect width="1400" height="560" fill="${accent}"/>` +
        `<rect x="70" y="46" width="1260" height="468" fill="none" stroke="${soft}" stroke-width="4"/>` +
        `<rect x="560" y="180" width="280" height="200" rx="140" fill="${soft}" opacity="0.45"/>`);
    case "dots":
      return svg(1400, 560,
        `<rect width="1400" height="560" fill="${deep}"/>` +
        rep(28, (i) => {
          const x = 90 + (i % 7) * 200;
          const y = 90 + Math.floor(i / 7) * 130;
          return `<circle cx="${x}" cy="${y}" r="${i % 3 ? 26 : 44}" fill="${accent}" opacity="${i % 2 ? 0.9 : 0.5}"/>`;
        }));
    case "corner":
      return svg(1400, 560,
        `<rect width="1400" height="560" fill="${accent}"/>` +
        `<path d="M900 0 L1400 0 L1400 560 Z" fill="${deep}"/>` +
        `<rect x="90" y="90" width="240" height="10" fill="${soft}"/>`);
    default:
      return svg(1400, 560,
        `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${deep}"/>` +
        `</linearGradient></defs><rect width="1400" height="560" fill="url(#g)"/>` +
        `<rect x="0" y="380" width="1400" height="180" fill="${mid}" opacity="0.12"/>`);
  }
}

function photoSrc(s, motif) {
  const { accent, mid, soft, tint, deep } = s;
  const base = `<rect width="960" height="540" fill="${tint}"/>`;
  switch (motif) {
    case "steps":
      return svg(960, 540, base + rep(3, (i) => {
        const y = 90 + i * 130;
        return `<circle cx="150" cy="${y + 40}" r="40" fill="${accent}" opacity="${1 - i * 0.2}"/>` +
          `<rect x="230" y="${y + 18}" width="${520 - i * 70}" height="18" rx="9" fill="${mid}"/>` +
          `<rect x="230" y="${y + 52}" width="${380 - i * 60}" height="14" rx="7" fill="${soft}"/>`;
      }));
    case "rank":
      return svg(960, 540, base +
        `<circle cx="200" cy="270" r="120" fill="${accent}"/>` +
        `<rect x="380" y="170" width="420" height="26" rx="13" fill="${mid}"/>` +
        `<rect x="380" y="230" width="330" height="20" rx="10" fill="${soft}"/>` +
        `<rect x="380" y="290" width="380" height="20" rx="10" fill="${soft}"/>` +
        `<rect x="380" y="350" width="200" height="20" rx="10" fill="${soft}"/>`);
    case "chart":
      return svg(960, 540, base + rep(5, (i) =>
        `<rect x="${130 + i * 150}" y="${430 - (i % 3) * 90 - 60}" width="96" height="${(i % 3) * 90 + 60}" rx="10" fill="${i === 2 ? accent : mid}"/>`) +
        `<rect x="90" y="450" width="790" height="6" rx="3" fill="${soft}"/>`);
    case "flatlay":
      return svg(960, 540, base + rep(6, (i) => {
        const x = 110 + (i % 3) * 260;
        const y = 100 + Math.floor(i / 3) * 200;
        return `<rect x="${x}" y="${y}" width="200" height="150" rx="18" fill="${i % 4 === 0 ? accent : mid}" opacity="${i % 2 ? 0.75 : 1}"/>`;
      }));
    case "swatch":
      return svg(960, 540, base + rep(4, (i) =>
        `<rect x="${90 + i * 200}" y="90" width="160" height="360" rx="14" fill="${[accent, mid, soft, deep][i]}"/>`));
    case "portrait":
      return svg(960, 540, base +
        `<circle cx="480" cy="190" r="92" fill="${mid}"/>` +
        `<path d="M280 480 C 292 322 668 322 680 480 Z" fill="${accent}"/>` +
        `<rect x="0" y="480" width="960" height="60" fill="${soft}"/>`);
    case "measure":
      return svg(960, 540, base +
        `<rect x="120" y="150" width="720" height="120" rx="16" fill="${mid}"/>` +
        rep(9, (i) => `<rect x="${150 + i * 78}" y="150" width="4" height="${i % 2 ? 34 : 60}" fill="${tint}"/>`) +
        `<rect x="120" y="340" width="500" height="18" rx="9" fill="${soft}"/>` +
        `<rect x="120" y="390" width="330" height="18" rx="9" fill="${soft}"/>` +
        `<circle cx="780" cy="390" r="46" fill="${accent}"/>`);
    case "plate":
      return svg(960, 540, base +
        `<circle cx="480" cy="270" r="190" fill="${soft}"/>` +
        `<circle cx="480" cy="270" r="130" fill="${accent}"/>` +
        `<circle cx="430" cy="230" r="30" fill="${tint}" opacity="0.65"/>` +
        rep(6, (i) => `<circle cx="${480 + 165 * Math.cos((i * Math.PI) / 3)}" cy="${270 + 165 * Math.sin((i * Math.PI) / 3)}" r="16" fill="${mid}"/>`));
    case "hanger":
      return svg(960, 540, base + rep(3, (i) => {
        const x = 140 + i * 240;
        return `<path d="M${x} 180 L${x + 80} 120 L${x + 160} 180 L${x + 130} 460 L${x + 30} 460 Z" fill="${i === 1 ? accent : mid}"/>` +
          `<rect x="${x + 70}" y="70" width="20" height="60" rx="10" fill="${soft}"/>`;
      }));
    case "quote":
      return svg(960, 540, base +
        `<text x="110" y="230" font-family="Georgia, serif" font-size="220" fill="${accent}">&#8220;</text>` +
        `<rect x="300" y="160" width="520" height="22" rx="11" fill="${mid}"/>` +
        `<rect x="300" y="210" width="450" height="22" rx="11" fill="${soft}"/>` +
        `<rect x="300" y="260" width="380" height="22" rx="11" fill="${soft}"/>` +
        `<circle cx="360" cy="400" r="46" fill="${mid}"/>` +
        `<rect x="430" y="380" width="220" height="18" rx="9" fill="${soft}"/>`);
    case "detail":
      return svg(960, 540, base +
        `<circle cx="620" cy="270" r="200" fill="${accent}"/>` +
        `<circle cx="620" cy="270" r="130" fill="${tint}" opacity="0.55"/>` +
        `<rect x="90" y="180" width="260" height="20" rx="10" fill="${mid}"/>` +
        `<rect x="90" y="230" width="200" height="16" rx="8" fill="${soft}"/>` +
        `<rect x="90" y="276" width="230" height="16" rx="8" fill="${soft}"/>`);
    case "landscape":
    default:
      return svg(960, 540, base +
        `<circle cx="740" cy="150" r="62" fill="${accent}"/>` +
        `<path d="M0 540 L300 230 L500 400 L700 250 L960 540 Z" fill="${mid}"/>` +
        `<path d="M0 540 L240 330 L470 540 Z" fill="${soft}"/>`);
  }
}

function productSrc(s, i = 0) {
  const { accent, mid, soft, tint } = s;
  const base = `<rect width="400" height="400" fill="${tint}"/>`;
  const fill = i % 3 === 0 ? accent : mid;
  switch (s.productArt) {
    case "round":
      return svg(400, 400, base + `<circle cx="200" cy="200" r="112" fill="${fill}"/><circle cx="200" cy="200" r="58" fill="${soft}" opacity="0.7"/>`);
    case "tall":
      return svg(400, 400, base + `<rect x="150" y="70" width="100" height="260" rx="26" fill="${fill}"/><rect x="176" y="34" width="48" height="46" rx="12" fill="${soft}"/>`);
    case "garment":
      return svg(400, 400, base + `<path d="M120 130 L200 90 L280 130 L262 330 L138 330 Z" fill="${fill}"/><rect x="188" y="58" width="24" height="44" rx="12" fill="${soft}"/>`);
    case "gift":
      return svg(400, 400, base + `<rect x="105" y="150" width="190" height="170" rx="12" fill="${fill}"/><rect x="185" y="150" width="30" height="170" fill="${soft}"/><rect x="105" y="150" width="190" height="30" fill="${soft}" opacity="0.8"/><path d="M200 150 C 160 110 130 150 200 150 C 270 150 240 110 200 150 Z" fill="${soft}"/>`);
    case "box":
    default:
      return svg(400, 400, base + `<rect x="108" y="108" width="184" height="184" rx="22" fill="${fill}"/><rect x="146" y="146" width="108" height="108" rx="14" fill="${soft}" opacity="0.75"/>`);
  }
}

/* ── Template-scoped helpers ──────────────────────────────────────────────────
 * withStyle() sets the palette for the duration of one template's block tree, so
 * every helper below (headings, art, callouts, TOC, buttons) picks it up without
 * each call site repeating the colours.
 */
const DEFAULT_STYLE = () => palette("#1f6b4a");
let CURRENT = null;
let artSeq = 0;
const cur = () => CURRENT || (CURRENT = DEFAULT_STYLE());
const nextArt = () => {
  const arts = cur().arts;
  return arts[artSeq++ % arts.length];
};
let photoSeq = 0;
const nextPhoto = () => {
  const photos = cur().photos;
  return photos.length ? photos[photoSeq++ % photos.length] : "";
};
const defined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

function withStyle(style, build) {
  const prevStyle = CURRENT;
  const prevSeq = artSeq;
  const prevPhoto = photoSeq;
  CURRENT = style;
  artSeq = 0;
  photoSeq = 0;
  try {
    const blocks = build();
    // Hero-less templates open on a tinted band so the card, the canvas and the article
    // all lead with the template's colour instead of an identical white page.
    const first = blocks[0];
    if (style.band && first && first.type === "Section") {
      first.settings = {
        ...first.settings,
        backgroundColor: style.tint,
        paddingTop: "36px",
        paddingBottom: "30px",
        paddingLeft: "28px",
        paddingRight: "28px",
        borderRadius: style.bandRadius,
      };
    }
    return blocks;
  } finally {
    CURRENT = prevStyle;
    artSeq = prevSeq;
    photoSeq = prevPhoto;
  }
}

const SAMPLE_PRODUCTS = [
  { title: "Bestseller", price: "49.00", handle: "bestseller" },
  { title: "Everyday pick", price: "32.00", handle: "everyday-pick" },
  { title: "Premium option", price: "89.00", handle: "premium-option" },
  { title: "Great value", price: "24.00", handle: "great-value" },
];

function sampleProduct(i = 0) {
  const s = cur();
  const catalogue = s.products && s.products.length ? s.products : SAMPLE_PRODUCTS;
  const base = catalogue[i % catalogue.length];
  const img = s.productPhotos.length
    ? s.productPhotos[i % s.productPhotos.length]
    : productSrc(s, i);
  return {
    handle: base.handle || base.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    ...base,
    currency: "USD",
    image: img,
    featuredImage: { url: img },
    description: base.description || "A short line about why shoppers pick this one.",
  };
}

const heading = (text, level = 2, extra = {}) => {
  const s = cur();
  const base =
    level === 1
      ? { color: s.h1Color, align: s.h1Align, fontSize: s.h1Size }
      : level === 2
        ? { color: s.h2Color, align: s.h2Align }
        : { color: s.h3Color };
  return { type: "Heading", settings: { text, level, ...defined(base), ...extra }, children: [] };
};
const rich = (paragraphs, extra = {}) => {
  const { color, ...rest } = extra;
  return { type: "RichText", settings: { content: doc(paragraphs, color), ...rest }, children: [] };
};
const image = (alt, extra = {}) => ({
  type: "Image",
  settings: {
    alt,
    ...extra,
    src: extra.src || nextPhoto() || photoSrc(cur(), extra.art || nextArt()),
  },
  children: [],
});
const spacer = (height = "32px") => ({ type: "Spacer", settings: { height }, children: [] });
const divider = () => ({ type: "Divider", settings: { color: cur().soft, thickness: "2px" }, children: [] });
const callout = (settings = {}) => ({
  type: "Callout",
  settings: { backgroundColor: cur().tint, borderColor: cur().accent, ...settings },
  children: [],
});
const button = (text, extra = {}) => ({
  type: "ButtonBlock",
  settings: { text, backgroundColor: cur().accent, ...extra },
  children: [],
});
const faq = (title, items, extra = {}) => ({
  type: "FaqBlock",
  settings: { title, items, accentColor: cur().accent, borderColor: cur().soft, ...extra },
  children: [],
});
const toc = (extra) => ({ type: "TableOfContents", settings: extra || {}, children: [] });
let buySeq = 0;
const buyButton = (extra = {}) => ({
  type: "BuyButton",
  settings: {
    showPrice: true,
    buttonColor: cur().accent,
    ...extra,
    product: extra.product || sampleProduct(buySeq++),
  },
  children: [],
});
const productGrid = (extra = {}) => {
  const count = Math.max(1, Math.min(Number(extra.columns) || 3, 4));
  return {
    type: "ProductGrid",
    settings: {
      showPrice: true,
      showButton: true,
      buttonColor: cur().accent,
      cardStyle: cur().cardStyle,
      ...extra,
      manualProducts:
        extra.manualProducts && extra.manualProducts.length
          ? extra.manualProducts
          : SAMPLE_PRODUCTS.slice(0, count).map((_, i) => sampleProduct(i)),
    },
    children: [],
  };
};
const collectionBlock = (extra = {}) => ({
  type: "Collection",
  settings: {
    collectionHandle: "",
    heading: "Shop the collection",
    columns: 3,
    showPrice: true,
    showButton: true,
    buttonColor: cur().accent,
    ...extra,
    manualProducts:
      extra.manualProducts && extra.manualProducts.length
        ? extra.manualProducts
        : [0, 1, 2].map((i) => sampleProduct(i)),
  },
  children: [],
});
const hero = (extra = {}) => {
  const s = cur();
  const bg = extra.backgroundImage || s.heroPhoto || heroSrc(s);
  const isPhoto = bg.startsWith("http");
  return {
    type: "HeroSection",
    settings: {
      ctaColor: s.accent,
      overlayColor: "#000000",
      // A photo needs a heavier scrim than flat generated art for white type to hold up.
      overlayOpacity: isPhoto ? 0.45 : 0.25,
      ...extra,
      backgroundImage: bg,
    },
    children: [],
  };
};
const table = (rows, cols, tableData, hasHeader = true) => ({
  type: "Table",
  settings: { rows, cols, tableData, hasHeader },
  children: [],
});

let faqIdCounter = 0;
const faqItem = (question, answer) => ({ id: `faq_${++faqIdCounter}`, question, answer });

// `style` stays in the signature so each template reads as self-documenting, but the
// treatment (solid panel vs. light list, numbered vs. bulleted) comes from the palette.
const tocPanel = (title, style, extra = {}) => {
  const s = style || cur();
  return toc({
    title,
    style: s.tocStyle,
    listStyle: s.tocList,
    backgroundColor: s.tocBg,
    textColor: s.tocStyle === "panel" ? s.tocFg : "#202223",
    titleColor: s.tocStyle === "panel" ? s.tocFg : s.accent,
    padding: "18px 22px",
    borderRadius: 10,
    ...extra,
  });
};

const STYLE = {
  review: palette("#1f6b4a", {
    heroArt: "split",
    arts: ["detail", "landscape"],
    heroPhoto: photo("copper-kettle-pour-over-coffee"),
    photos: [photo("pour-over-coffee"), photo("high-end-pour-over-coffee-system")],
    productPhotos: [photo("glass-coffee-pour", 800)],
    products: [{ title: "Copper Pour-Over Kettle", price: "89.00", description: "Gooseneck spout, 1L, thermometer lid." }],
  }),
  howTo: palette("#1d4ed8", {
    arts: ["steps"],
    tocList: "numbered",
    h1Size: "36px",
    photos: [
      photo("iron-skillet-with-meat-and-potatoes-on-wooden-board"),
      photo("cleaning-supply-flatlay-white"),
      photo("flatlay-iron-skillet-with-meat-and-other-food"),
    ],
    productPhotos: [photo("cleaning-supply-flatlay-bottom", 800), photo("cleaning-supply-bucket-in-kitchen", 800), photo("cleaning-blue-knolling-flatlay", 800)],
    products: [
      { title: "Chainmail Scrubber", price: "18.00" },
      { title: "Seasoning Oil, 8 oz", price: "14.00" },
      { title: "Cast Iron Care Kit", price: "42.00" },
    ],
  }),
  listicle: palette("#c2410c", {
    heroArt: "stripes",
    arts: ["rank"],
    heroPhoto: photo("handmade-soap-stacked"),
    photos: [photo("all-natural-handmade-soap"), photo("handmade-charcoal-soap"), photo("handmade-soap-wrapped")],
    productPhotos: [photo("handmade-soap", 800), photo("handmade-charcoal-soap", 800), photo("all-natural-handmade-soap", 800)],
    products: [
      { title: "Oat & Honey Bar", price: "12.00" },
      { title: "Charcoal Detox Bar", price: "14.00" },
      { title: "Unscented Sensitive Bar", price: "11.00" },
    ],
  }),
  buying: palette("#0f766e", {
    arts: ["chart"],
    tocStyle: "plain",
    h1Size: "36px",
    cardStyle: "border",
    photos: [photo("black-headphones"), photo("noise-cancelling-headphones")],
    productPhotos: [photo("black-headphones-closeup", 800), photo("noise-cancelling-headphones", 800), photo("red-bluetooth-earbuds", 800)],
    products: [
      { title: "Studio ANC Over-Ear", price: "249.00" },
      { title: "Daily Wireless On-Ear", price: "129.00" },
      { title: "Commuter Earbuds", price: "89.00" },
    ],
  }),
  vs: palette("#7c3aed", {
    heroArt: "corner",
    arts: ["portrait"],
    tocStyle: "plain",
    tocList: "bullet",
    cardStyle: "border",
    photos: [photo("mug-of-coffee-and-a-french-press-on-a-window-sill"), photo("pour-over-coffee")],
    productPhotos: [photo("mug-of-coffee-and-a-french-press-on-a-window-sill", 800), photo("glass-coffee-pour", 800)],
    products: [
      { title: "Classic French Press, 1L", price: "45.00" },
      { title: "Ceramic Pour-Over Dripper", price: "38.00" },
    ],
  }),
  launch: palette("#dc2626", {
    heroArt: "radial",
    arts: ["flatlay"],
    productArt: "tall",
    h1Align: "center",
    h2Align: "center",
    heroPhoto: photo("candle-burning"),
    photos: [photo("8-ounce-soy-candle"), photo("4-ounce-soy-candle")],
    productPhotos: [photo("8-ounce-soy-candle", 800)],
    products: [{ title: "Ember Soy Candle, 8 oz", price: "34.00", description: "Cedar, black pepper and vetiver. 55-hour burn." }],
  }),
  collection: palette("#4338ca", {
    heroArt: "grid",
    arts: ["swatch", "flatlay"],
    heroPhoto: photo("simple-white-shirts-on-shop-clothing-rack"),
    photos: [photo("white-t-shirts-on-clothing-rack")],
    productPhotos: [photo("white-t-shirts-on-clothing-rack", 800), photo("colorful-t-shirts-on-clothing-rack-size-medium", 800), photo("clothing-rack-t-shirts-for-sale-blank-sign", 800)],
    products: [
      { title: "Everyday Crew Tee", price: "38.00" },
      { title: "Boxy Linen Shirt", price: "88.00" },
      { title: "Wide-Leg Linen Trouser", price: "110.00" },
    ],
  }),
  conversion: palette("#0891b2", {
    heroArt: "wave",
    arts: ["flatlay"],
    productArt: "tall",
    heroPhoto: photo("noise-cancelling-headphones"),
    photos: [photo("black-headphones-closeup")],
    productPhotos: [photo("black-headphones", 800)],
    products: [{ title: "Studio ANC Over-Ear", price: "249.00", description: "40-hour battery, adaptive noise cancelling." }],
  }),
  faq: palette("#475569", {
    arts: ["quote"],
    tocStyle: "plain",
    tocList: "bullet",
    bandRadius: "0px",
    cardStyle: "border",
    photos: [photo("young-man-preparing-a-package-for-fulfillment"), photo("package-handled-with-care")],
  }),
  fit: palette("#0369a1", {
    arts: ["measure"],
    productArt: "garment",
    tocStyle: "plain",
    cardStyle: "border",
    photos: [photo("tape-measure-on-wood"), photo("white-t-shirts-on-clothing-rack")],
    productPhotos: [photo("simple-white-shirts-on-shop-clothing-rack", 800)],
    products: [{ title: "Studio Heavyweight Tee", price: "42.00", description: "260 gsm cotton, boxy fit, sizes XS–3XL." }],
  }),
  care: palette("#15803d", {
    arts: ["detail"],
    productArt: "round",
    tocList: "numbered",
    cardStyle: "border",
    photos: [photo("suede-boots-fashion"), photo("boots-in-autumn-leaves")],
    productPhotos: [photo("cleaning-supply-flatlay-white", 800), photo("cleaning-supply-bucket-over-grey", 800), photo("splashy-hand-cleaning", 800)],
    products: [
      { title: "Suede Brush", price: "16.00" },
      { title: "Waterproofing Spray", price: "22.00" },
      { title: "Cedar Shoe Trees", price: "34.00" },
    ],
  }),
  recipe: palette("#4d7c0f", {
    heroArt: "arch",
    arts: ["plate", "steps"],
    productArt: "round",
    h1Align: "center",
    cardStyle: "border",
    heroPhoto: photo("treat-yoself-cookies"),
    photos: [photo("cracking-egg-for-baking"), photo("cookies-on-milk")],
    productPhotos: [photo("cookie-crumbs-left-by-santa", 800), photo("cup-of-tea-cookie", 800), photo("milk-cookies-for-santa", 800)],
    products: [
      { title: "Nordic Baking Sheet", price: "39.00" },
      { title: "Vanilla Bean Paste", price: "18.00" },
      { title: "Flaky Sea Salt Tin", price: "12.00" },
    ],
  }),
  story: palette("#b45309", {
    heroArt: "frame",
    arts: ["portrait", "landscape"],
    tocStyle: "plain",
    tocList: "bullet",
    h1Align: "center",
    h1Size: "40px",
    cardStyle: "minimal",
    heroPhoto: photo("handmade-soap-wrapped"),
    photos: [photo("workshop-shelves"), photo("all-natural-handmade-soap")],
  }),
  lookbook: palette("#be185d", {
    heroArt: "frame",
    arts: ["hanger", "portrait"],
    productArt: "garment",
    tocList: "bullet",
    h1Align: "center",
    cardStyle: "minimal",
    heroPhoto: photo("cozy-fall-fashion-in-field"),
    photos: [photo("soft-flowy-outfit"), photo("outfit-of-the-day"), photo("gentlemans-fashion-flatlay")],
    productPhotos: [photo("soft-flowy-outfit", 800), photo("gentlemans-fashion-flatlay", 800)],
    products: [
      { title: "Wool Overshirt", price: "165.00" },
      { title: "Pleated Midi Skirt", price: "98.00" },
    ],
  }),
  caseStudy: palette("#7c2d12", {
    arts: ["quote", "chart"],
    tocStyle: "plain",
    tocList: "bullet",
    cardStyle: "minimal",
    photos: [photo("woman-smiling-in-casual-wear"), photo("stylish-woman-smiling")],
    productPhotos: [photo("glass-coffee-pour", 800)],
    products: [{ title: "Copper Pour-Over Kettle", price: "89.00", description: "The kettle from Maya's setup." }],
  }),
  gift: palette("#a16207", {
    heroArt: "dots",
    arts: ["flatlay"],
    productArt: "gift",
    h1Align: "center",
    heroPhoto: photo("gift-wrapped-with-bow"),
    photos: [photo("gift-wrapping-supplies"), photo("holiday-gift-wrapping")],
    productPhotos: [photo("8-ounce-soy-candle", 800), photo("handmade-soap-wrapped", 800), photo("teapot-cup-and-milk", 800), photo("cup-of-tea-cookie", 800)],
    products: [
      { title: "Ember Soy Candle", price: "34.00" },
      { title: "Soap Trio Gift Box", price: "32.00" },
      { title: "Stoneware Teapot", price: "48.00" },
      { title: "Biscuit Tin, 12 pc", price: "24.00" },
    ],
  }),

  // ── Industry templates: written end to end, so a merchant in that niche can publish
  // after swapping the products and a few facts. ──────────────────────────────────────
  beauty: palette("#9d174d", {
    heroArt: "frame",
    arts: ["detail"],
    productArt: "round",
    tocList: "numbered",
    h1Align: "center",
    heroPhoto: photo("woman-practicing-her-skincare-routine"),
    photos: [
      photo("two-hands-running-in-skincare-treatment"),
      photo("under-eye-patches-for-skincare"),
      photo("woman-opening-cosmetic-jar"),
    ],
    productPhotos: [photo("activated-charcoal-cosmetics", 800), photo("diy-cosmetic-tins", 800), photo("makeup-beauty-flatlay", 800)],
    products: [
      { title: "Gentle Milk Cleanser", price: "26.00" },
      { title: "5% Niacinamide Serum", price: "32.00" },
      { title: "Ceramide Night Cream", price: "44.00" },
    ],
  }),
  fitness: palette("#0f172a", {
    heroArt: "corner",
    arts: ["steps"],
    tocList: "numbered",
    cardStyle: "border",
    heroPhoto: photo("dancers-pose-yoga-rooftop"),
    photos: [
      photo("balasana-yoga"),
      photo("garudasana-pose-yoga"),
      photo("extended-hand-to-toe-pose-yoga"),
      photo("eagle-arms-yoga"),
    ],
    productPhotos: [photo("teal-yoga-mat", 800), photo("purple-yoga-blocks", 800), photo("yoga-accessories", 800)],
    products: [
      { title: "Studio Yoga Mat, 5mm", price: "68.00" },
      { title: "Cork Yoga Block, Pair", price: "34.00" },
      { title: "Cotton Yoga Strap", price: "18.00" },
    ],
  }),
  home: palette("#166534", {
    heroArt: "arch",
    arts: ["detail", "landscape"],
    tocStyle: "plain",
    cardStyle: "border",
    heroPhoto: photo("plant-wall-of-succulents"),
    photos: [photo("organic-green-plant-closeup"), photo("cozy-livingroom-with-window"), photo("bright-green-plant-closeup")],
    productPhotos: [photo("green-pink-succulent", 800), photo("gardening-flatlay", 800), photo("yellow-background-gardening-tools", 800)],
    products: [
      { title: "Potted Snake Plant", price: "42.00" },
      { title: "Terracotta Pot, 8in", price: "24.00" },
      { title: "Brass Watering Can", price: "58.00" },
    ],
  }),
  food: palette("#9a3412", {
    heroArt: "split",
    arts: ["plate", "steps"],
    productArt: "round",
    h1Align: "center",
    heroPhoto: photo("fresh-baked-pastry-at-modern-cafe"),
    photos: [photo("pizza-dough-ready-to-roll"), photo("cracking-egg-for-baking"), photo("puff-pastry-plated")],
    productPhotos: [photo("cup-of-tea-cookie", 800), photo("croissant-coffee", 800), photo("slicing-fresh-bread", 800)],
    products: [
      { title: "Cinnamon Roll Kit", price: "36.00" },
      { title: "Ceylon Cinnamon, 4 oz", price: "14.00" },
      { title: "Baker's Bench Scraper", price: "11.00" },
    ],
  }),
  christmas: palette("#166534", {
    heroArt: "dots",
    arts: ["flatlay", "detail"],
    productArt: "gift",
    h1Align: "center",
    h1Size: "38px",
    heroPhoto: photo("gold-christmas-gift-wrap"),
    photos: [photo("christmas-gift-box"), photo("holiday-gift-wrapping"), photo("christmas-cookies")],
    productPhotos: [photo("8-ounce-soy-candle", 800), photo("teapot-cup-and-milk", 800), photo("handmade-soap-stacked", 800), photo("4-ounce-soy-candle", 800)],
    products: [
      { title: "Spiced Fir Candle", price: "36.00" },
      { title: "Stoneware Teapot", price: "48.00" },
      { title: "Soap Trio Gift Box", price: "32.00" },
      { title: "Mini Candle Set", price: "28.00" },
    ],
  }),
};

export const BLOG_TEMPLATES = [
  {
    key: "product-review",
    name: "Product Review",
    description: "Honest single-product review — verdict first, pros & cons, then add to cart.",
    category: "Commerce",
    badge: "Popular",
    style: STYLE.review,
    preview: { hero: "image", toc: true, columns: 2, products: 1, steps: 0 },
    blocks: withStyle(STYLE.review, () => [
      hero({
        heading: "We Brewed With the Copper Pour-Over Kettle for 30 Days",
        subheading: "A gooseneck kettle at $89. Here's what held up and what didn't.",
        minHeight: "360px",
        showCta: true,
        ctaText: "Shop this product",
        ctaUrl: "/",
      }),
      section({ paddingTop: "32px", paddingBottom: "8px" }, [tocPanel("In this review", STYLE.review)]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("The quick verdict", 2),
        callout({
          type: "info",
          title: "Bottom line",
          body: "If you already grind fresh and you're still chasing an even extraction, the flow control here is the upgrade that finally fixes it. If you brew one mug on autopilot each morning, a $30 kettle pours nearly as well.",
          emoji: "✅",
        }),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("What it is & who it is for", 2),
        rich([
          "The Copper Pour-Over Kettle is a 1-litre stovetop gooseneck with a thermometer built into the lid. The narrow spout slows the pour to roughly 4 ml a second, which is the difference between soaking your grounds and actually saturating them evenly.",
          "It's built for the home brewer who has already bought a burr grinder and a scale, and keeps getting a sour cup anyway. If you brew with a drip machine, none of this reaches you.",
        ]),
        image("Pouring from the copper kettle"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Pros & cons", 2),
        columns(2, [
          [
            heading("What we liked", 3),
            rich([
              "The pour is genuinely controllable — you can hold a thin stream through a full 45-second bloom.",
              "The lid thermometer settles in about 8 seconds, so you stop guessing at 96°C.",
              "Copper heats fast: 1 litre came up in 4 minutes 10 on a standard gas ring.",
            ]),
          ],
          [
            heading("What could be better", 3),
            rich([
              "The handle gets warm by the third pour. Not dangerous, but you'll want it off the heat before the last one.",
              "Copper shows water spots within a week. It's a wipe-dry-after-use kettle, not a leave-on-the-hob kettle.",
            ]),
          ],
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("How it performed", 2),
        rich([
          "First brew out of the box, the pour was steadier than the cheap gooseneck it replaced, and the difference showed up in the cup: the same 18 g dose tasted rounder and noticeably less sharp.",
          "Thirty days in, it has been through roughly 60 brews with no pitting inside and no loosening at the handle rivets. The exterior has dulled a little — that's copper doing what copper does.",
        ]),
        image("Pour-over setup on the counter"),
      ]),
      section({ backgroundColor: cur().tint, paddingTop: "32px", paddingBottom: "32px", borderRadius: "12px" }, [
        heading("Ready to try it?", 2, { align: "center" }),
        buyButton({ layout: "horizontal", showDescription: true }),
      ]),
      section({ paddingTop: "24px", paddingBottom: "24px" }, [
        faq("Common questions", [
          faqItem(
            "Is it worth $89 over a $30 gooseneck?",
            "If you brew more than a few times a week, yes — the flow control and the lid thermometer are the two things cheap kettles get wrong. For occasional brewing, put the money into a grinder first."
          ),
          faqItem(
            "Does it work on induction?",
            "Yes. The base is flat and magnetic. On induction it came up to temperature about a minute faster than on gas."
          ),
          faqItem(
            "What's the return policy?",
            "30 days, unused and in the original box. Swap in your own window and link your returns page here."
          ),
        ]),
      ]),
    ]),
  },
  {
    key: "how-to-guide",
    name: "How-To Guide",
    description: "Numbered, skimmable steps with a table of contents and a related-products close.",
    category: "Educational",
    badge: null,
    style: STYLE.howTo,
    preview: { hero: "none", toc: true, columns: 1, products: 3, steps: 4 },
    blocks: withStyle(STYLE.howTo, () => [
      section({ paddingTop: "16px", paddingBottom: "8px" }, [
        heading("How to Clean and Season a Cast Iron Skillet", 1),
        rich([
          "Fifteen minutes of work and one hour in the oven, and a rusted pan comes back to a slick black finish. This is the routine we use on every skillet that comes through the shop.",
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [tocPanel("What you'll learn", STYLE.howTo)]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("What you'll need", 2),
        rich([
          "Coarse salt, a chainmail scrubber or stiff brush, a lint-free cloth, and a high smoke-point oil — grapeseed or flaxseed. Skip the soap debate: a drop of dish soap is fine on a seasoned pan.",
        ]),
      ]),
      divider(),
      section({ paddingTop: "16px", paddingBottom: "16px" }, [
        heading("Step 1: Strip what's loose", 2),
        rich([
          "Warm the pan, add a tablespoon of coarse salt, and scrub with the chainmail until the surface is uniformly grey-black. You're removing stuck food and flaking seasoning, not the patina underneath.",
        ]),
        image("Cast iron skillet after scrubbing"),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("Step 2: Dry it completely", 2),
        rich([
          "Rinse, then dry on a low burner for two or three minutes until no steam comes off. Water left in the pores is the entire reason cast iron rusts overnight.",
        ]),
        image("Drying the pan on the stove"),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("Step 3: Oil it thinner than feels right", 2),
        rich([
          "A half-teaspoon of oil over the whole pan, inside, outside and handle — then wipe it back off with a clean cloth until it looks dry. The film you can still see is already too thick.",
        ]),
        callout({
          type: "tip",
          title: "Pro tip",
          body: "Sticky, blotchy seasoning is almost always too much oil, not too little heat. If in doubt, wipe again.",
          emoji: "💡",
        }),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("Step 4: Bake it upside down", 2),
        rich([
          "Oven at 230°C, pan inverted on the middle rack, foil on the shelf below. One hour, then cool in the oven. Done right it comes out matte black and slick — repeat the cycle two more times on a bare pan.",
        ]),
        image("Seasoned skillet with food"),
      ]),
      section({ paddingTop: "16px", paddingBottom: "24px" }, [
        heading("Shop the tools we used", 2),
        productGrid({ columns: 3 }),
      ]),
    ]),
  },
  {
    key: "top-picks-listicle",
    name: "Top Picks Listicle",
    description: "Ranked 'best of' roundup — numbered sections, each with an image, blurb, and product card.",
    category: "Commerce",
    badge: "Popular",
    style: STYLE.listicle,
    preview: { hero: "gradient", toc: true, columns: 1, products: 3, steps: 0 },
    blocks: withStyle(STYLE.listicle, () => [
      hero({
        heading: "The 3 Best Natural Soaps for Sensitive Skin in 2026",
        subheading: "We washed with 14 bars for six weeks. These are the three that never stung.",
        minHeight: "320px",
        showCta: false,
      }),
      section({ paddingTop: "28px", paddingBottom: "12px" }, [tocPanel("The ranking", STYLE.listicle)]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("How we picked", 2),
        rich([
          "Every bar was cold-processed, fragrance-free or naturally scented, and tested twice daily for six weeks on hands and face. We scored three things: how tight skin felt after 10 minutes, how fast the bar dissolved in a wet dish, and whether the lather held up in hard water.",
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("1. Best overall: Oat & Honey Bar", 2),
        image("Oat and honey soap bar"),
        rich([
          "The only bar in the test that left skin feeling the same at minute ten as it did at minute one. Colloidal oats do the heavy lifting; the honey keeps it from going squeaky. It softens faster than the others, so it wants a draining dish.",
        ]),
        buyButton({}),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("2. Best value: Charcoal Detox Bar", 2),
        image("Charcoal soap bar"),
        rich([
          "Two dollars more than the oat bar and it lasted about a third longer — nine weeks of daily hand washing before it was a sliver. Best for anyone whose skin turns oily by mid-afternoon.",
        ]),
        buyButton({}),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("3. Best for reactive skin: Unscented Sensitive Bar", 2),
        image("Wrapped handmade soap"),
        rich([
          "No essential oils at all, which is the point. If citrus or lavender bars have set you off before, start here and add scent back later — this is the one dermatologists in our reader survey kept naming.",
        ]),
        buyButton({}),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Quick comparison", 2),
        table(4, 4, [
          ["Pick", "Best for", "Price", "Lasted"],
          ["Oat & Honey", "Most people", "$12", "6 weeks"],
          ["Charcoal Detox", "Oily skin", "$14", "9 weeks"],
          ["Unscented Sensitive", "Reactive skin", "$11", "7 weeks"],
        ]),
      ]),
    ]),
  },
  {
    key: "buying-guide",
    name: "Buying Guide",
    description: "Helps undecided shoppers choose — spec table, trade-offs, and a clear recommendation.",
    category: "Commerce",
    badge: null,
    style: STYLE.buying,
    preview: { hero: "none", toc: true, columns: 1, products: 3, steps: 0 },
    blocks: withStyle(STYLE.buying, () => [
      section({ paddingTop: "16px", paddingBottom: "8px" }, [
        heading("How to Choose Noise-Cancelling Headphones in 2026", 1),
        rich([
          "By the end of this guide you'll know which of three specs actually changes your day, and which two you can safely ignore no matter what the box says.",
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [tocPanel("In this guide", STYLE.buying)]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Start with how you'll use them", 2),
        rich([
          "Open-plan office, six hours a day: comfort and clamp force matter more than raw cancellation — you'll take them off by lunch otherwise.",
          "Daily commute on a bus or train: cancellation depth and battery life win, weight barely registers on a 40-minute trip.",
          "Flights a few times a year: get over-ear, get a case, and stop reading spec sheets.",
        ]),
        image("Over-ear headphones on a desk"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("The specs that actually matter", 2),
        rich([
          "Clamp force is the one nobody prints. If a shop lets you wear a pair for ten minutes, do it — pressure at the temples is what ends long sessions.",
          "Battery life over 30 hours is effectively unlimited: you'll charge weekly either way. Below 20 hours you'll charge mid-week and resent it.",
          "Driver size tells you almost nothing on its own. Ignore it.",
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Side-by-side", 2),
        table(4, 4, [
          ["", "Studio ANC", "Daily On-Ear", "Commuter Buds"],
          ["Best for", "All-day desk work", "Mixed use", "Transit and gym"],
          ["Battery", "40 hrs", "30 hrs", "8 hrs + case"],
          ["Skip if", "You want pocketable", "You need deep ANC", "You wear glasses all day"],
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Our recommendation", 2),
        callout({
          type: "success",
          title: "If you buy one",
          body: "The Studio ANC Over-Ear at $249. It's the only pair in the range that stayed comfortable past the four-hour mark, and that's the spec that decides whether they get worn.",
          emoji: "👉",
        }),
        buyButton({}),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Shop the shortlist", 2),
        productGrid({ columns: 3 }),
      ]),
    ]),
  },
  {
    key: "versus-comparison",
    name: "Product A vs B",
    description: "Side-by-side comparison with a winner and a clear next step.",
    category: "Commerce",
    badge: null,
    style: STYLE.vs,
    preview: { hero: "none", toc: true, columns: 2, products: 2, steps: 0 },
    blocks: withStyle(STYLE.vs, () => [
      section({ paddingTop: "16px", paddingBottom: "8px" }, [
        heading("French Press vs Pour-Over: Which Should You Buy?", 1),
        rich([
          "Both make a better cup than a drip machine and both cost under $50. The choice comes down to one question nobody asks in the shop: how much attention are you willing to give the first ten minutes of your morning?",
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [tocPanel("Compare", STYLE.vs)]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        columns(2, [
          [
            heading("Classic French Press", 2),
            image("French press on a window sill"),
            rich([
              "Four minutes, one timer, no technique. Full-bodied and a little silty — for anyone who wants coffee, not a hobby.",
            ]),
            buyButton({}),
          ],
          [
            heading("Ceramic Pour-Over", 2),
            image("Pour-over dripper mid-brew"),
            rich([
              "Three minutes of hands-on pouring for a cleaner, brighter cup that shows off a good single origin — and punishes a bad grinder.",
            ]),
            buyButton({}),
          ],
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Head-to-head", 2),
        table(5, 3, [
          ["", "French press", "Pour-over"],
          ["Price", "$45", "$38"],
          ["Hands-on time", "30 seconds", "3 minutes"],
          ["Body vs clarity", "Heavy, textured", "Clean, bright"],
          ["Watch-out", "Sludge if you over-steep", "Needs a burr grinder"],
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("The winner", 2),
        callout({
          type: "success",
          title: "We'd buy the French press",
          body: "It's the one that still gets used on a Tuesday. Buy the pour-over instead if you already grind fresh and you want to taste what you paid for in a $22 bag of beans.",
          emoji: "🏆",
        }),
      ]),
    ]),
  },
  {
    key: "product-launch",
    name: "New Product Launch",
    description: "Announce a new product with a bold hero, feature highlights, and a first-buyer CTA.",
    category: "Commerce",
    badge: "New",
    style: STYLE.launch,
    preview: { hero: "image", toc: true, columns: 1, products: 1, steps: 0 },
    blocks: withStyle(STYLE.launch, () => [
      hero({
        heading: "Introducing the Ember Soy Candle",
        subheading: "Cedar, black pepper and vetiver. 55 hours. Available now in 8 oz.",
        minHeight: "380px",
        showCta: true,
        ctaText: "Shop the launch",
        ctaUrl: "/",
      }),
      section({ paddingTop: "28px", paddingBottom: "12px" }, [tocPanel("What's new", STYLE.launch)]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Why we made it", 2),
        rich([
          "Every autumn we get the same message: something warm that isn't pumpkin, and please make it last longer than a weekend. Ember is the answer to both — eighteen months of blending, and a wax pour we tested to a 55-hour burn.",
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Three things you'll notice first", 2),
        columns(3, [
          [heading("It fills a room cold", 3), rich(["The cedar carries before you light it — you'll smell it when you open the box."])],
          [heading("An even burn pool", 3), rich(["A wider cotton wick reaches the edge in 90 minutes, so no wax tunnels down the side."])],
          [heading("55 hours, tested", 3), rich(["Burned in four-hour sessions until the wick gave out. Three of four jars passed 55."])],
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [image("Ember candle, 8 oz")]),
      section({ backgroundColor: cur().deep, paddingTop: "36px", paddingBottom: "36px" }, [
        heading("Be first to try it", 2, { align: "center", color: "#ffffff" }),
        rich(["First run is 400 jars. Orders placed before Friday ship Monday with a hand-numbered base."], { color: "#ffffff" }),
        buyButton({}),
      ]),
    ]),
  },
  {
    key: "collection-spotlight",
    name: "Collection Spotlight",
    description: "Feature a collection with story, three hero products, and a shop-all close.",
    category: "Commerce",
    badge: null,
    style: STYLE.collection,
    preview: { hero: "image", toc: true, columns: 1, products: 3, steps: 0 },
    blocks: withStyle(STYLE.collection, () => [
      hero({
        heading: "Inside the Everyday Linen Collection",
        subheading: "Nine pieces, one fabric, and a very specific idea about getting dressed fast.",
        minHeight: "340px",
        showCta: true,
        ctaText: "Shop the collection",
        ctaUrl: "/",
      }),
      section({ paddingTop: "28px", paddingBottom: "12px" }, [tocPanel("Explore", STYLE.collection)]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("The idea behind it", 2),
        rich([
          "We kept hearing the same thing from customers: the linen they own is beautiful and they wear it four times a summer, because everything needs pressing and nothing matches anything else.",
          "So this collection is one washed mid-weight linen in three colours that all work together. Every piece goes with every other piece, and none of it needs an iron.",
        ]),
        image("Linen shirts on a rack"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Three pieces to start with", 2),
        productGrid({ columns: 3 }),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Shop the full collection", 2),
        collectionBlock({}),
      ]),
    ]),
  },
  {
    key: "high-conversion-review",
    name: "High Conversion Review",
    description: "Same review skeleton as Product Review, with a louder TOC and CTA for product pages that need to sell.",
    category: "Commerce",
    badge: "Popular",
    style: STYLE.conversion,
    preview: { hero: "gradient", toc: true, columns: 2, products: 1, steps: 0 },
    blocks: withStyle(STYLE.conversion, () => [
      hero({
        heading: "Studio ANC Headphones: Worth It in 2026?",
        subheading: "The short answer is in the first screen. The proof is below.",
        minHeight: "340px",
        showCta: true,
        ctaText: "Add to cart",
        ctaUrl: "/",
      }),
      section({ paddingTop: "24px", paddingBottom: "8px" }, [tocPanel("Jump to", STYLE.conversion)]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        callout({
          type: "success",
          title: "Verdict",
          body: "Buy them if you work in an open-plan office and want the pair you forget you're wearing. Skip them if you mostly listen on the move — the buds are half the price and stay in your pocket.",
          emoji: "⚡",
        }),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Should you buy them?", 2),
        columns(2, [
          [
            heading("Buy if you…", 3),
            rich([
              "Sit near a busy walkway or a coffee machine.",
              "Take three or more calls a day and want the mic to handle them.",
              "Have given up on buds that fall out.",
            ]),
          ],
          [
            heading("Skip if you…", 3),
            rich([
              "Want something that lives in a jacket pocket.",
              "Wear glasses for eight hours and hate any pressure at the temple.",
            ]),
          ],
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("What you get", 2),
        image("Headphones close-up"),
        rich([
          "In the box: the headphones, a semi-rigid case, a USB-C cable and a 3.5 mm lead for aircraft. No charger, and the cable is short — 60 cm.",
          "Battery came in at 38 hours of real use against a claimed 40, with cancellation on the whole time.",
        ]),
      ]),
      section({ backgroundColor: cur().deep, paddingTop: "32px", paddingBottom: "32px" }, [
        heading("Get it today", 2, { align: "center", color: "#ffffff" }),
        buyButton({}),
      ]),
      section({ paddingTop: "24px", paddingBottom: "24px" }, [
        faq("Before you buy", [
          faqItem("Does it ship today?", "Orders placed before 2pm ship the same day. Set your own cutoff here and say which courier."),
          faqItem("Can I return them?", "30 days, and we pay return shipping on anything that doesn't fit right."),
        ]),
      ]),
    ]),
  },
  {
    key: "faq-support-article",
    name: "FAQ / Support",
    description: "Organize the questions your support team answers every week — searchable, schema-ready.",
    category: "Educational",
    badge: null,
    style: STYLE.faq,
    preview: { hero: "none", toc: true, columns: 1, products: 0, steps: 0 },
    blocks: withStyle(STYLE.faq, () => [
      section({ paddingTop: "16px", paddingBottom: "8px" }, [
        heading("Shipping, Returns & Warranty: Questions We Get Every Week", 1),
        rich([
          "Everything our support team answers most often, in one place. If your question isn't here, the last section has three ways to reach a human.",
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [tocPanel("Jump to a topic", STYLE.faq)]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Orders & shipping", 2),
        faq("Shipping", [
          faqItem(
            "How long does shipping take?",
            "Standard is 3–5 business days once the order leaves us, express is 1–2. Orders placed before 2pm on a weekday go out the same day."
          ),
          faqItem(
            "Do you ship internationally?",
            "We ship to 43 countries. Duties are calculated at checkout, so the price you pay is the final one — nothing is collected at the door."
          ),
          faqItem(
            "Can I change my address after ordering?",
            "Yes, until the label is printed. Reply to your confirmation email and we'll catch it if it hasn't shipped."
          ),
        ]),
        image("Packing an order"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Returns & warranty", 2),
        faq("Returns", [
          faqItem(
            "How do I start a return?",
            "Open the returns portal with your order number and email. You'll get a prepaid label straight away and the refund lands 3–5 days after it reaches us."
          ),
          faqItem(
            "What's covered by the warranty?",
            "Two years on manufacturing faults — stitching, hardware and finish. Normal wear, accidental damage and anything altered after purchase aren't covered."
          ),
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Still stuck?", 2),
        rich([
          "Live chat is staffed 9am–6pm on weekdays and usually answers in under two minutes. Email gets a reply the same working day.",
        ]),
        button("Contact support", { url: "/pages/contact" }),
      ]),
    ]),
  },
  {
    key: "size-fit-guide",
    name: "Size & Fit Guide",
    description: "Help shoppers pick the right size — measurements, how it fits, and a product close.",
    category: "Educational",
    badge: null,
    style: STYLE.fit,
    preview: { hero: "none", toc: true, columns: 1, products: 1, steps: 0 },
    blocks: withStyle(STYLE.fit, () => [
      section({ paddingTop: "16px", paddingBottom: "8px" }, [
        heading("How the Studio Heavyweight Tee Fits", 1),
        rich([
          "It runs true to size with a deliberately boxy body. If you want it fitted through the chest, size down — it won't shrink into that shape on its own.",
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [tocPanel("Find your size", STYLE.fit)]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Measure yourself", 2),
        rich([
          "Take a tee you already like, lay it flat, and measure across the chest one inch below the armhole. Double that number and compare it to the chest column below — it's far more reliable than measuring your body.",
        ]),
        image("Tape measure on a workbench"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Size chart", 2),
        table(5, 4, [
          ["Size", "Chest (flat, in)", "Body length (in)", "Fits chest (in)"],
          ["S", "20", "27", "34–36"],
          ["M", "21.5", "28", "38–40"],
          ["L", "23", "29", "42–44"],
          ["XL", "24.5", "30", "46–48"],
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("If you're between sizes", 2),
        callout({
          type: "tip",
          title: "Our call",
          body: "Size up for a relaxed drape and a longer body. Size down if you're layering it under a shirt or you want the sleeve to sit above the elbow.",
          emoji: "📏",
        }),
        buyButton({}),
      ]),
    ]),
  },
  {
    key: "care-maintenance-guide",
    name: "Care & Maintenance",
    description: "Keep the product looking new — cleaning, storage, and what to avoid.",
    category: "Educational",
    badge: null,
    style: STYLE.care,
    preview: { hero: "none", toc: true, columns: 1, products: 1, steps: 3 },
    blocks: withStyle(STYLE.care, () => [
      section({ paddingTop: "16px", paddingBottom: "8px" }, [
        heading("How to Care for Suede Boots", 1),
        rich([
          "Two minutes of brushing after each wear will keep a pair looking new for years. One rainy walk without protector spray can undo that in an afternoon.",
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [tocPanel("Care steps", STYLE.care)]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Everyday care", 2),
        rich([
          "Brush the nap in one direction with a suede brush after each wear, while the boots are dry. Give them a full day between wears — the leather needs to release moisture or it stiffens.",
        ]),
        image("Suede boots"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Deep clean", 2),
        rich([
          "Once a season, or after a salt stain: lift dried dirt with a suede eraser, then brush against the nap and back with it. For water marks, dampen the whole panel evenly rather than spot-cleaning — that's what leaves a ring.",
        ]),
        image("Boots in autumn leaves"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("What to avoid", 2),
        callout({
          type: "warning",
          title: "Don't",
          body: "Never dry them at a radiator — the glue in the sole gives out long before the leather does. And skip household cleaners: anything with detergent strips the nap flat for good.",
          emoji: "⚠️",
        }),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Shop refills & extras", 2),
        productGrid({ columns: 3 }),
      ]),
    ]),
  },
  {
    key: "recipe-diy-tutorial",
    name: "Recipe / DIY",
    description: "Materials, time, and numbered steps — built for recipes, crafts, and kitchen projects.",
    category: "Educational",
    badge: "New",
    style: STYLE.recipe,
    preview: { hero: "image", toc: true, columns: 1, products: 3, steps: 4 },
    blocks: withStyle(STYLE.recipe, () => [
      hero({
        heading: "Brown Butter Chocolate Chip Cookies",
        subheading: "45 minutes, 18 cookies, one pan. The browned butter is the whole trick.",
        minHeight: "340px",
        showCta: false,
      }),
      section({ paddingTop: "28px", paddingBottom: "12px" }, [tocPanel("Make it", STYLE.recipe)]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Ingredients", 2),
        rich([
          "225 g unsalted butter · 200 g dark brown sugar · 100 g caster sugar · 2 eggs plus 1 yolk · 1 tsp vanilla bean paste · 320 g plain flour · 1 tsp bicarbonate of soda · 1 tsp fine salt · 300 g dark chocolate, chopped · flaky sea salt to finish.",
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Step 1: Brown the butter", 2),
        rich([
          "Melt the butter over medium heat and keep going past the foam, swirling, until the milk solids at the bottom turn amber and it smells like toffee — about 6 minutes. Pour it into your mixing bowl, scraping in every brown fleck, and let it cool for 10 minutes.",
        ]),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("Step 2: Build the dough", 2),
        rich([
          "Whisk both sugars into the warm butter, then the eggs and yolk one at a time until the mix goes glossy. Fold in the dry ingredients until barely combined, then the chocolate. Overmixing here is what makes a cakey cookie.",
        ]),
        image("Cracking an egg into the bowl"),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("Step 3: Rest the dough", 2),
        rich([
          "Chill for at least 30 minutes, or overnight if you can wait. Cold dough spreads slower, which is how you get a thick middle and crisp edges instead of one flat sheet.",
        ]),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("Step 4: Bake at 180°C", 2),
        rich([
          "Six balls per tray, well spaced, 11–13 minutes. Pull them when the edges are set and the centres still look underdone — they finish on the hot tray. Flaky salt goes on in the first minute out of the oven.",
        ]),
        image("Finished cookies with milk"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Shop what we used", 2),
        productGrid({ columns: 3 }),
      ]),
    ]),
  },
  {
    key: "brand-story",
    name: "Brand Story",
    description: "Narrative post for founder stories, milestones, or behind-the-scenes features.",
    category: "Editorial",
    badge: "New",
    style: STYLE.story,
    preview: { hero: "image", toc: true, columns: 1, products: 0, steps: 0 },
    blocks: withStyle(STYLE.story, () => [
      hero({
        heading: "The Story Behind Wildwood Soap Co.",
        subheading: "A kitchen table, one bad reaction, and six years of very slow growth.",
        minHeight: "380px",
        showCta: false,
      }),
      section({ paddingTop: "28px", paddingBottom: "12px" }, [tocPanel("The story", STYLE.story)]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("How it started", 2),
        rich([
          "In 2019 our founder's daughter reacted to every bar in the supermarket aisle. The dermatologist's advice was simple and unhelpful: find something with fewer ingredients.",
          "Nothing on the shelf qualified, so she made a batch in the kitchen with four. It worked. The second batch went to a neighbour, the tenth to a farmers' market stall, and by the end of that year the kitchen table wasn't big enough.",
        ]),
        image("Wrapped handmade soap"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("What we believe", 2),
        rich([
          "Short ingredient lists, printed in full on every wrapper — including the ones that sound unglamorous.",
          "Cold process, cured six weeks, no shortcuts to get stock out faster in December.",
          "If a bar doesn't suit your skin, we'd rather refund it than have you finish it out of politeness.",
        ]),
        image("Workshop shelves"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("What we're making next", 2),
        rich([
          "The workshop moved into an old dairy last spring, which finally gave us room to cure properly. First out of it: a shampoo bar we've been testing for two years, landing in early autumn.",
        ]),
        button("Shop the collection", { url: "/collections/all" }),
      ]),
    ]),
  },
  {
    key: "lookbook-style-guide",
    name: "Lookbook / Style Guide",
    description: "Visual inspiration with outfits or room looks, each tied to shoppable pieces.",
    category: "Editorial",
    badge: "New",
    style: STYLE.lookbook,
    preview: { hero: "image", toc: true, columns: 2, products: 3, steps: 0 },
    blocks: withStyle(STYLE.lookbook, () => [
      hero({
        heading: "Autumn 2026 Lookbook",
        subheading: "Two ways to wear the wool overshirt, from a school run to a late dinner.",
        minHeight: "380px",
        showCta: true,
        ctaText: "Shop the looks",
        ctaUrl: "/",
      }),
      section({ paddingTop: "28px", paddingBottom: "12px" }, [tocPanel("The looks", STYLE.lookbook)]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Look 1: Saturday, cold and bright", 2),
        columns(2, [
          [image("Soft flowing autumn outfit")],
          [
            rich([
              "The overshirt worn open over a heavyweight tee, with the pleated skirt and boots. It's the outfit that handles a 9°C morning and a warm café without a coat.",
              "Roll the cuff twice — the wool is stiff out of the box and it softens where you fold it.",
            ]),
            productGrid({ columns: 1 }),
          ],
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Look 2: Dinner, no coat", 2),
        columns(2, [
          [image("Outfit of the day")],
          [
            rich([
              "Same overshirt buttoned to the top and belted, which changes the shape completely. Add the midi skirt and it reads as a jacket rather than a shirt.",
            ]),
            productGrid({ columns: 1 }),
          ],
        ]),
      ]),
    ]),
  },
  {
    key: "customer-case-study",
    name: "Customer Case Study",
    description: "A real-customer story with the problem, the product, and the result.",
    category: "Editorial",
    badge: "New",
    style: STYLE.caseStudy,
    preview: { hero: "none", toc: true, columns: 1, products: 1, steps: 3 },
    blocks: withStyle(STYLE.caseStudy, () => [
      section({ paddingTop: "16px", paddingBottom: "8px" }, [
        heading("How Maya Cut Her Morning Coffee Routine From 12 Minutes to 5", 1),
        rich([
          "She wasn't looking for better coffee. She was looking for a way to stop reheating the same mug three times before she got out the door.",
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [tocPanel("The story", STYLE.caseStudy)]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("The problem", 2),
        rich([
          "\"I was boiling a full kettle, waiting for it to drop to temperature, guessing, and pouring too fast. Then the cup was bitter and I'd make another one.\" Twelve minutes, most mornings, and half of it spent waiting.",
        ]),
        image("Maya at home"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("What she tried", 2),
        rich([
          "A cheaper gooseneck first — the pour was better but she was still guessing at temperature and boiling far more water than one cup needed.",
          "Then a pod machine, which was fast and, in her words, \"not coffee I wanted to drink twice.\"",
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("The result", 2),
        callout({
          type: "success",
          title: "Five minutes, one cup, no second attempt",
          body: "Boiling 400 ml instead of a full kettle and reading the lid thermometer took the guesswork out. Six weeks in, she's made one bitter cup — and that was a stale bag of beans.",
          emoji: "✨",
        }),
        image("Smiling customer with a coffee"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Get the same setup", 2),
        buyButton({}),
      ]),
    ]),
  },
  {
    key: "gift-guide",
    name: "Gift Guide",
    description: "Occasion-based gift guide in shoppable groups — built for holiday and seasonal traffic.",
    category: "Seasonal",
    badge: "Popular",
    style: STYLE.gift,
    preview: { hero: "image", toc: true, columns: 1, products: 3, steps: 0 },
    blocks: withStyle(STYLE.gift, () => [
      hero({
        heading: "Gift Guide: 12 Gifts Under $50 for the Person Who Says They Want Nothing",
        subheading: "Grouped by who you're buying for, so you can send someone the link and be done.",
        minHeight: "360px",
        showCta: true,
        ctaText: "Shop gifts",
        ctaUrl: "/",
      }),
      section({ paddingTop: "28px", paddingBottom: "12px" }, [tocPanel("Shop by person", STYLE.gift)]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("For the host who has everything", 2),
        rich([
          "The rule that has never failed us: something they'll use up. Nobody re-gifts a candle they've already burned half of, and it doesn't add to a cupboard that's already full.",
        ]),
        productGrid({ columns: 3 }),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("For the one who is impossible to buy for", 2),
        rich([
          "Skip the gadget. An upgraded version of something they already use daily lands better — the teapot they'd never buy themselves, the soap that isn't from the supermarket.",
        ]),
        image("Gift wrapping supplies"),
        productGrid({ columns: 3 }),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Under $30", 2),
        rich([
          "Everything here wraps small and posts flat, which matters if you're sending it rather than handing it over.",
        ]),
        productGrid({ columns: 3 }),
      ]),
    ]),
  },

  /* ── Industry templates ─────────────────────────────────────────────────────
   * Written end to end with real photography, so a store in that niche can swap
   * the products and a few facts and publish the same day.
   */
  {
    key: "beauty-skincare-routine",
    name: "Beauty: Skincare Routine",
    description: "A written five-step evening routine with real photography — swap in your own products and publish.",
    category: "Industry",
    badge: "New",
    style: STYLE.beauty,
    preview: { hero: "image", toc: true, columns: 1, products: 3, steps: 5 },
    blocks: withStyle(STYLE.beauty, () => [
      hero({
        heading: "The 5-Step Evening Skincare Routine That Actually Works",
        subheading: "Ten minutes, five products, and the order that makes the difference.",
        minHeight: "360px",
        showCta: true,
        ctaText: "Shop the routine",
        ctaUrl: "/",
      }),
      section({ paddingTop: "28px", paddingBottom: "12px" }, [tocPanel("The routine", STYLE.beauty)]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Why the order matters more than the products", 2),
        rich([
          "Thinnest to thickest. That single rule decides whether an actives serum reaches skin or sits on top of a cream doing nothing — and it's the mistake behind most \"this didn't work for me\" reviews.",
          "Everything below takes about ten minutes, and four of the five steps take under a minute each.",
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Step 1: Take the day off", 2),
        rich([
          "Cleansing balm or oil on dry skin, 30 seconds of massage, then emulsify with warm water. If you wear SPF — and you should — this is the step that actually removes it.",
        ]),
        image("Applying cleanser"),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("Step 2: Cleanse again, gently", 2),
        rich([
          "A low-foaming milk or gel cleanser to lift what the balm loosened. Skin should feel comfortable afterwards — if it feels tight, the cleanser is too strong for you, not your skin too sensitive.",
        ]),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("Step 3: Treat, on damp skin", 2),
        rich([
          "One active per night. Niacinamide most evenings for texture and redness, a retinoid twice a week, and never the two in the same ten minutes when you're starting out.",
        ]),
        callout({
          type: "tip",
          title: "Start slower than you think",
          body: "Two nights a week for a month before you go to three. Every retinoid horror story starts with someone using it nightly in week one.",
          emoji: "💡",
        }),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("Step 4: Seal it in", 2),
        rich([
          "A ceramide moisturiser while the serum is still tacky. This is what stops the active drying you out, which is the reason most people quit in week two.",
        ]),
        image("Under-eye patches and moisturiser"),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("Step 5: Leave it alone", 2),
        rich([
          "No mirror-checking, no extra layers, and give it eight weeks before you judge anything. Skin turns over roughly every 28 days — two full cycles is the honest test.",
        ]),
        image("Opening a cosmetic jar"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Shop the routine", 2),
        productGrid({ columns: 3 }),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        faq("Common questions", [
          faqItem("Can I use vitamin C at night instead?", "You can, but it earns its keep in the morning under SPF. If you only own one active, keep it in the AM routine and use niacinamide here."),
          faqItem("Do I need an eye cream?", "Only if the skin around your eyes feels dry — a moisturiser you already own does the same job for most people."),
          faqItem("How long before I see anything?", "Texture and hydration in two to three weeks. Pigmentation and fine lines take eight to twelve, with SPF every single morning."),
        ]),
      ]),
    ]),
  },
  {
    key: "fitness-beginner-yoga",
    name: "Fitness: Beginner Guide",
    description: "Seven beginner yoga poses, written and photographed, with a shoppable gear close.",
    category: "Industry",
    badge: "New",
    style: STYLE.fitness,
    preview: { hero: "image", toc: true, columns: 1, products: 3, steps: 4 },
    blocks: withStyle(STYLE.fitness, () => [
      hero({
        heading: "The Top 7 Yoga Poses for Beginners",
        subheading: "A 20-minute sequence you can do at home, in order, with nothing but a mat.",
        minHeight: "380px",
        showCta: true,
        ctaText: "Shop yoga gear",
        ctaUrl: "/",
      }),
      section({ paddingTop: "28px", paddingBottom: "12px" }, [tocPanel("The sequence", STYLE.fitness)]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Before you start", 2),
        rich([
          "Warm room, empty stomach, and a mat with enough grip that your hands don't slide in downward dog. Hold each pose for five slow breaths — roughly 30 seconds — and move through the list in order.",
          "If something pinches rather than stretches, come out of it. Discomfort in the belly of a muscle is fine; anything sharp in a joint is not.",
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("1. Child's pose (Balasana)", 2),
        rich([
          "Knees wide, big toes touching, hips back to the heels and arms long. This is your reset — come back to it whenever the sequence gets away from you.",
        ]),
        image("Child's pose"),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("2. Downward-facing dog", 2),
        rich([
          "Hands shoulder-width, hips high, and a generous bend in the knees. Beginners chase straight legs and round the back instead — the long spine matters far more than the heels touching.",
        ]),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("3. Eagle arms (Garudasana arms)", 2),
        rich([
          "Cross the arms at the elbows, wrap the forearms, lift the elbows to shoulder height. Two minutes of this undoes a lot of what a desk does to your upper back.",
        ]),
        image("Eagle arms"),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("4. Extended hand-to-toe pose", 2),
        rich([
          "Stand tall, draw one knee in, then extend the leg only as far as you can without collapsing the standing hip. Use a strap around the foot — everyone does, including the people who look like they don't need it.",
        ]),
        image("Extended hand-to-toe pose"),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("5. Warrior II", 2),
        rich([
          "Front knee over the ankle, back foot flat and turned in slightly, arms level. Five breaths each side, and keep checking that front knee — it drifts inward the moment you stop looking.",
        ]),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("6. Dancer's pose (Natarajasana)", 2),
        rich([
          "The balance pose in the list, and the one worth being patient with. Hold a wall with your free hand for the first few weeks — the shape is the same, and you'll actually breathe in it.",
        ]),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("7. Savasana", 2),
        rich([
          "Flat on your back, arms away from the body, eyes closed, five full minutes. It's not the optional bit at the end — it's where the nervous system catches up with the rest of the practice.",
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        callout({
          type: "info",
          title: "How often?",
          body: "Three times a week beats one long session on a Sunday. Twenty minutes is plenty for the first two months.",
          emoji: "🧘",
        }),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("What you'll want on the mat", 2),
        productGrid({ columns: 3 }),
      ]),
    ]),
  },
  {
    key: "home-garden-plant-guide",
    name: "Home & Garden: Plant Guide",
    description: "A written low-light houseplant guide with care table, photography and shoppable pots.",
    category: "Industry",
    badge: "New",
    style: STYLE.home,
    preview: { hero: "image", toc: true, columns: 2, products: 3, steps: 0 },
    blocks: withStyle(STYLE.home, () => [
      hero({
        heading: "6 Houseplants That Actually Survive a North-Facing Room",
        subheading: "Tested through a winter in a flat that gets two hours of weak light a day.",
        minHeight: "360px",
        showCta: true,
        ctaText: "Shop plants & pots",
        ctaUrl: "/",
      }),
      section({ paddingTop: "28px", paddingBottom: "12px" }, [tocPanel("In this guide", STYLE.home)]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("What \"low light\" really means", 2),
        rich([
          "Low light is not no light. If you can read a paperback comfortably at midday without a lamp, that's low light and the plants below will be fine. If you can't, you need a grow light, not a hardier plant.",
          "The other half of the problem is water. In a dim room a plant drinks far less, and nearly every houseplant that dies in one is drowned rather than starved.",
        ]),
        image("Wall of plants"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("The six we'd buy again", 2),
        columns(2, [
          [
            heading("Snake plant", 3),
            rich(["Nearly unkillable, tolerates a fortnight of neglect, and the upright shape suits a narrow corner."]),
            heading("ZZ plant", 3),
            rich(["Waxy leaves that shrug off dry air. Water it once a month and it will outlive the sofa."]),
            heading("Pothos", 3),
            rich(["The fastest grower here. Trail it from a shelf and cut it back twice a year."]),
          ],
          [
            heading("Cast iron plant", 3),
            rich(["Named for a reason. Slow, unfussy, and happy in the darkest corner you have."]),
            heading("Peace lily", 3),
            rich(["The only one here that flowers in low light, and it wilts dramatically to tell you it's thirsty."]),
            heading("Chinese evergreen", 3),
            rich(["Patterned leaves that hold their colour without direct sun. Keep it above 15°C."]),
          ],
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Water and light at a glance", 2),
        table(4, 4, [
          ["Plant", "Water", "Min. light", "Pet safe"],
          ["Snake plant", "Every 3–4 weeks", "Very low", "No"],
          ["Pothos", "Every 1–2 weeks", "Low", "No"],
          ["Peace lily", "Weekly", "Low–medium", "No"],
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("The one mistake to avoid", 2),
        callout({
          type: "warning",
          title: "Don't water on a schedule",
          body: "Push a finger two inches into the soil. Damp means wait, whatever the calendar says — in a dim room that can be three weeks between drinks.",
          emoji: "🪴",
        }),
        image("Cosy living room with a window"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Shop the setup", 2),
        productGrid({ columns: 3 }),
      ]),
    ]),
  },
  {
    key: "food-recipe-feature",
    name: "Food: Recipe Feature",
    description: "A magazine-style recipe feature — method, variations, and shoppable ingredients.",
    category: "Industry",
    badge: "New",
    style: STYLE.food,
    preview: { hero: "image", toc: true, columns: 1, products: 3, steps: 4 },
    blocks: withStyle(STYLE.food, () => [
      hero({
        heading: "Heavenly Cinnamon Rolls: One Dough, Four Ways",
        subheading: "A tested overnight recipe — plus the three variations our bakery sells out of first.",
        minHeight: "380px",
        showCta: true,
        ctaText: "Shop the baking kit",
        ctaUrl: "/",
      }),
      section({ paddingTop: "28px", paddingBottom: "12px" }, [tocPanel("The recipe", STYLE.food)]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Why this dough", 2),
        rich([
          "It's an enriched tangzhong dough: a spoonful of flour cooked into milk before mixing. That paste holds water through the bake, which is why these are still soft on day three when a standard roll has gone dry by lunchtime.",
          "Active time is about 40 minutes. The rest is the fridge doing the work overnight.",
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Ingredients", 2),
        rich([
          "Dough: 500 g strong white flour · 300 ml whole milk · 7 g instant yeast · 60 g caster sugar · 1 egg · 60 g soft butter · 8 g salt.",
          "Filling: 120 g soft butter · 150 g dark brown sugar · 2 tbsp ground Ceylon cinnamon · pinch of salt.",
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Step 1: Make the tangzhong", 2),
        rich([
          "Whisk 25 g of the flour into 125 ml of the milk over a low heat until it thickens to a loose paste, about two minutes. Cool it to room temperature before it goes anywhere near the yeast.",
        ]),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("Step 2: Mix and knead", 2),
        rich([
          "Everything except the butter into the bowl, mix to a shaggy dough, then add the butter a knob at a time. Knead 8 minutes in a mixer or 12 by hand — you want it to pull cleanly off the side and pass a windowpane test.",
        ]),
        image("Dough ready to roll"),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("Step 3: Fill, roll, chill", 2),
        rich([
          "Roll to a 40 × 30 cm rectangle, spread the filling to the edges, and roll from the long side so you get twelve turns rather than six. Cut with floss, not a knife, and rest them in the tin overnight in the fridge.",
        ]),
        image("Cracking an egg for the dough"),
      ]),
      section({ paddingTop: "0px", paddingBottom: "16px" }, [
        heading("Step 4: Bake at 180°C", 2),
        rich([
          "Straight from the fridge to a warm spot for 45 minutes, until they're touching and puffy. Bake 22–25 minutes; pull them at 88°C in the centre roll. Glaze while warm, not hot, or it slides off.",
        ]),
        image("Fresh pastries"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Three variations", 2),
        columns(3, [
          [heading("Cardamom", 3), rich(["Swap half the cinnamon for freshly ground cardamom. The Scandinavian version, and our best seller."])],
          [heading("Brown butter pecan", 3), rich(["Brown the filling butter and fold in 80 g toasted pecans."])],
          [heading("Orange & maple", 3), rich(["Zest of two oranges in the filling, maple in the glaze instead of icing sugar."])],
        ]),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("Shop the ingredients", 2),
        productGrid({ columns: 3 }),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        faq("Recipe questions", [
          faqItem("Can I make them same-day?", "Yes — prove at room temperature for 90 minutes instead of overnight. The flavour is slightly flatter but the texture holds."),
          faqItem("Can I freeze them?", "Freeze after shaping, before proving. Move to the fridge the night before you want to bake."),
        ]),
      ]),
    ]),
  },
  {
    key: "classic-christmas",
    name: "Classic Christmas",
    description: "A festive, written gift guide for the holiday rush — six picks, wrapped in seasonal photography.",
    category: "Seasonal",
    badge: "New",
    style: STYLE.christmas,
    preview: { hero: "image", toc: true, columns: 1, products: 4, steps: 0 },
    blocks: withStyle(STYLE.christmas, () => [
      hero({
        heading: "The 2026 Holiday Gift Guide: 6 Timeless & Elegant Presents",
        subheading: "Everything here arrives before the 24th, wraps well, and nobody already owns.",
        minHeight: "380px",
        showCta: true,
        ctaText: "Shop the guide",
        ctaUrl: "/",
      }),
      section({ paddingTop: "28px", paddingBottom: "12px" }, [tocPanel("Shop the guide", STYLE.christmas)]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("How we chose these six", 2),
        rich([
          "Three rules. It has to survive being unwrapped in front of an audience, it has to work for someone whose taste you only half know, and it has to cost under $50 without looking like it.",
          "Order dates are at the bottom — the short version is that the 18th is the last safe standard shipping day.",
        ]),
        image("Christmas gift box"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "24px" }, [
        heading("The six picks", 2),
        rich([
          "A candle that smells like a real fir rather than a car freshener, a teapot that goes from the hob to the table, a soap trio for the person with a spare-room drawer of toiletries, and a mini candle set to break up for stocking fillers.",
        ]),
        productGrid({ columns: 4 }),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Make it look expensive", 2),
        rich([
          "Kraft paper, one colour of ribbon, and a sprig of something green from the garden. It costs almost nothing and photographs better than any printed foil wrap.",
        ]),
        image("Holiday gift wrapping"),
      ]),
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Order by these dates", 2),
        table(4, 3, [
          ["Shipping", "Order by", "Arrives"],
          ["Standard", "Dec 18", "Dec 23"],
          ["Express", "Dec 21", "Dec 24"],
          ["Local pickup", "Dec 23", "Same day"],
        ]),
      ]),
      section({ backgroundColor: cur().deep, paddingTop: "32px", paddingBottom: "32px", borderRadius: "12px" }, [
        heading("Still stuck? Send a gift card", 2, { align: "center", color: "#ffffff" }),
        rich(["Delivered by email in minutes, which makes it the only present on this page you can buy on the 24th."], { color: "#ffffff" }),
        button("Shop gift cards", { url: "/products/gift-card" }),
      ]),
    ]),
  },
];

const FREE_TEMPLATE_KEYS = new Set(["how-to-guide", "faq-support-article", "buying-guide"]);

export function isTemplateFree(key) {
  return FREE_TEMPLATE_KEYS.has(key);
}

export function getBlogTemplateSummaries() {
  return BLOG_TEMPLATES.map(({ key, name, description, category, badge, style, preview, blocks }) => ({
    key,
    name,
    description,
    category,
    badge: badge || null,
    accent: style?.accent || "#303030",
    style: style || {},
    preview: preview || {},
    // Same block tree the editor applies — gallery preview compiles this AST,
    // so the card matches the article the merchant gets.
    blocks: blocks || [],
    tier: FREE_TEMPLATE_KEYS.has(key) ? "free" : "paid",
  }));
}

export function getBlogTemplateByKey(key) {
  return BLOG_TEMPLATES.find((t) => t.key === key) || null;
}

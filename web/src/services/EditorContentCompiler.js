import * as cheerio from "cheerio";
import shopify, { prisma } from "../../shopify.js";
import { formatPrice } from "../utils/priceUtils.js";
import ThemeStyleService from "./ThemeStyleService.js";
import { isFeatureEnabled } from "./PlanFeatureService.js";

// The app's own public base URL — HOST already includes the protocol (e.g.
// "https://xxx.trycloudflare.com" in dev, the real production domain in prod). This is the
// actual configured variable (confirmed via .env and vite.config.js); ArticleSyncService.js's
// tracking-pixel injection checks APP_URL/SHOPIFY_APP_HOST instead, which aren't set in this
// environment and silently fall back to "https://localhost:3000" — unreachable from a real
// storefront visitor's browser. Not fixed here since it's a separate, pre-existing bug in a
// different feature (view tracking), out of scope for this change.
const APP_URL = process.env.HOST || process.env.APP_URL || `https://${process.env.SHOPIFY_APP_HOST || "localhost:3000"}`;

/** A `data-settings` attribute value can itself contain further nested "settings" keys from
 * historical corruption (each sync/echo/reconcile round trip used to add another wrapper layer
 * before this was fixed — see the docblock at the compile() call site). Recursively unwrap
 * before merging so legacy multi-layer content compiles correctly, not just single-wrapped
 * content going forward. */
function unwrapNestedSettings(val) {
  let current = val;
  while (current && typeof current === "object" && !Array.isArray(current) && current.settings && typeof current.settings === "object" && !Array.isArray(current.settings)) {
    current = current.settings;
  }
  return current;
}

// In-memory cache for store currency (per compile run)
let _storeCurrency = null;

// Mirrors frontend/utils/headingSlugUtils.js's slugifyHeading exactly — kept as a local copy
// (rather than importing across the frontend/src boundary) since this is the only piece needed
// server-side: computing the same deterministic anchor id a Heading block would get so
// TableOfContents links resolve, and RichText id injection isn't needed here.
function slugifyHeadingServer(text) {
  if (!text || typeof text !== "string") return "heading";
  const clean = text.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  if (!clean) return "heading";
  const slug = clean
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "heading";
}

// Mirrors compileBlocksToHtml.js's VISIBILITY_CSS/applyVisibilityWrapper — the client-side
// editor preview already supports hideOnMobile/hideOnTablet/hideOnDesktop block settings, but
// this server-side compiler (the one that actually produces the published storefront HTML) had
// no equivalent, so hide-on-device silently did nothing on the real page regardless of plan.
const VISIBILITY_CSS = `<style>
  @media (max-width: 767px)  { .builder-hide-mobile  { display: none !important; } }
  @media (min-width: 768px) and (max-width: 1023px) { .builder-hide-tablet  { display: none !important; } }
  @media (min-width: 1024px) { .builder-hide-desktop { display: none !important; } }
</style>`;

function applyVisibilityWrapperServer(html, attrs) {
  if (!html) return html;
  const classes = [];
  if (attrs.hideOnMobile) classes.push("builder-hide-mobile");
  if (attrs.hideOnTablet) classes.push("builder-hide-tablet");
  if (attrs.hideOnDesktop) classes.push("builder-hide-desktop");
  if (classes.length === 0) return html;
  return `<div class="${classes.join(" ")}">${html}</div>`;
}

async function fetchStoreCurrency(shopifyClient) {
  if (_storeCurrency) return _storeCurrency;
  if (!shopifyClient) return "USD";
  try {
    const result = await shopifyClient.request(`
      query GetShopCurrency {
        shop { currencyCode }
      }
    `);
    _storeCurrency = result.data?.shop?.currencyCode || "USD";
    return _storeCurrency;
  } catch {
    return "USD";
  }
}

/**
 * Resolve the currency to use for a product.
 * @param {Object} product - Product object (may have .currency)
 * @param {string} defaultCurrency - Fallback store currency
 */
function resolveCurrency(product, defaultCurrency) {
  return product?.currency || defaultCurrency || "USD";
}

const ATTR_MAP = {
  buttontext: 'buttonText',
  buttoncolor: 'buttonColor',
  imagesize: 'imageSize',
  showprice: 'showPrice',
  showdescription: 'showDescription',
  showbadge: 'showBadge',
  product: 'product',
  layout: 'layout',
  version: 'version',
  title: 'title',
  columns: 'columns',
  maxproducts: 'maxProducts',
  cardstyle: 'cardStyle',
  gap: 'gap',
  showbutton: 'showButton',
  manualproducts: 'manualProducts',
  searchquery: 'searchQuery',
  collection: 'collection',
  limit: 'limit',
  text: 'text',
  url: 'url',
  align: 'align',
  color: 'color',
  textcolor: 'textColor',
  size: 'size',
  borderradius: 'borderRadius',
  subheading: 'subheading',
  backgroundimage: 'backgroundImage',
  backgroundoverlay: 'backgroundOverlay',
  overlaycolor: 'overlayColor',
  overlayopacity: 'overlayOpacity',
  showcta: 'showCta',
  ctatext: 'ctaText',
  ctaurl: 'ctaUrl',
  ctacolor: 'ctaColor',
  ctatextcolor: 'ctaTextColor',
  aspectratio: 'aspectRatio',
  maxwidth: 'maxWidth',
  thickness: 'thickness',
  margin: 'margin',
  style: 'style',
  caption: 'caption',
  collectionhandle: 'collectionHandle',
  showtitle: 'showTitle',
  showviewall: 'showViewAll',
  linkurl: 'linkUrl',
  minheight: 'minHeight',
  titlealign: 'titleAlign',
  imageurl: 'imageUrl',
  compareatprice: 'compareAtPrice',
  productid: 'productId',
  showimage: 'showImage',
  bordercolor: 'borderColor',
  backgroundcolor: 'backgroundColor',
  items: 'items',
  accentcolor: 'accentColor',
  firstopen: 'firstOpen',
  enableschema: 'enableSchema',
};

function hexToRgba(hex, opacity) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "#000000");
  if (!result) return `rgba(0,0,0,${opacity})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

function getEmbedUrl(url) {
  if (!url) return "";
  let match = url.match(/(?:youtube\.com\/(?:shorts\/|[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (match && match[1]) {
    return `https://www.youtube.com/embed/${match[1]}`;
  }
  match = url.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)(?:$|\/|\?)/i);
  if (match && match[3]) {
    return `https://player.vimeo.com/video/${match[3]}`;
  }
  match = url.match(/loom\.com\/(?:share|embed)\/([a-f0-9]{32})/i);
  if (match && match[1]) {
    return `https://www.loom.com/embed/${match[1]}`;
  }
  return url;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The chosen blog font is only useful if it's actually loaded on the page — merely setting
 * `font-family: 'Poppins'` in CSS does nothing unless that font happens to already be present
 * (e.g. the merchant's theme coincidentally loads it for its own use). This works for ANY
 * theme/store by requesting the font directly from Google Fonts. Generic on purpose: every
 * entry in the Settings page's FONT_OPTIONS list is a real Google Fonts family name wrapped in
 * single quotes (e.g. `'Poppins', sans-serif`) — extracting that name means new fonts added to
 * that list later get loading support automatically, no hardcoded per-font map to keep in sync.
 * "System Default" (system-ui) and any value not matching the quoted-name convention are
 * intentionally skipped — nothing to fetch for a system font stack.
 */
function buildGoogleFontsLinkTag(fontFamilyValue) {
  if (!fontFamilyValue || fontFamilyValue === "system-ui") return "";
  const match = /^'([^']+)'/.exec(String(fontFamilyValue).trim());
  if (!match) return "";
  const familyParam = match[1].trim().replace(/\s+/g, "+");
  if (!familyParam) return "";
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${familyParam}:wght@400;600;700&display=swap">`;
}

// Extracts and maps a div[data-type] element's data-* attributes into a plain settings object.
// Factored out of compile()'s main loop so the heading pre-pass (needed for TableOfContents
// anchor ids) can read the same attrs a Heading div will compile with, without duplicating the
// legacy-flat-vs-kebab-case attribute mapping logic.
function extractAttrs(el) {
  const attrs = {};
  for (const [attrName, attrVal] of Object.entries(el.attribs)) {
    if (attrName.startsWith("data-") && attrName !== "data-type") {
      const nameWithoutData = attrName.slice(5);
      const mappedKey =
        ATTR_MAP[nameWithoutData] ||
        nameWithoutData.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

      let val = attrVal;
      if (val === "true") {
        val = true;
      } else if (val === "false") {
        val = false;
      } else if (val && (val.startsWith("{") || val.startsWith("["))) {
        try {
          val = JSON.parse(val);
        } catch (e) {
          // keep as string
        }
      }
      if (mappedKey === "settings" && val && typeof val === "object" && !Array.isArray(val)) {
        Object.assign(attrs, unwrapNestedSettings(val));
      } else {
        attrs[mappedKey] = val;
      }
    }
  }
  return attrs;
}

export class EditorContentCompiler {
  /**
   * Compiles the raw contentHtml with tiptap block wrappers into fully styled storefront HTML.
   *
   * @param {string} contentHtml Raw HTML from the editor
   * @param {object} [shopifySession] Shopify session for GraphQL queries (optional)
   * @param {object} [shopifyClient] Instantiated GraphQL client (optional)
   * @returns {Promise<string>} Storefront compiled HTML
   */
  static async compile(contentHtml, shopifySession = null, shopifyClient = null, planKey = null) {
    if (!contentHtml) return "";

    // planKey null (no shop context resolved, e.g. an editor session with no domain) is treated
    // as "free" by isFeatureEnabled — the safe default for every gate below, never "everything
    // enabled".
    const deviceVisibilityEntitled = isFeatureEnabled(planKey, "device_visibility");
    const tocEntitled = isFeatureEnabled(planKey, "toc");
    const faqEntitled = isFeatureEnabled(planKey, "faq");
    const productEntitled = isFeatureEnabled(planKey, "product");
    const productSidebarEntitled = isFeatureEnabled(planKey, "product_sidebar");
    const featuredProductEntitled = isFeatureEnabled(planKey, "featured_product");
    const productSwitcherEntitled = isFeatureEnabled(planKey, "product_switcher");
    const productSliderEntitled = isFeatureEnabled(planKey, "product_slider");

    // Reset and fetch store currency for this compile run
    _storeCurrency = null;
    const storeCurrency = await fetchStoreCurrency(shopifyClient);

    const $ = cheerio.load(contentHtml, null, false);
    const divs = $("div[data-type]");

    // Pre-pass: collect Heading-block anchor ids in document order, matching
    // slugifyHeadingServer/dedup rules exactly, so TableOfContents (processed as just another
    // div[data-type] in this same walk, in arbitrary order relative to its target headings) can
    // link to them, and so the Heading case below can inject the same id onto the real <h#> tag.
    const allHeadings = [];
    const slugCounts = {};
    for (let i = 0; i < divs.length; i++) {
      const $el = $(divs[i]);
      if ($el.attr("data-type") !== "Heading") continue;
      const hAttrs = extractAttrs(divs[i]);
      const level = Number(hAttrs.level || 2);
      const text = String(hAttrs.text || "").replace(/<[^>]*>/g, "").trim();
      if (!text) continue;
      const baseSlug = slugifyHeadingServer(text);
      slugCounts[baseSlug] = (slugCounts[baseSlug] || 0) + 1;
      const id = slugCounts[baseSlug] === 1 ? baseSlug : `${baseSlug}-${slugCounts[baseSlug] - 1}`;
      allHeadings.push({ id, text, level });
    }
    let _headingCursor = 0;
    let usedVisibilityCss = false;

    for (let i = 0; i < divs.length; i++) {
      const el = divs[i];
      const $el = $(el);
      const type = $el.attr("data-type");

      // Extract and map all data- attributes
      const attrs = extractAttrs(el);

      // Pass store currency to each block
      attrs._storeCurrency = storeCurrency;

      // Compile content based on block type. null = leave element untouched;
      // rewriting unhandled containers ($el.html($el.html())) would re-parse
      // their children and detach any nested block still waiting in `divs`.
      let compiledHtml = null;
      try {
        switch (type) {
          // NOTE: this loop only iterates div[data-type] elements (see `divs`
          // above). The current DividerBlock node (nodes/DividerBlock/DividerBlock.js)
          // renders an <hr data-type="dividerBlock">, not a <div>, so this case
          // is unreachable for new content — it only fires for the legacy
          // div-based markup produced by the old createBlockExtension-based
          // DividerExtension. Keep it for backward compatibility with old
          // articles; don't assume it's exercised by newly inserted dividers.
          case "dividerBlock":
          case "Divider":
            compiledHtml = this.renderDivider(attrs);
            break;
          case "spacerBlock":
          case "Spacer":
            compiledHtml = this.renderSpacer(attrs);
            break;
          // Heading/RichText/plain Image/Callout/Table have no case here historically —
          // any content compiled through this path (e.g. contentHtml reconstructed by
          // ShopifyArticleParser._blockToDataHtml during a webhook echo/reconcile cycle)
          // silently fell to `default: leave untouched`, meaning these divs never became
          // real visible HTML — a post's headings/paragraphs/images could go invisible on
          // the storefront with no error anywhere. Added to match compileBlocksToHtml.js's
          // (the primary, client-side compiler's) rendering exactly.
          case "Heading": {
            // Consumes allHeadings in the same document-order sequence the pre-pass built it in,
            // so the anchor id matches exactly what TableOfContents links to below.
            const headingEntry = allHeadings[_headingCursor];
            _headingCursor++;
            compiledHtml = this.renderHeading(attrs, headingEntry?.id);
            break;
          }
          case "TableOfContents":
            // toc is a Starter+ gate. Nothing previously enforced it — the block was fully
            // ungated in practice despite PLAN_DEFAULTS recording Free as false — so a Free shop
            // that inserted one would silently keep getting it rendered forever. Render as empty
            // rather than leaving the div untouched, so it's actually gone from the output.
            compiledHtml = tocEntitled ? this.renderTableOfContents(attrs, allHeadings) : "";
            break;
          case "HeroSection":
            compiledHtml = this.renderHero(attrs);
            break;
          case "ButtonBlock":
            compiledHtml = this.renderButtonBlock(attrs);
            break;
          case "Html":
            compiledHtml = attrs.code || "";
            break;
          case "RichText":
            compiledHtml = this.renderRichText(attrs);
            break;
          case "Callout":
            compiledHtml = this.renderCalloutBlock(attrs);
            break;
          case "Table":
            compiledHtml = this.renderTableBlock(attrs);
            break;
          case "videoBlock":
          case "VideoBlock":
          case "VideoEmbed":
            compiledHtml = this.renderVideo(attrs);
            break;
          case "heroBlock":
            compiledHtml = this.renderHero(attrs);
            break;
          case "ctaButton":
            compiledHtml = this.renderCtaButton(attrs);
            break;
          // product/product_sidebar/featured_product/product_switcher/product_slider are all
          // Starter+ gates (unified single unlock, per PLAN_DEFAULTS). Previously fully ungated
          // in practice — a Free shop that inserted a product block via the editor kept getting
          // it rendered on the real page forever. Rendered as empty rather than left untouched
          // so an unentitled block is actually gone from the output, matching the toc posture.
          case "buyButton":
          case "BuyButton":
          case "product":
          case "Product":
            compiledHtml = productEntitled ? this.renderBuyButton(attrs) : "";
            break;
          case "product_sidebar":
          case "ProductSidebar":
            compiledHtml = productSidebarEntitled ? this.renderBuyButton(attrs) : "";
            break;
          case "featured_product":
          case "FeaturedProduct":
            compiledHtml = featuredProductEntitled ? this.renderBuyButton(attrs) : "";
            break;
          case "productGrid":
          case "ProductGrid":
          case "product_switcher":
          case "ProductSwitcher":
            compiledHtml = productSwitcherEntitled ? await this.renderProductGrid(attrs, shopifySession, shopifyClient) : "";
            break;
          case "product_slider":
          case "ProductSlider":
            compiledHtml = productSliderEntitled ? await this.renderProductSlider(attrs, shopifySession, shopifyClient) : "";
            break;
          case "collection":
          case "Collection":
            compiledHtml = await this.renderCollection(attrs, shopifySession, shopifyClient);
            break;
          // Same caveat as dividerBlock above: the current ImageBlock node
          // (nodes/ImageBlock/ImageBlock.js) renders a <figure data-type="imageBlock">,
          // not a <div>, so this case only fires for legacy div-based image
          // markup — new Image Blocks pass through untouched via the default
          // case below and are already fully self-contained (including the
          // real rich-text caption, which this function has no access to).
          case "imageBlock":
          case "ImageBlock":
          case "Image":
            compiledHtml = this.renderImage(attrs);
            break;
          case "productCard":
          case "ProductCard":
            compiledHtml = this.renderProductCard(attrs);
            break;
          case "htmlBlock":
          case "HtmlBlock":
            compiledHtml = this.renderHtmlBlock(attrs);
            break;
          case "videoEmbedBlock":
          case "VideoEmbedBlock":
            compiledHtml = this.renderVideoEmbed(attrs);
            break;
          case "faqBlock":
          case "FaqBlock":
          case "faq":
          case "FAQ":
            compiledHtml = faqEntitled ? this.renderFaqBlock(attrs) : "";
            break;
          default:
            // Unsupported/container types (columnLayout, column, calloutBlock,
            // buttonBlock, ...) already carry inline-styled markup — keep as-is
            break;
        }
      } catch (err) {
        console.error(`Error compiling block of type ${type}:`, err);
        compiledHtml = `<div style="padding: 16px; border: 1px dashed red; color: red;">Error rendering section: ${type}</div>`;
      }

      // device_visibility is a Pro-tier gate (see PlanFeatureService PLAN_DEFAULTS) — a shop
      // not entitled to it can still set hideOnMobile/hideOnDesktop in the editor (the settings
      // panel UI itself doesn't block it either), but those flags are silently ignored here on
      // the real published page, same posture as other feature gates that reject/ignore rather
      // than error on save.
      if (compiledHtml && deviceVisibilityEntitled && (attrs.hideOnMobile || attrs.hideOnTablet || attrs.hideOnDesktop)) {
        compiledHtml = applyVisibilityWrapperServer(compiledHtml, attrs);
        usedVisibilityCss = true;
      }

      // Replace the wrapper div with the fully compiled block HTML to prevent double borders.
      // Always re-wrap the compiled output in a fresh div carrying the original data-type/data-*
      // identity attributes — otherwise this server-side re-render silently strips the markers
      // that let a later Shopify webhook echo (ShopifyArticleParser) recognize the block and
      // reconstruct it losslessly, instead of falling back to guessing structure from CSS
      // classes (which breaks apart compound blocks like ProductSlider into raw Image/Text/
      // Button primitives once that guess fails). Wrapping unconditionally — rather than tagging
      // just the compiled HTML's first element — also covers render functions that return more
      // than one top-level element (e.g. renderVideo's iframe + separate caption div), so the
      // whole block round-trips as one unit no matter its internal shape. Reconstruction reads
      // settings entirely from these data-* attributes (see ShopifyArticleParser._convertDataBlock),
      // never from the wrapped markup itself, so the extra wrapper never affects re-editing.
      if (compiledHtml !== null) {
        const identityAttrs = [`data-type="${escapeHtml(type)}"`];
        for (const [attrName, attrVal] of Object.entries(el.attribs)) {
          if (attrName.startsWith("data-") && attrName !== "data-type") {
            identityAttrs.push(`${attrName}="${escapeHtml(attrVal)}"`);
          }
        }
        $el.replaceWith(`<div ${identityAttrs.join(" ")}>${compiledHtml}</div>`);
      }
    }

    return (usedVisibilityCss ? VISIBILITY_CSS : "") + $.html();
  }

  static renderDivider(attrs) {
    const style = attrs.style || "solid";
    const thickness = attrs.thickness || "1px";
    const color = attrs.color || "#e1e3e5";
    const margin = attrs.margin || "20px";
    return `<div style="padding: 8px 0; margin: ${margin} 0;">` +
      `<hr style="border: none; border-top: ${thickness} ${style} ${color}; margin: 0;" />` +
      `</div>`;
  }

  static renderSpacer(attrs) {
    const height = attrs.height || "40px";
    return `<div style="height: ${height};"></div>`;
  }

  // Mirrors compileBlocksToHtml.js's "Heading" case for visual consistency between the two
  // compilers.
  static renderHeading(attrs, anchorId) {
    const level = attrs.level || 2;
    const align = attrs.align || "left";
    const color = attrs.color || "#202223";
    const text = attrs.text || "";
    const fontSize = attrs.fontSize ? `font-size: ${attrs.fontSize};` : "";
    const idAttr = anchorId ? ` id="${anchorId}"` : "";
    return `<h${level}${idAttr} class="builder-heading-block" style="text-align: ${align}; color: ${color}; ${fontSize} margin: 16px 0 8px;">${text}</h${level}>`;
  }

  // Mirrors compileBlocksToHtml.js's "TableOfContents" case (non-collapsible list only — the
  // reconcile-echo path this serves has no client-side JS runtime to power the collapsible
  // <details> chevron interaction, so it always renders the plain list variant).
  static renderTableOfContents(attrs, allHeadings) {
    const title = attrs.title || "Table of Contents";
    const levels = attrs.levels || [2, 3];
    const listStyle = attrs.listStyle || "bullet";
    const textColor = attrs.textColor || "#202223";

    const allowedLevels = new Set((Array.isArray(levels) ? levels : [levels]).map(Number));
    const matching = (allHeadings || []).filter((h) => allowedLevels.has(h.level));
    if (matching.length === 0) return "";

    const minLevel = Math.min(...matching.map((h) => h.level));
    const Tag = listStyle === "numbered" ? "ol" : "ul";
    const listType = listStyle === "numbered" ? "decimal" : "disc";

    const itemsHtml = matching
      .map((h) => {
        const isMain = h.level === minLevel;
        return `<li style="font-size: 14px; margin: 6px 0; display: list-item;"><a href="#${h.id}" style="color: ${textColor}; text-decoration: none; font-weight: ${isMain ? "600" : "400"};">${h.text}</a></li>`;
      })
      .join("\n");

    return `<div class="sp-toc-block" style="padding: 16px 20px; background: #f4f6f8; border: 1px solid #e1e3e5; border-radius: 8px; margin: 16px 0;">
  <div style="font-weight: 700; font-size: 16px; color: ${textColor}; margin-bottom: 12px;">${title}</div>
  <${Tag} style="margin: 0; padding-left: 18px; list-style-type: ${listType};">
${itemsHtml}
  </${Tag}>
</div>`;
  }

  // Mirrors compileBlocksToHtml.js's "ButtonBlock" case exactly (field names differ from the
  // legacy ctaButton/renderCtaButton pair above — backgroundColor/alignment, not color/align).
  static renderButtonBlock(attrs) {
    const text = attrs.text || "Click Here";
    const url = attrs.url || "#";
    const align = attrs.alignment || attrs.align || "center";
    const color = attrs.backgroundColor || attrs.color || "#008060";
    const textColor = attrs.textColor || "#ffffff";
    const br = (attrs.borderRadius !== undefined ? attrs.borderRadius : 4) + "px";
    return `<div class="builder-button-block" style="text-align: ${align}; margin: 16px 0;">
        <a href="${url}" style="display: inline-block; background-color: ${color}; color: ${textColor}; padding: 12px 24px; border-radius: ${br}; font-weight: 600; text-decoration: none;">${text}</a>
      </div>`;
  }

  // Mirrors compileBlocksToHtml.js's "RichText" case. That version also supports a Tiptap
  // JSON document via @tiptap/html's generateHTML() — not reproduced here since every RichText
  // block seen through this path (data-* attributes reconstructed from stored HTML) carries
  // its content as an already-serialized HTML string, never a JSON doc object. If that ever
  // changes, this needs the same generateHTML() call compileBlocksToHtml.js makes.
  static renderRichText(attrs) {
    const content = attrs.content;
    // No data-content attribute means this div's real content is already the client-compiled
    // visible child HTML (compileBlocksToHtml.js never emits data-content — it's in
    // injectBlockIdentity's skipKeys — and instead renders real HTML children directly). That
    // happens on every normal Save/Save & Sync, since this function's caller (compile()) re-wraps
    // every div[data-type] it walks unconditionally when given a non-null return. Returning ""
    // here used to replace that already-correct HTML with an empty wrapper, silently deleting
    // the block's content on every save. Returning null instead leaves the div (and its real
    // children) untouched. Only a genuine data-content attribute (the ShopifyArticleParser
    // echo/reconcile path) should cause this to render anything at all.
    if (!content || typeof content !== "string") return null;
    const cleanText = content.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim();
    const containsMedia = /<(img|iframe|table|video|svg|input|button)/i.test(content);
    if (!cleanText && !containsMedia) return null;
    return `<div class="builder-richtext-wrapper">${content}</div>`;
  }

  // Mirrors compileBlocksToHtml.js's "Callout" case.
  static renderCalloutBlock(attrs) {
    const bg = attrs.backgroundColor || "#fdfbc8";
    const border = attrs.borderColor || "#eab308";
    const emoji = attrs.emoji || "💡";
    const title = attrs.title || "";
    const body = attrs.body || "";
    return `<div class="builder-callout" style="background-color: ${bg}; border-left: 4px solid ${border}; padding: 16px; border-radius: 6px; display: flex; gap: 12px; align-items: center; margin: 16px 0;">
      <span style="font-size: 24px;">${emoji}</span>
      <div>
        <strong style="display: block; margin-bottom: 4px; color: #202223;">${title}</strong>
        <span style="color: #4a4a4a;">${body}</span>
      </div>
    </div>`;
  }

  // Mirrors compileBlocksToHtml.js's "Table" case.
  static renderTableBlock(attrs) {
    const data = Array.isArray(attrs.tableData) ? attrs.tableData : [];
    // Same reasoning as renderRichText above: "tableData" is also in injectBlockIdentity's
    // skipKeys, so a client-compiled Table div carries its real <table> as visible child HTML,
    // never a data-table-data attribute. Without attrs.tableData there's nothing to render from
    // here — bail out with null so compile() leaves the existing (correct) table untouched
    // instead of replacing it with an empty one.
    if (data.length === 0) return null;
    const hasHeader = attrs.hasHeader;

    let theadRows = [];
    let tbodyRows = [];
    if (data.length > 0) {
      if (hasHeader) {
        theadRows = [data[0]];
        tbodyRows = data.slice(1);
      } else {
        tbodyRows = data;
      }
    }

    const theadHtml = theadRows.length > 0
      ? `<thead>${theadRows.map((row) => `<tr>${row.map((cell) => `<th style="border: 1px solid #e1e3e5; padding: 8px; background: #f4f6f8; font-weight: 600;">${cell || ""}</th>`).join("")}</tr>`).join("")}</thead>`
      : "";
    const tbodyHtml = `<tbody>${tbodyRows.map((row) => `<tr>${row.map((cell) => `<td style="border: 1px solid #e1e3e5; padding: 8px;">${cell || ""}</td>`).join("")}</tr>`).join("")}</tbody>`;

    return `<div class="builder-table-block" style="margin: 16px 0; overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e1e3e5; text-align: left;">
        ${theadHtml}
        ${tbodyHtml}
      </table>
    </div>`;
  }

  static renderVideo(attrs) {
    const url = attrs.url || "";
    const caption = attrs.caption || "";
    const aspectRatio = attrs.aspectRatio || "56.25%";
    const maxWidth = attrs.maxWidth || "100%";

    if (!url) {
      return `<div style="padding: 24px; text-align: center; border: 1px dashed #e1e3e5; color: #6d7175;">Video URL not provided</div>`;
    }

    const embedUrl = getEmbedUrl(url);
    const iframeHtml = `<iframe src="${embedUrl}" title="${caption || "Video"}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;

    return `<div style="position: relative; padding-bottom: ${aspectRatio}; height: 0; overflow: hidden; max-width: ${maxWidth}; margin: 20px auto;">` +
      iframeHtml +
      `</div>` +
      (caption ? `<div style="text-align: center; font-size: 14px; color: #6d7175; margin-top: 8px;">${caption}</div>` : "");
  }

  static renderHero(attrs) {
    const heading = attrs.heading || "";
    const subheading = attrs.subheading || "";
    const backgroundImage = attrs.backgroundImage || "";
    const backgroundOverlay = attrs.backgroundOverlay !== false;
    const overlayColor = attrs.overlayColor || "#000000";
    const overlayOpacity = parseFloat(attrs.overlayOpacity ?? 0.4);
    const align = attrs.align || "center";
    const minHeight = attrs.minHeight || "400px";
    const textColor = attrs.textColor || "#ffffff";
    const showCta = attrs.showCta !== false;
    const ctaText = attrs.ctaText || "";
    const ctaUrl = attrs.ctaUrl || "/";
    const ctaColor = attrs.ctaColor || "#008060";
    const ctaTextColor = attrs.ctaTextColor || "#ffffff";

    const containerStyle = [
      "position: relative",
      `min-height: ${minHeight}`,
      "display: flex",
      "align-items: center",
      `justify-content: ${align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"}`,
      "border-radius: 8px",
      "overflow: hidden",
      backgroundImage ? "background: transparent" : "background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
      "padding: 40px 32px",
      "box-sizing: border-box",
      "margin: 24px 0"
    ].join("; ");

    let backgroundHtml = "";
    if (backgroundImage) {
      backgroundHtml = `<div style="position: absolute; inset: 0; background-image: url(${backgroundImage}); background-size: cover; background-position: center;"></div>`;
      if (backgroundOverlay) {
        const rgba = hexToRgba(overlayColor, overlayOpacity);
        backgroundHtml += `<div style="position: absolute; inset: 0; background: ${rgba};"></div>`;
      }
    }

    let ctaHtml = "";
    if (showCta && ctaText) {
      const ctaStyle = [
        "display: inline-block",
        "padding: 12px 28px",
        `background: ${ctaColor}`,
        `color: ${ctaTextColor}`,
        "border-radius: 6px",
        "font-weight: 600",
        "font-size: 14px",
        "text-decoration: none",
        "transition: opacity 0.2s",
        "border: none"
      ].join("; ");
      ctaHtml = `<a href="${ctaUrl}" style="${ctaStyle}">${ctaText}</a>`;
    }

    const contentStyle = [
      "position: relative",
      "z-index: 1",
      `text-align: ${align}`,
      "max-width: 600px",
      "width: 100%"
    ].join("; ");

    const headingStyle = `margin: 0 0 12px; font-size: 28px; font-weight: 700; color: ${textColor}; line-height: 1.2;`;
    const subheadingStyle = `margin: 0 0 24px; font-size: 16px; color: ${textColor}; opacity: 0.85; line-height: 1.6;`;

    return `<div style="${containerStyle}">` +
      backgroundHtml +
      `<div style="${contentStyle}">` +
      (heading ? `<h2 style="${headingStyle}">${heading}</h2>` : "") +
      (subheading ? `<p style="${subheadingStyle}">${subheading}</p>` : "") +
      ctaHtml +
      `</div></div>`;
  }

  static renderCtaButton(attrs) {
    const text = attrs.text || "Shop Now";
    const url = attrs.url || "";
    const align = attrs.align || "center";
    const color = attrs.color || "#008060";
    const textColor = attrs.textColor || "#ffffff";
    const size = attrs.size || "medium";
    const borderRadius = attrs.borderRadius || "6px";

    const paddingMap = { small: "8px 16px", medium: "12px 24px", large: "16px 32px" };
    const fontSizeMap = { small: "13px", medium: "15px", large: "18px" };
    const padding = paddingMap[size] || paddingMap.medium;
    const fontSize = fontSizeMap[size] || fontSizeMap.medium;

    const btnStyle = [
      "display: inline-block",
      `padding: ${padding}`,
      `background: ${color}`,
      `color: ${textColor}`,
      `border-radius: ${borderRadius}`,
      "font-weight: 600",
      `font-size: ${fontSize}`,
      "text-decoration: none",
      "transition: opacity 0.2s",
      "border: none"
    ].join("; ");

    const containerStyle = `display: flex; justify-content: ${align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"}; margin: 20px 0;`;

    return `<div style="${containerStyle}"><a href="${url || "#"}" style="${btnStyle}">${text}</a></div>`;
  }

  static renderBuyButton(attrs) {
    const product = attrs.product;
    const layout = attrs.layout || "horizontal";
    const imageSize = attrs.imageSize || "120px";
    const maxWidth = attrs.maxWidth || "320px";
    const showPrice = attrs.showPrice !== false;
    const showDescription = attrs.showDescription === true;
    const showBadge = attrs.showBadge === true;
    const badge = attrs.badge || "FEATURED";
    const buttonText = attrs.buttonText || "Add to Cart";
    const buttonColor = attrs.buttonColor || "#008060";

    if (!product) {
      return `<div style="padding: 24px; text-align: center; border: 1px dashed #e1e3e5; color: #6d7175;">No product selected</div>`;
    }

    const variantIdRaw = product.variantId || "";
    const numericVariantId = variantIdRaw.match(/\d+$/)?.[0] || variantIdRaw;
    const pLink = product.handle ? `/products/${product.handle}` : "#";

    let badgeHtml = "";
    if (showBadge && badge) {
      badgeHtml = `<span style="display: inline-block; padding: 2px 8px; background: #e1e3e5; color: #202223; font-size: 11px; font-weight: 600; border-radius: 4px; margin-bottom: 8px; text-transform: uppercase;">${badge}</span>`;
    }

    const currency = resolveCurrency(product, _storeCurrency);
    let priceHtml = "";
    if (showPrice && product.price) {
      priceHtml = `<div style="font-size: 18px; color: var(--blogger-primary-color, #008060); font-weight: 700; margin-bottom: 12px;">${formatPrice(product.price, currency)}</div>`;
    }

    let descHtml = "";
    if (showDescription && product.description) {
      descHtml = `<p style="font-size: 13px; color: #6d7175; margin: 0 0 12px; line-height: 1.4;">${product.description}</p>`;
    }

    const imageUrl = typeof product.image === 'string' ? product.image : (product.image?.url || product.featuredImage?.url || product.images?.[0]?.originalSrc || product.images?.[0]?.src || "");
    let imgHtml = "";
    if (imageUrl) {
      const escapedTitle = (product.title || "").replace(/"/g, '&quot;');
      imgHtml = `<a href="${pLink}" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; text-decoration:none;"><img src="${imageUrl}" alt="${escapedTitle}" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block; margin: 0 auto;" /></a>`;
    } else {
      imgHtml = `<div style="width: 100%; height: 100%; background: #f4f6f8; display: flex; align-items: center; justify-content: center; font-size: 24px;">🖼</div>`;
    }

    let cardStyle = "";
    if (layout === "horizontal") {
      cardStyle = `display: flex; gap: 16px; align-items: center; border: 1px solid #e1e3e5; border-radius: 8px; padding: 16px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.05); max-width: ${maxWidth || "600px"}; margin: 16px 0; box-sizing: border-box;`;
      return `
        <div style="${cardStyle}">
          <div style="width: ${imageSize}; height: ${imageSize}; flex-shrink: 0; background: #f4f6f8; border-radius: 8px; overflow: hidden; border: 1px solid #f1f2f3; display: flex; align-items: center; justify-content: center;">
            ${imgHtml}
          </div>
          <div style="flex: 1; min-width: 0;">
            ${badgeHtml}
            <h4 style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #202223; line-height: 1.3;">
              <a href="${pLink}" style="color: inherit; text-decoration: none;">${product.title || "Product"}</a>
            </h4>
            ${descHtml}
            ${priceHtml}
            <form action="/cart/add" method="post" enctype="multipart/form-data" style="margin: 0;">
              <input type="hidden" name="id" value="${numericVariantId}" />
              <button type="submit" style="display: inline-block; padding: 8px 16px; background: ${buttonColor}; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; text-align: center; cursor: pointer; width: auto;">
                ${buttonText}
              </button>
            </form>
          </div>
        </div>
      `;
    } else {
      cardStyle = `border: 1px solid #e1e3e5; border-radius: 10px; overflow: hidden; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.05); max-width: ${maxWidth || '320px'}; margin: 20px 0; box-sizing: border-box;`;
      return `
        <div style="${cardStyle}">
          <div style="height: 220px; width: 100%; background: #f4f6f8; border-bottom: 1px solid #e1e3e5; display: flex; align-items: center; justify-content: center; overflow: hidden;">
            ${imgHtml}
          </div>
          <div style="padding: 16px;">
            ${badgeHtml}
            <h4 style="margin: 0 0 6px; font-size: 15px; font-weight: 600; color: #202223; line-height: 1.3;">
              <a href="${pLink}" style="color: inherit; text-decoration: none;">${product.title || "Product"}</a>
            </h4>
            ${descHtml}
            ${priceHtml}
            <form action="/cart/add" method="post" enctype="multipart/form-data" style="margin: 0;">
              <input type="hidden" name="id" value="${numericVariantId}" />
              <button type="submit" style="display: block; width: 100%; padding: 10px 16px; background: ${buttonColor}; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; text-align: center; cursor: pointer;">
                ${buttonText}
              </button>
            </form>
          </div>
        </div>
      `;
    }
  }

  static async renderProductGrid(attrs, shopifySession, shopifyClient) {
    const title = attrs.title || "";
    const titleAlign = attrs.titleAlign || "left";
    const searchQuery = attrs.searchQuery || "";
    const manualProducts = attrs.manualProducts || [];
    const columns = attrs.columns || "3";
    const maxProducts = attrs.maxProducts || "12";
    const cardStyle = attrs.cardStyle || "shadow";
    const gap = attrs.gap || "16px";
    const showPrice = attrs.showPrice !== false;
    const showButton = attrs.showButton !== false;
    const buttonText = attrs.buttonText || "Add to Cart";
    const buttonColor = attrs.buttonColor || "#008060";
    const buttonRadius = attrs.buttonRadius ?? 6;

    let list = [];
    if (manualProducts && manualProducts.length > 0) {
      list = manualProducts;
    } else if (searchQuery && shopifySession && shopifyClient) {
      try {
        const result = await shopifyClient.request(`
          query SearchProducts($query: String!, $first: Int!) {
            products(query: $query, first: $first) {
              edges {
                node {
                  id
                  title
                  handle
                  featuredImage { url }
                  priceRangeV2 { minVariantPrice { amount } }
                  variants(first: 1) {
                    edges { node { id } }
                  }
                }
              }
            }
          }
        `, { variables: { query: searchQuery, first: parseInt(maxProducts) } });
        list = (result.data?.products?.edges || []).map(({ node }) => ({
          shopifyProductId: node.id,
          title: node.title,
          handle: node.handle,
          image: node.featuredImage?.url || null,
          price: node.priceRangeV2?.minVariantPrice?.amount || null,
          variantId: node.variants?.edges?.[0]?.node?.id || null,
        }));
      } catch (e) {
        console.error("Failed to fetch products for search query in EditorContentCompiler:", searchQuery, e);
      }
    }

    if (list.length === 0) {
      return `<div style="padding: 32px 16px; text-align: center; border: 2px dashed #e1e3e5; border-radius: 8px; color: #6d7175;">` +
        `<div style="font-size: 32px; margin-bottom: 8px;">🛍</div>` +
        `<div style="font-size: 14px;">No products to display</div>` +
        `</div>`;
    }

    const cols = parseInt(columns);
    const cardStyles = {
      shadow: "border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; background: #fff;",
      border: "border-radius: 8px; border: 1px solid #e1e3e5; overflow: hidden; background: #fff;",
      minimal: "padding: 4px;"
    };
    const activeStyle = cardStyles[cardStyle] || cardStyles.shadow;

    let headerHtml = "";
    if (title) {
      headerHtml = `<h3 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #202223; text-align: ${titleAlign};">${title}</h3>`;
    }

    let cardsHtml = "";
    list.slice(0, parseInt(maxProducts)).forEach(p => {
      const vIdRaw = p.variantId || "";
      const numericVId = vIdRaw.match(/\d+$/)?.[0] || vIdRaw;
      const pLink = p.handle ? `/products/${p.handle}` : "#";

      const escapedTitle = (p.title || "").replace(/"/g, '&quot;');
      const imageUrl = typeof p.image === 'string' ? p.image : (p.image?.url || p.featuredImage?.url || p.images?.[0]?.originalSrc || p.images?.[0]?.src || "");
      const pImg = imageUrl
        ? `<a href="${pLink}" style="display:flex; align-items:center; justify-content:center; width:100%; height:180px; background:#f8f9fa; border-bottom:1px solid #f1f2f3; overflow:hidden; text-decoration:none;"><img src="${imageUrl}" alt="${escapedTitle}" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block; margin: 0 auto;" /></a>`
        : `<div style="width: 100%; height: 180px; background: #f8f9fa; border-bottom:1px solid #f1f2f3; display: flex; align-items: center; justify-content: center; font-size: 24px;">🖼</div>`;

      const pCurrency = p.currency || _storeCurrency || 'USD';
      const pPrice = (showPrice && p.price)
        ? `<div style="font-size: 14px; color: var(--blogger-primary-color, #008060); font-weight: 700; margin-bottom: 8px;">${formatPrice(p.price, pCurrency)}</div>`
        : "";

      const pBtn = showButton
        ? `<form action="/cart/add" method="post" enctype="multipart/form-data" style="margin: 0;">
            <input type="hidden" name="id" value="${numericVId}" />
            <button type="submit" style="display: block; width: 100%; padding: 8px 12px; background: ${buttonColor}; color: #fff; border: none; border-radius: ${buttonRadius}px; font-size: 13px; font-weight: 600; text-align: center; cursor: pointer;">
              ${buttonText}
            </button>
          </form>`
        : "";

      cardsHtml += `
        <div style="${activeStyle}">
          ${pImg}
          <div style="padding: 12px;">
            <div style="font-size: 14px; font-weight: 600; color: #202223; margin-bottom: 4px; line-height: 1.3;">
              <a href="${pLink}" style="color: inherit; text-decoration: none;">${p.title}</a>
            </div>
            ${pPrice}
            ${pBtn}
          </div>
        </div>
      `;
    });

    const gridStyle = `display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: ${gap}; margin: 24px 0;`;
    return `
      <div style="width: 100%; margin: 24px 0;">
        ${headerHtml}
        <div class="blogger-product-grid" style="${gridStyle}">
          ${cardsHtml}
        </div>
      </div>
    `;
  }

  static async renderProductSlider(attrs, shopifySession, shopifyClient) {
    const title = attrs.title || "";
    const titleAlign = attrs.titleAlign || "left";
    const searchQuery = attrs.searchQuery || "";
    const manualProducts = attrs.manualProducts || [];
    const maxProducts = attrs.maxProducts || "12";
    const cardStyle = attrs.cardStyle || "shadow";
    const gap = attrs.gap || "16px";
    const showPrice = attrs.showPrice !== false;
    const showButton = attrs.showButton !== false;
    const buttonText = attrs.buttonText || "Add to Cart";
    const buttonColor = attrs.buttonColor || "#008060";
    const buttonRadius = attrs.buttonRadius ?? 6;

    let list = [];
    if (manualProducts && manualProducts.length > 0) {
      list = manualProducts;
    } else if (searchQuery && shopifySession && shopifyClient) {
      try {
        const result = await shopifyClient.request(`
          query SearchProducts($query: String!, $first: Int!) {
            products(query: $query, first: $first) {
              edges {
                node {
                  id
                  title
                  handle
                  featuredImage { url }
                  priceRangeV2 { minVariantPrice { amount } }
                  variants(first: 1) {
                    edges { node { id } }
                  }
                }
              }
            }
          }
        `, { variables: { query: searchQuery, first: parseInt(maxProducts) } });
        list = (result.data?.products?.edges || []).map(({ node }) => ({
          shopifyProductId: node.id,
          title: node.title,
          handle: node.handle,
          image: node.featuredImage?.url || null,
          price: node.priceRangeV2?.minVariantPrice?.amount || null,
          variantId: node.variants?.edges?.[0]?.node?.id || null,
        }));
      } catch (e) {
        console.error("Failed to fetch products for search query in EditorContentCompiler slider:", searchQuery, e);
      }
    }

    if (list.length === 0) {
      return `<div style="padding: 32px 16px; text-align: center; border: 2px dashed #e1e3e5; border-radius: 8px; color: #6d7175;">` +
        `<div style="font-size: 32px; margin-bottom: 8px;">🎠</div>` +
        `<div style="font-size: 14px;">No products to display</div>` +
        `</div>`;
    }

    const cardStyles = {
      shadow: "border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; background: #fff;",
      border: "border-radius: 8px; border: 1px solid #e1e3e5; overflow: hidden; background: #fff;",
      minimal: "padding: 4px;"
    };
    const activeStyle = cardStyles[cardStyle] || cardStyles.shadow;

    let headerHtml = "";
    if (title) {
      headerHtml = `<h3 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #202223; text-align: ${titleAlign};">${title}</h3>`;
    }

    let cardsHtml = "";
    list.slice(0, parseInt(maxProducts)).forEach(p => {
      const vIdRaw = p.variantId || "";
      const numericVId = vIdRaw.match(/\d+$/)?.[0] || vIdRaw;
      const pLink = p.handle ? `/products/${p.handle}` : "#";

      const escapedTitle = (p.title || "").replace(/"/g, '&quot;');
      const pImg = p.image
        ? `<a href="${pLink}" style="display:block; text-decoration:none;"><img src="${p.image}" alt="${escapedTitle}" style="width: 100%; aspect-ratio: 1; object-fit: cover; display: block;" /></a>`
        : `<div style="width: 100%; aspect-ratio: 1; background: #f1f2f3; display: flex; align-items: center; justify-content: center; font-size: 24px;">🖼</div>`;

      const pCurrency = p.currency || _storeCurrency || 'USD';
      const pPrice = (showPrice && p.price)
        ? `<div style="font-size: 14px; color: var(--blogger-primary-color, #008060); font-weight: 700; margin-bottom: 8px;">${formatPrice(p.price, pCurrency)}</div>`
        : "";

      const pBtn = showButton
        ? `<form action="/cart/add" method="post" enctype="multipart/form-data" style="margin: 0;">
            <input type="hidden" name="id" value="${numericVId}" />
            <button type="submit" style="display: block; width: 100%; padding: 8px 12px; background: ${buttonColor}; color: #fff; border: none; border-radius: ${buttonRadius}px; font-size: 13px; font-weight: 600; text-align: center; cursor: pointer;">
              ${buttonText}
            </button>
          </form>`
        : "";

      cardsHtml += `
        <div style="flex: 0 0 220px; scroll-snap-align: start; box-sizing: border-box;">
          <div style="${activeStyle}">
            ${pImg}
            <div style="padding: 12px;">
              <div style="font-size: 14px; font-weight: 600; color: #202223; margin-bottom: 4px; line-height: 1.3; height: 36px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                <a href="${pLink}" style="color: inherit; text-decoration: none;">${p.title}</a>
              </div>
              ${pPrice}
              ${pBtn}
            </div>
          </div>
        </div>
      `;
    });

    return `
      <div class="shopify-blog-slider-container" style="position: relative; margin: 24px 0; box-sizing: border-box; width: 100%;">
        ${headerHtml}
        <div style="position: relative; display: flex; align-items: center; width: 100%;">
          <button type="button" 
                  onclick="const container = this.nextElementSibling; container.scrollBy({ left: -container.clientWidth * 0.75, behavior: 'smooth' });"
                  style="position: absolute; left: -15px; top: 50%; transform: translateY(-50%); z-index: 5; width: 36px; height: 36px; border-radius: 50%; border: 1px solid #e1e3e5; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.1); font-size: 20px; font-weight: bold; color: #202223; transition: all 0.2s ease;">
            &lsaquo;
          </button>
          <div style="display: flex; overflow-x: auto; scroll-snap-type: x mandatory; gap: ${gap}; width: 100%; scroll-behavior: smooth; padding: 10px 4px 20px; -ms-overflow-style: none; scrollbar-width: none;"
               class="shopify-blog-product-slider">
            ${cardsHtml}
          </div>
          <button type="button" 
                  onclick="const container = this.previousElementSibling; container.scrollBy({ left: container.clientWidth * 0.75, behavior: 'smooth' });"
                  style="position: absolute; right: -15px; top: 50%; transform: translateY(-50%); z-index: 5; width: 36px; height: 36px; border-radius: 50%; border: 1px solid #e1e3e5; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.1); font-size: 20px; font-weight: bold; color: #202223; transition: all 0.2s ease;">
            &rsaquo;
          </button>
        </div>
        <style>
          .shopify-blog-product-slider::-webkit-scrollbar {
            display: none !important;
          }
        </style>
      </div>
    `;
  }

  static async renderCollection(attrs, shopifySession, shopifyClient) {
    const heading = attrs.heading || "";
    const collectionHandle = attrs.collectionHandle || "";
    const layout = attrs.layout || "grid";
    const columns = attrs.columns || "3";
    const maxProducts = attrs.maxProducts || "8";
    const showTitle = attrs.showTitle !== false;
    const showViewAll = attrs.showViewAll !== false;
    const showPrice = attrs.showPrice !== false;
    const showButton = attrs.showButton !== false;
    const buttonText = attrs.buttonText || "Shop Now";
    const buttonColor = attrs.buttonColor || "#008060";
    const buttonRadius = attrs.buttonRadius ?? 5;

    if (!collectionHandle) {
      return `<div style="padding: 32px 16px; text-align: center; border: 2px dashed #e1e3e5; border-radius: 8px; color: #6d7175;">` +
        `<div style="font-size: 32px; margin-bottom: 8px;">📦</div>` +
        `<div style="font-size: 14px;">Select a collection in the settings panel</div>` +
        `</div>`;
    }

    let collectionTitle = "";
    let list = [];
    if (shopifySession && shopifyClient) {
      try {
        const result = await shopifyClient.request(`
          query GetCollectionProducts($handle: String!, $first: Int!) {
            collectionByHandle(handle: $handle) {
              title
              products(first: $first) {
                edges {
                  node {
                    id
                    title
                    handle
                    featuredImage { url }
                    priceRangeV2 { minVariantPrice { amount } }
                    variants(first: 1) {
                      edges { node { id } }
                    }
                  }
                }
              }
            }
          }
        `, { variables: { handle: collectionHandle, first: parseInt(maxProducts) } });
        const collection = result.data?.collectionByHandle;
        if (collection) {
          collectionTitle = collection.title;
          list = (collection.products?.edges || []).map(({ node }) => ({
            shopifyProductId: node.id,
            title: node.title,
            handle: node.handle,
            image: node.featuredImage?.url || null,
            price: node.priceRangeV2?.minVariantPrice?.amount || null,
            variantId: node.variants?.edges?.[0]?.node?.id || null,
          }));
        }
      } catch (e) {
        console.error("Failed to fetch collection products in EditorContentCompiler:", collectionHandle, e);
      }
    }

    const displayTitle = heading || collectionTitle || "Collection";
    const viewAllLink = `/collections/${collectionHandle}`;

    let headerHtml = "";
    if (showTitle) {
      const viewAllBtn = showViewAll
        ? `<a href="${viewAllLink}" style="font-size: 13px; color: #2c6ecb; font-weight: 500; text-decoration: none; padding: 6px 12px; border: 1px solid #2c6ecb; border-radius: 6px;">View All →</a>`
        : "";
      headerHtml = `
        <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%;">
          <h3 style="margin: 0; font-size: 20px; font-weight: 700; color: #202223;">${displayTitle}</h3>
          ${viewAllBtn}
        </div>
      `;
    }

    const cardStyle = `border: 1px solid #e1e3e5; border-radius: 8px; overflow: hidden; background: #fff; box-sizing: border-box;`;

    let contentHtml = "";
    if (layout === "scroll") {
      const scrollContainerStyle = `display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px; width: 100%;`;
      const cardWrapperStyle = `min-width: 180px; max-width: 200px; flex-shrink: 0;`;
      let scrollCards = "";

      list.forEach(p => {
        const vIdRaw = p.variantId || "";
        const numericVId = vIdRaw.match(/\d+$/)?.[0] || vIdRaw;
        const pLink = p.handle ? `/products/${p.handle}` : "#";

        const escapedTitle = (p.title || "").replace(/"/g, '&quot;');
        const imageUrl = typeof p.image === 'string' ? p.image : (p.image?.url || p.featuredImage?.url || p.images?.[0]?.originalSrc || p.images?.[0]?.src || "");
        const pImg = imageUrl
          ? `<a href="${pLink}" style="display:flex; align-items:center; justify-content:center; width:100%; height:180px; background:#f8f9fa; border-bottom:1px solid #f1f2f3; overflow:hidden; text-decoration:none;"><img src="${imageUrl}" alt="${escapedTitle}" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block; margin: 0 auto;" /></a>`
          : `<div style="width: 100%; height: 180px; background: #f8f9fa; border-bottom:1px solid #f1f2f3; display: flex; align-items: center; justify-content: center; font-size: 24px;">🖼</div>`;

        const pCurrency = p.currency || _storeCurrency || 'USD';
        const pPrice = (showPrice && p.price)
          ? `<div style="font-size: 14px; color: var(--blogger-primary-color, #008060); font-weight: 700; margin-bottom: 6px;">${formatPrice(p.price, pCurrency)}</div>`
          : "";

        const pBtn = showButton
          ? `<form action="/cart/add" method="post" enctype="multipart/form-data" style="margin: 0;">
              <input type="hidden" name="id" value="${numericVId}" />
              <button type="submit" style="display: block; width: 100%; padding: 6px; background: ${buttonColor}; color: #fff; border: none; border-radius: ${buttonRadius}px; font-size: 12px; font-weight: 600; text-align: center; cursor: pointer;">
                ${buttonText}
              </button>
            </form>`
          : "";

        scrollCards += `
          <div style="${cardWrapperStyle}">
            <div style="${cardStyle}">
              ${pImg}
              <div style="padding: 10px;">
                <div style="font-size: 13px; font-weight: 600; color: #202223; margin-bottom: 4px; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                  <a href="${pLink}" style="color: inherit; text-decoration: none;">${p.title}</a>
                </div>
                ${pPrice}
                ${pBtn}
              </div>
            </div>
          </div>
        `;
      });
      contentHtml = `<div style="${scrollContainerStyle}">${scrollCards}</div>`;
    } else {
      const cols = parseInt(columns || "3");
      const gridStyle = `display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 16px; width: 100%;`;
      let cardsHtml = "";

      list.forEach(p => {
        const vIdRaw = p.variantId || "";
        const numericVId = vIdRaw.match(/\d+$/)?.[0] || vIdRaw;
        const pLink = p.handle ? `/products/${p.handle}` : "#";

        const escapedTitle = (p.title || "").replace(/"/g, '&quot;');
        const imageUrl = typeof p.image === 'string' ? p.image : (p.image?.url || p.featuredImage?.url || p.images?.[0]?.originalSrc || p.images?.[0]?.src || "");
        const pImg = imageUrl
          ? `<a href="${pLink}" style="display:flex; align-items:center; justify-content:center; width:100%; height:180px; background:#f8f9fa; border-bottom:1px solid #f1f2f3; overflow:hidden; text-decoration:none;"><img src="${imageUrl}" alt="${escapedTitle}" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block; margin: 0 auto;" /></a>`
          : `<div style="width: 100%; height: 180px; background: #f8f9fa; border-bottom:1px solid #f1f2f3; display: flex; align-items: center; justify-content: center; font-size: 24px;">🖼</div>`;

        const pCurrency = p.currency || _storeCurrency || 'USD';
        const pPrice = (showPrice && p.price)
          ? `<div style="font-size: 14px; color: var(--blogger-primary-color, #008060); font-weight: 700; margin-bottom: 6px;">${formatPrice(p.price, pCurrency)}</div>`
          : "";

        const pBtn = showButton
          ? `<form action="/cart/add" method="post" enctype="multipart/form-data" style="margin: 0;">
              <input type="hidden" name="id" value="${numericVId}" />
              <button type="submit" style="display: block; width: 100%; padding: 6px; background: ${buttonColor}; color: #fff; border: none; border-radius: ${buttonRadius}px; font-size: 12px; font-weight: 600; text-align: center; cursor: pointer;">
                ${buttonText}
              </button>
            </form>`
          : "";

        cardsHtml += `
          <div style="${cardStyle}">
            ${pImg}
            <div style="padding: 10px;">
              <div style="font-size: 13px; font-weight: 600; color: #202223; margin-bottom: 4px; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
                <a href="${pLink}" style="color: inherit; text-decoration: none;">${p.title}</a>
              </div>
              ${pPrice}
              ${pBtn}
            </div>
          </div>
        `;
      });

      contentHtml = `<div class="blogger-product-grid" style="${gridStyle}">${cardsHtml}</div>`;
    }

    return `
      <div style="width: 100%; margin: 24px 0;">
        ${headerHtml}
        ${contentHtml}
      </div>
    `;
  }

  static renderImage(attrs) {
    const src = attrs.src || "";
    const alt = attrs.alt || "";
    const caption = attrs.caption || "";
    const width = attrs.width || "100%";
    const height = attrs.height || "auto";
    const objectFit = attrs.objectFit || "cover";
    const align = attrs.align || "center";
    const borderRadius = attrs.borderRadius || "0px";
    const linkUrl = attrs.linkUrl || "";
    
    const paddingMap = { none: '0', small: '16px', medium: '32px', large: '64px' };
    const padding = paddingMap[attrs.padding || 'none'] || '0';
    
    const shadowMap = { 
      none: 'none', 
      soft: '0 4px 12px rgba(0,0,0,0.1)', 
      medium: '0 8px 24px rgba(0,0,0,0.15)', 
      strong: '0 12px 32px rgba(0,0,0,0.25)' 
    };
    const boxShadow = shadowMap[attrs.dropShadow || 'none'] || 'none';

    if (!src) {
      return `<div style="padding: 24px; text-align: center; border: 1px dashed #e1e3e5; color: #6d7175;">Image not selected</div>`;
    }

    const escapedAlt = (alt || "").replace(/"/g, '&quot;');
    let imgHtml = `<img src="${src}" alt="${escapedAlt}" style="max-width: 100%; width: ${width}; height: ${height}; object-fit: ${objectFit}; display: block; border-radius: ${borderRadius}; box-shadow: ${boxShadow};" />`;
    if (linkUrl) {
      imgHtml = `<a href="${linkUrl}" style="display: block; text-decoration: none;">${imgHtml}</a>`;
    }

    const containerStyle = `display: flex; flex-direction: column; align-items: ${
      align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center"
    }; text-align: ${align}; padding: ${padding}; box-sizing: border-box;`;

    return `<div style="${containerStyle}">
      ${imgHtml}
      ${caption ? `<div style="text-align: center; font-size: 14px; color: #6d7175; margin-top: 8px;">${caption}</div>` : ""}
    </div>`;
  }

  static renderProductCard(attrs) {
    const title = attrs.title || attrs.product?.title || "";
    const price = attrs.price || attrs.product?.price || "";
    const compareAtPrice = attrs.compareAtPrice || attrs.compareatprice || attrs.product?.compareAtPrice || "";
    const imageUrl = attrs.imageUrl || attrs.imageurl || attrs.image || (typeof attrs.featuredImage === 'string' ? attrs.featuredImage : attrs.featuredImage?.url) || attrs.product?.image || attrs.product?.featuredImage?.url || attrs.product?.images?.[0]?.originalSrc || attrs.product?.images?.[0]?.src || "";
    const handle = attrs.handle || attrs.product?.handle || "";
    const buttonText = attrs.buttonText || attrs.buttontext || "Add to Cart";
    const buttonRadius = attrs.buttonRadius ?? 4;
    const buttonColor = attrs.buttonColor || attrs.buttoncolor || "#2d6a4f";
    const showImage = attrs.showImage !== false && attrs.showimage !== false && attrs.showimage !== "false";
    const showPrice = attrs.showPrice !== false && attrs.showprice !== false && attrs.showprice !== "false";
    const showButton = attrs.showButton !== false && attrs.showbutton !== false && attrs.showbutton !== "false";
    const layout = attrs.layout || "vertical";
    const borderRadius = parseInt(attrs.borderRadius || attrs.borderradius) || 8;
    const borderColor = attrs.borderColor || attrs.bordercolor || "#e0e0e0";
    const backgroundColor = attrs.backgroundColor || attrs.backgroundcolor || "#ffffff";

    if (!title) {
      return `<div style="padding: 24px; text-align: center; border: 1px dashed #e1e3e5; color: #6d7175;">Product not selected</div>`;
    }

    const productUrl = handle ? `/products/${encodeURIComponent(handle)}` : "#";
    const isHorizontal = layout === "horizontal";
    const isCompact = layout === "compact";

    let imageHtml = "";
    if (showImage) {
      if (isCompact) {
        if (imageUrl) {
          imageHtml = `<a href="${productUrl}" style="display: block; width: 60px; height: 60px; flex-shrink: 0; margin-right: 12px;"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px; display: block;" /></a>`;
        }
      } else if (isHorizontal) {
        imageHtml = `<a href="${productUrl}" style="display: flex; align-items: center; justify-content: center; width: 30%; min-width: 120px; flex-shrink: 0; background: #f4f6f8; border-right: 1px solid ${borderColor};"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" style="max-width: 100%; max-height: 200px; width: auto; height: auto; object-fit: contain; display: block; margin: 0 auto;" /></a>`;
      } else {
        imageHtml = `<a href="${productUrl}" style="display: flex; align-items: center; justify-content: center; width: 100%; min-height: 160px; max-height: 280px; background: #f4f6f8; border-bottom: 1px solid ${borderColor}; overflow: hidden;">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" style="max-width: 100%; max-height: 280px; width: auto; height: auto; object-fit: contain; display: block; margin: 0 auto;" />` : `<div style="color: #8c9196; font-size: 13px;">No image</div>`}</a>`;
      }
    }

    const currency = attrs.currency || attrs._storeCurrency || "USD";
    const formattedPrice = price ? (String(price).startsWith('$') || String(price).startsWith('₹') ? price : formatPrice(price, currency)) : "";
    const formattedCompareAtPrice = compareAtPrice ? (String(compareAtPrice).startsWith('$') || String(compareAtPrice).startsWith('₹') ? compareAtPrice : formatPrice(compareAtPrice, currency)) : "";
    const priceHtml = showPrice && formattedPrice
      ? `<div style="margin: 0 0 12px 0;"><span style="font-size: 14px; font-weight: 700; color: var(--blogger-primary-color, #008060);">${escapeHtml(formattedPrice)}</span>${formattedCompareAtPrice ? `<span style="text-decoration: line-through; color: #6d7175; margin-left: 8px; font-size: 14px;">${escapeHtml(formattedCompareAtPrice)}</span>` : ""}</div>`
      : "";

    const buttonHtml = showButton
      ? `<a href="${productUrl}" style="display: ${layout === "vertical" ? "block" : "inline-block"}; background: ${buttonColor}; color: #ffffff; text-decoration: none; padding: 8px 16px; border-radius: ${buttonRadius}px; font-weight: 600; text-align: center; margin-top: auto;">${escapeHtml(buttonText)}</a>`
      : "";

    return `
      <div style="display: flex; flex-direction: ${isHorizontal ? "row" : "column"}; height: 100%; flex: 1; ${isCompact ? "align-items: center;" : ""} border: 1px solid ${borderColor}; border-radius: ${borderRadius}px; background: ${backgroundColor}; overflow: hidden; margin: 16px 0; box-sizing: border-box;">
        ${imageHtml}
        <div style="flex: 1; min-width: 200px; padding: 16px; display: flex; flex-direction: column; justify-content: space-between;">
          <div style="flex: 1;">
            <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600;"><a href="${productUrl}" style="color: inherit; text-decoration: none;">${escapeHtml(title)}</a></h3>
            ${priceHtml}
          </div>
          ${buttonHtml}
        </div>
      </div>
    `;
  }

  static renderHtmlBlock(attrs) {
    const raw = attrs.html || "";
    if (!raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch (e) {
      // Malformed escape sequence — treat the stored value as literal HTML
      return raw;
    }
  }

  static renderVideoEmbed(attrs) {
    const url = attrs.url || "";
    if (!url) {
      return `<div style="padding: 24px; text-align: center; border: 1px dashed #e1e3e5; color: #6d7175;">Video URL not provided</div>`;
    }
    const embedUrl = getEmbedUrl(url);
    const paddingBottom = attrs.aspectRatio === "4:3" ? "75%" : "56.25%";
    return `<div style="position: relative; padding-bottom: ${paddingBottom}; height: 0; overflow: hidden; border-radius: 4px; background: #000;">` +
      `<iframe src="${escapeHtml(embedUrl)}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin"></iframe>` +
      `</div>`;
  }

  static generateStyles(settings) {
    return `${buildGoogleFontsLinkTag(settings.fontFamily)}
<style id="blogger-custom-styles">
${this.generateGlobalCss(settings)}
</style>
`;
  }

  /**
   * Raw CSS (no <style> wrapper) for the shop's blog appearance settings. Colors and font are
   * ALWAYS baked in here at sync time — scoped decision: only layout width (§ below) is a live,
   * site-wide setting; colors apply to newly-created blocks via BlockRegistry's theme-color
   * sync (see applyThemeColorDefaults in BlockRegistry.jsx), and font is fetched live from the
   * theme at each sync (see compileForStorefront), but neither is part of the shared
   * `/styles.css` link — this function's output is complete and self-contained per article.
   *
   * `max-width` is the one exception: it's deliberately non-`!important` here so it can never
   * fight the live layout stylesheet (`generateLayoutCss`) once an article links to it — equal
   * specificity + !important always beats non-!important regardless of DOM order, so the live
   * link silently wins over this stale snapshot with no conflict, no flash of wrong width.
   */
  static generateGlobalCss(settings) {
    return `  :root {
    --blogger-primary-color: ${settings.primaryColor || "#008060"};
    --blogger-secondary-color: ${settings.secondaryColor || "#005bd3"};
    --blogger-text-color: ${settings.textColor || "#202223"};
    --blogger-font-family: ${settings.fontFamily || "system-ui"};
    --blogger-layout-width: ${settings.blogLayout === "centered" ? "800px" : settings.blogLayout === "narrow" ? "640px" : "100%"};
  }

  .blogger-article-container {
    max-width: var(--blogger-layout-width);
    margin-left: auto !important;
    margin-right: auto !important;
    font-family: var(--blogger-font-family) !important;
    /* Not !important, deliberately: this sets the base/inherited text color without
       overriding elements that intentionally set their own (buttons, headings with an
       explicit color setting, etc). */
    color: var(--blogger-text-color);
    padding-bottom: 80px !important;
    margin-bottom: 80px !important;
  }

  /* Ensure template article and blog pages have bottom space */
  body.template-article,
  body.template-blog,
  .shopify-section-blog-posts,
  .shopify-section-article {
    padding-bottom: 80px !important;
    margin-bottom: 80px !important;
  }

  /* List styling (bullet lists & numbered lists) */
  .blogger-article-container ul {
    list-style-type: disc !important;
    padding-left: 24px !important;
    margin: 12px 0 !important;
  }

  .blogger-article-container ol {
    list-style-type: decimal !important;
    padding-left: 24px !important;
    margin: 12px 0 !important;
  }

  .blogger-article-container li {
    display: list-item !important;
    margin-bottom: 4px !important;
  }

  .blogger-article-container li > p {
    margin: 0 !important;
    display: inline !important;
  }

  .blogger-primary-btn {
    background-color: var(--blogger-primary-color) !important;
    border-color: var(--blogger-primary-color) !important;
    color: white !important;
    text-decoration: none !important;
    padding: 10px 20px !important;
    border-radius: 4px !important;
    display: inline-block !important;
    text-align: center !important;
  }

  .blogger-secondary-btn {
    background-color: var(--blogger-secondary-color) !important;
    border-color: var(--blogger-secondary-color) !important;
    color: white !important;
    text-decoration: none !important;
    padding: 10px 20px !important;
    border-radius: 4px !important;
    display: inline-block !important;
    text-align: center !important;
  }

  /* Show/hide for .blogger-author / .blogger-published-date / .blogger-reading-time is
     deliberately NOT set here — it's served live from /styles.css (publicStyles.js) instead, so
     toggling those Settings applies to every already-published post on its next storefront view
     instead of requiring a resync (same reasoning as the layout-width link below). */
  .blogger-byline {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin: 0 0 20px;
    font-size: 0.9em;
    color: #6d7175;
  }

  .blogger-related-posts {
    display: ${settings.showRelatedPosts === false || settings.showRelatedPosts === "false" ? "none !important" : "block"};
    margin: 40px 0 0;
    padding-top: 24px;
    border-top: 1px solid #e1e3e5;
  }

  .blogger-related-posts__title {
    font-size: 1.25em;
    font-weight: 600;
    margin: 0 0 16px;
  }

  .blogger-related-posts__grid {
    display: grid;
    /* auto-fit, not auto-fill — auto-fill reserves track space for as many columns as could fit
       even when there are fewer actual items, leaving a phantom empty column and making real
       items narrower than they should be. auto-fit collapses those empty tracks so items stretch
       to fill the row. */
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
  }

  /* Confirmed via live DevTools inspection that the previous "floating white box on hover" was
     not a stray element or theme conflict — it was this exact box-shadow rule, rendering exactly
     as written. It looked wrong because the card had NO visible boundary at rest, so a shadow
     suddenly appearing on hover read as a disconnected glitch rather than a natural lift. Fix is
     a proper resting-state card (background/border/shadow always present) so hover only
     intensifies an already-card-like shape instead of introducing one from nothing. */
  .blogger-related-posts__item {
    display: flex !important;
    flex-direction: column !important;
    text-decoration: none !important;
    color: inherit !important;
    background: #ffffff !important;
    border: 1px solid #e1e3e5 !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04) !important;
    padding: 0 0 12px !important;
    border-radius: 10px;
    overflow: hidden;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .blogger-related-posts__item:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12) !important;
  }

  /* Mixed-aspect-ratio source images (marketing banners, not uniform product shots) can't be
     cropped to a fixed box without losing meaningful content, but plain letterboxing (empty gray
     bars) looks unpolished. Same fix real thumbnail-heavy products use (YouTube/Netflix/Spotify):
     a blurred, scaled-up copy of the SAME image fills the box as a backdrop
     (__image-bg, a sibling — not a wrapper of the sharp image — so filter:blur() doesn't blur
     the sharp image too), with the real image centered on top at full, uncropped size. */
  .blogger-related-posts__image-wrap,
  .blogger-related-posts__image-placeholder {
    /* !important on layout-affecting properties (not just background/color) because a theme's
       own generic div/rte rules were silently overriding this — same class of bug the image's
       object-fit had. Without a forced width/aspect-ratio/display/background, the placeholder
       for image-less posts could collapse to zero height, leaving its title floating with no
       box above it while sibling cards' titles sit below a real image. */
    display: block !important;
    position: relative !important;
    width: 100% !important;
    aspect-ratio: 16 / 9 !important;
    border-radius: 0 !important;
    margin: 0 0 12px !important;
    background: #f1f2f3 !important;
    overflow: hidden !important;
  }

  .blogger-related-posts__image-bg {
    position: absolute !important;
    inset: 0;
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
    filter: blur(18px);
    transform: scale(1.15);
    opacity: 0.55;
  }

  .blogger-related-posts__image {
    /* !important throughout this rule because the theme's own image styling (e.g. Dawn's
       article/rte image rules) can be more specific than this plain class selector and was
       silently overriding it — same reasoning as the color/font rules elsewhere in this
       function. */
    position: relative !important;
    z-index: 1;
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
  }

  .blogger-related-posts__item-title {
    font-size: 0.95em;
    font-weight: 500;
    line-height: 1.4;
    background: transparent !important;
    box-shadow: none !important;
    padding: 0 12px !important;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }


  /* Table styling for Tiptap native tables */
  .blogger-article-container table {
    width: 100%;
    min-width: 480px;
    border-collapse: collapse;
    border: 1px solid #e1e3e5;
    border-radius: 8px;
    background: #fff;
    margin: 16px 0;
    font-size: 14px;
  }

  .blogger-article-container th,
  .blogger-article-container td {
    border: 1px solid #e1e3e5;
    padding: 10px 14px;
    text-align: left;
    vertical-align: top;
    color: #202223;
  }

  .blogger-article-container th {
    background: #f6f6f7;
    font-weight: 700;
  }

  .blogger-article-container tr:nth-child(even) td {
    background: #fafbfc;
  }

  /* Column layout blocks (inline flex styles are the primary mechanism;
     these rules add a fallback and responsive stacking) */
  .blogger-article-container .tiptap-column-layout {
    display: flex;
    gap: 16px;
  }

  .blogger-article-container .tiptap-column {
    min-width: 0;
  }

  @media (max-width: 640px) {
    .blogger-article-container .tiptap-column-layout {
      flex-wrap: wrap !important;
    }
    .blogger-article-container .tiptap-column {
      flex: 1 1 100% !important;
    }
  }

  /* Product Grid / Collection / Product Switcher grids: the inline
     grid-template-columns is set per-block, so it doesn't respond to
     viewport width on its own — collapse it at common breakpoints. */
  @media (max-width: 640px) {
    .blogger-article-container .blogger-product-grid {
      grid-template-columns: repeat(2, 1fr) !important;
    }
  }
  @media (max-width: 420px) {
    .blogger-article-container .blogger-product-grid {
      grid-template-columns: 1fr !important;
    }
  }`;
  }

  /**
   * Raw CSS for the settings that need to be LIVE and site-wide (served from the public
   * `/styles.css` endpoint, linked from every newly-synced article): layout width, plus the
   * byline element toggles (show author / published date / reading time). Colors and font are
   * intentionally NOT part of this shared stylesheet (see generateGlobalCss's docblock for why)
   * — those still bake at sync time. The byline elements themselves (.blogger-author etc.) are
   * always baked into the article HTML (see compileForStorefront); only their visibility lives
   * here, so toggling these Settings applies to every already-published post on its next
   * storefront view instead of requiring a resync.
   */
  static generateLayoutCss(settings, { important = true } = {}) {
    const bang = important ? " !important" : "";
    const layoutWidth = settings.blogLayout === "centered" ? "800px" : settings.blogLayout === "narrow" ? "640px" : "100%";
    const isOff = (v) => v === false || v === "false";
    return `  :root {
    --blogger-layout-width: ${layoutWidth};
  }

  .blogger-article-container {
    max-width: var(--blogger-layout-width)${bang};
    margin-left: auto !important;
    margin-right: auto !important;
  }

  .blogger-author {
    display: ${isOff(settings.showAuthor) ? `none${bang}` : "inline-flex"};
  }

  .blogger-published-date {
    display: ${isOff(settings.showPublishedDate) ? `none${bang}` : "inline-flex"};
  }

  .blogger-reading-time {
    display: ${isOff(settings.showReadingTime) ? `none${bang}` : "inline-flex"};
  }`;
  }

  static renderFaqBlock(attrs) {
    const title = attrs.title || "";
    const titleAlign = attrs.titleAlign || "left";
    const layout = attrs.layout || "accordion";
    const items = Array.isArray(attrs.items) ? attrs.items : [];
    const accentColor = attrs.accentColor || "#008060";
    const backgroundColor = attrs.backgroundColor || "#ffffff";
    const borderColor = attrs.borderColor || "#e1e3e5";
    const borderRadius = attrs.borderRadius !== undefined ? attrs.borderRadius : 8;
    const firstOpen = attrs.firstOpen !== false;
    const enableSchema = attrs.enableSchema !== false;

    let schemaScript = "";
    if (enableSchema && items.length > 0) {
      const schemaData = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": items.map((item) => ({
          "@type": "Question",
          "name": item.question || "",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": item.answer || "",
          },
        })),
      };
      schemaScript = `<script type="application/ld+json">${JSON.stringify(schemaData)}</script>`;
    }

    let contentHtml = "";

    if (layout === "grid") {
      const gridItemsHtml = items
        .map(
          (item) => `
          <div style="background-color: ${backgroundColor}; border: 1px solid ${borderColor}; border-radius: ${borderRadius}px; padding: 18px 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
            <h4 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #202223; line-height: 1.4;">${escapeHtml(item.question || "")}</h4>
            <p style="margin: 0; font-size: 14px; color: #6d7175; line-height: 1.6;">${escapeHtml(item.answer || "")}</p>
          </div>
        `
        )
        .join("");

      contentHtml = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin: 16px 0;">${gridItemsHtml}</div>`;
    } else {
      const accordionItemsHtml = items
        .map((item, idx) => {
          const isOpen = firstOpen && idx === 0;
          return `
          <details ${isOpen ? "open" : ""} class="builder-faq-item" style="background-color: ${backgroundColor}; border: 1px solid ${borderColor}; border-radius: ${borderRadius}px; overflow: hidden; margin-bottom: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.03); transition: all 0.2s ease;">
            <summary style="padding: 14px 18px; font-size: 15px; font-weight: 600; color: #202223; cursor: pointer; outline: none; list-style: none; display: flex; justify-content: space-between; align-items: center; user-select: none;">
              <span class="faq-question-text" style="color: #202223; font-size: 15px; font-weight: 600; line-height: 1.4; transition: color 0.2s ease;">${escapeHtml(item.question || "")}</span>
              <span class="faq-icon-wrapper" style="color: ${accentColor}; flex-shrink: 0; display: inline-flex; transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </span>
            </summary>
            <div style="padding: 14px 18px 16px 18px; border-top: 1px solid ${borderColor}; background-color: transparent;">
              <p style="margin: 0; font-size: 14px; color: #4a4a4a; line-height: 1.6;">${escapeHtml(item.answer || "")}</p>
            </div>
          </details>
        `;
        })
        .join("");

      const styleBlock = `<style>
        .builder-faq-item summary::-webkit-details-marker,
        .builder-faq-item summary::marker { display: none !important; }
        .builder-faq-item[open] summary .faq-question-text { color: ${accentColor} !important; }
        .builder-faq-item[open] summary .faq-icon-wrapper { transform: rotate(180deg) !important; }
        .builder-faq-item[open] { box-shadow: 0 2px 8px rgba(0,0,0,0.06) !important; }
      </style>`;

      contentHtml = `${styleBlock}<div style="margin: 16px 0;">${accordionItemsHtml}</div>`;
    }

    const titleHtml = title ? `<h2 style="text-align: ${titleAlign}; font-size: 22px; font-weight: 700; color: #202223; margin: 24px 0 16px 0;">${escapeHtml(title)}</h2>` : "";

    return `<div class="builder-faq-block" style="width: 100%; margin: 24px 0;">
      ${titleHtml}
      ${contentHtml}
      ${schemaScript}
    </div>`;
  }

  static async compileForStorefront(contentHtml, session = null, shopifyClient = null, shopDomain = null, postId = null, customCss = null, author = null, publishedAt = null) {
    const domain = shopDomain || session?.shop;
    let settings = {};
    let shopRow = null;
    if (domain) {
      try {
        shopRow = await prisma.shop.findUnique({
          where: { domain },
          include: { settings: true }
        });
        if (shopRow && shopRow.settings) {
          settings = shopRow.settings.reduce((acc, setting) => {
            let val = setting.value;
            if (val === "true") val = true;
            else if (val === "false") val = false;
            acc[setting.key] = val;
            return acc;
          }, {});
        }
      } catch (err) {
        console.error("compileForStorefront: Error loading settings:", err);
      }
    }

    const compiled = await this.compile(contentHtml, session, shopifyClient, shopRow?.planKey || null);

    // Font is never a stored/editable setting — always fetched live from the shop's current
    // theme so it stays correct for any store without merchant setup, and automatically
    // follows theme changes. Fails soft to the system font stack if the fetch fails for any
    // reason (no session, API error, theme has no detectable font), same posture as the rest
    // of ThemeStyleService.
    let liveFontFamily = null;
    if (session) {
      try {
        const tokens = await ThemeStyleService.fetchThemeStyleTokens(shopify, session);
        liveFontFamily = tokens.fontFamily;
      } catch (err) {
        console.error("compileForStorefront: Error fetching live theme font:", err);
      }
    }
    settings = {
      ...settings,
      fontFamily: liveFontFamily ? `'${liveFontFamily}', sans-serif` : "system-ui",
    };

    // Colors and font are baked in here at sync time (always current as of this sync — colors
    // via the shop's saved settings, font via the live theme fetch above). Only the layout
    // width inside generateGlobalCss() is deliberately "soft", so it never fights the live
    // layout stylesheet below once that's present.
    const fallbackStyles = `${buildGoogleFontsLinkTag(settings.fontFamily)}
<style id="blogger-custom-styles">
${this.generateGlobalCss(settings)}
</style>
`;

    // Live layout-width stylesheet link — the fix for "changing Blog Article Layout should
    // apply everywhere instantly, not just to posts that get individually re-synced." Any
    // future layout-width change is picked up by this article on its very next storefront page
    // view, forever, with zero further action on this specific post. Silently overrides the
    // fallback above via the CSS !important tie-break, not by replacing/removing it. Colors and
    // font are intentionally NOT part of this shared link — see generateGlobalCss()'s docblock.
    const liveStylesLink = domain
      ? `<link rel="stylesheet" href="${APP_URL}/styles.css?shop=${encodeURIComponent(domain)}">`
      : "";

    // Per-post Custom CSS (post.customCss, set in the editor's Custom CSS field) — previously
    // saved to the database but never actually rendered anywhere: the only code that read it
    // (BlockRenderer.js's renderBlocks()) isn't part of the real Save & Sync path, which only
    // ever calls EditorContentCompiler. This one stays baked (not live) — it's explicit per-post
    // content the merchant enters for THIS article, analogous to a manual Related Posts pick,
    // not a global setting. Placed after the baked global styles/live layout link so a merchant's
    // custom rules can override either by normal CSS cascade (same selector = later wins),
    // without needing !important.
    const customCssBlock = customCss
      ? `\n<style id="blogger-post-custom-css">\n${customCss}\n</style>\n`
      : "";

    // One shared bootstrap script covers both related posts and custom header/footer code below —
    // emitted whenever there's a domain to build fetch URLs from, regardless of whether this
    // specific article also has a related-posts placeholder.
    const liveScriptTag = domain
      ? `<script src="${APP_URL}/related-posts.js" defer></script>`
      : "";

    // Related posts — a placeholder, NOT baked HTML. Real content is fetched live from
    // /related-posts.json (web/src/routes/relatedPosts.js) on every storefront page view, so
    // toggling showRelatedPosts or changing relatedPostsCount applies instantly to every
    // already-published post with no resync — same live-update reasoning as the /styles.css
    // <link> above, just for data instead of CSS. Omitted only when there's no postId (e.g. the
    // /preview route, which has no saved post yet) or no domain to build the fetch URL.
    const relatedPostsHtml = (postId && domain)
      ? `<div class="blogger-related-posts" data-related-posts data-post-id="${postId}" data-shop="${escapeHtml(domain)}"></div>`
      : "";

    // Custom header/footer code (Settings → Advanced) — also placeholders now, not baked HTML.
    // Previously this text was inserted directly at sync time, meaning a merchant who changed
    // this *global* setting saw nothing change on any already-published post until each one was
    // individually resynced — surprising for something that reads as a site-wide setting, not
    // per-post content. Now fetched live from /custom-code.json on every page view, same as
    // related posts above, via the same shared script.
    const headerPlaceholder = domain
      ? `<div data-custom-header data-shop="${escapeHtml(domain)}"></div>`
      : "";
    const footerPlaceholder = domain
      ? `<div data-custom-footer data-shop="${escapeHtml(domain)}"></div>`
      : "";

    // Byline (author / published date / reading time) — the data itself is baked (it's real
    // per-post content, same posture as customCssBlock above), but each element's visibility is
    // controlled purely by CSS served live from /styles.css (see publicStyles.js), so toggling
    // "Show author name" etc. in Settings applies to every already-published post on its next
    // storefront view — no resync — same reasoning as relatedPostsHtml/headerPlaceholder above.
    // Author falls back to Settings → Content & display → "Default author name" when the post
    // itself has none set, so that setting has a real effect instead of being write-only.
    const bylineAuthor = (author && String(author).trim()) || (settings.defaultAuthor && String(settings.defaultAuthor).trim()) || "";
    const bylineParts = [];
    if (bylineAuthor) {
      bylineParts.push(`<span class="blogger-author">By ${escapeHtml(bylineAuthor)}</span>`);
    }
    if (publishedAt) {
      const d = new Date(publishedAt);
      if (!isNaN(d.getTime())) {
        const formatted = d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
        bylineParts.push(`<span class="blogger-published-date">${escapeHtml(formatted)}</span>`);
      }
    }
    const plainText = compiled.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (plainText) {
      const minutes = Math.max(1, Math.round(plainText.split(" ").length / 200));
      bylineParts.push(`<span class="blogger-reading-time">${minutes} min read</span>`);
    }
    // No explicit "·" separator elements between parts — each part's visibility is controlled
    // independently by live CSS (author/date/reading-time can each be toggled off), and a
    // separator sibling wouldn't know to hide itself when its neighbor does. Spacing comes from
    // the container's flex `gap` instead, so there's never an orphaned dot.
    const bylineHtml = bylineParts.length
      ? `<div class="blogger-byline">${bylineParts.join("")}</div>\n`
      : "";

    return `${fallbackStyles}${liveStylesLink}${customCssBlock}${liveScriptTag}${headerPlaceholder}\n<div class="blogger-article-container">\n${bylineHtml}${compiled}\n${relatedPostsHtml}\n</div>${footerPlaceholder}`;
  }
}

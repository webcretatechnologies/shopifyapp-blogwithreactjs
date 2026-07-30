import * as cheerio from "cheerio";
import { prisma } from "../../shopify.js";
import { formatPrice } from "../utils/priceUtils.js";

// In-memory cache for store currency (per compile run)
let _storeCurrency = null;

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
  backgroundcolor: 'backgroundColor'
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

export class EditorContentCompiler {
  /**
   * Compiles the raw contentHtml with tiptap block wrappers into fully styled storefront HTML.
   *
   * @param {string} contentHtml Raw HTML from the editor
   * @param {object} [shopifySession] Shopify session for GraphQL queries (optional)
   * @param {object} [shopifyClient] Instantiated GraphQL client (optional)
   * @returns {Promise<string>} Storefront compiled HTML
   */
  static async compile(contentHtml, shopifySession = null, shopifyClient = null) {
    if (!contentHtml) return "";

    // Reset and fetch store currency for this compile run
    _storeCurrency = null;
    const storeCurrency = await fetchStoreCurrency(shopifyClient);

    const $ = cheerio.load(contentHtml, null, false);
    const divs = $("div[data-type]");

    for (let i = 0; i < divs.length; i++) {
      const el = divs[i];
      const $el = $(el);
      const type = $el.attr("data-type");

      // Extract and map all data- attributes
      const attrs = {};
      for (const [attrName, attrVal] of Object.entries(el.attribs)) {
        if (attrName.startsWith("data-") && attrName !== "data-type") {
          const nameWithoutData = attrName.slice(5);
          // Legacy blocks use flat lowercase names (ATTR_MAP); new nodes use
          // kebab-case (data-full-width -> fullWidth)
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
          attrs[mappedKey] = val;
        }
      }

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
            compiledHtml = this.renderDivider(attrs);
            break;
          case "spacerBlock":
            compiledHtml = this.renderSpacer(attrs);
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
          case "buyButton":
          case "BuyButton":
          case "product":
          case "Product":
          case "product_sidebar":
          case "ProductSidebar":
          case "featured_product":
          case "FeaturedProduct":
            compiledHtml = this.renderBuyButton(attrs);
            break;
          case "productGrid":
          case "ProductGrid":
          case "product_switcher":
          case "ProductSwitcher":
            compiledHtml = await this.renderProductGrid(attrs, shopifySession, shopifyClient);
            break;
          case "product_slider":
          case "ProductSlider":
            compiledHtml = await this.renderProductSlider(attrs, shopifySession, shopifyClient);
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
          default:
            // Unsupported/container types (columnLayout, column, calloutBlock,
            // buttonBlock, ...) already carry inline-styled markup — keep as-is
            break;
        }
      } catch (err) {
        console.error(`Error compiling block of type ${type}:`, err);
        compiledHtml = `<div style="padding: 16px; border: 1px dashed red; color: red;">Error rendering section: ${type}</div>`;
      }

      // Replace the wrapper div with the fully compiled block HTML to prevent double borders
      if (compiledHtml !== null) {
        $el.replaceWith(compiledHtml);
      }
    }

    return $.html();
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

  static renderVideo(attrs) {
    const url = attrs.url || "";
    const caption = attrs.caption || "";
    const aspectRatio = attrs.aspectRatio || "56.25%";
    const maxWidth = attrs.maxWidth || "100%";

    if (!url) {
      return `<div style="padding: 24px; text-align: center; border: 1px dashed #e1e3e5; color: #6d7175; font-family: sans-serif;">Video URL not provided</div>`;
    }

    const embedUrl = getEmbedUrl(url);
    const iframeHtml = `<iframe src="${embedUrl}" title="${caption || "Video"}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;

    return `<div style="position: relative; padding-bottom: ${aspectRatio}; height: 0; overflow: hidden; max-width: ${maxWidth}; margin: 20px auto;">` +
      iframeHtml +
      `</div>` +
      (caption ? `<div style="text-align: center; font-size: 14px; color: #6d7175; margin-top: 8px; font-family: sans-serif;">${caption}</div>` : "");
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
        "font-family: sans-serif",
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

    const headingStyle = `margin: 0 0 12px; font-size: 28px; font-weight: 700; color: ${textColor}; line-height: 1.2; font-family: sans-serif;`;
    const subheadingStyle = `margin: 0 0 24px; font-size: 16px; color: ${textColor}; opacity: 0.85; line-height: 1.6; font-family: sans-serif;`;

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
      "font-family: sans-serif",
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
      return `<div style="padding: 24px; text-align: center; border: 1px dashed #e1e3e5; color: #6d7175; font-family: sans-serif;">No product selected</div>`;
    }

    const variantIdRaw = product.variantId || "";
    const numericVariantId = variantIdRaw.match(/\d+$/)?.[0] || variantIdRaw;
    const pLink = product.handle ? `/products/${product.handle}` : "#";

    let badgeHtml = "";
    if (showBadge && badge) {
      badgeHtml = `<span style="display: inline-block; padding: 2px 8px; background: #e1e3e5; color: #202223; font-size: 11px; font-weight: 600; border-radius: 4px; margin-bottom: 8px; text-transform: uppercase; font-family: sans-serif;">${badge}</span>`;
    }

    const currency = resolveCurrency(product, _storeCurrency);
    let priceHtml = "";
    if (showPrice && product.price) {
      priceHtml = `<div style="font-size: 16px; color: #008060; font-weight: 700; margin-bottom: 12px; font-family: sans-serif;">${formatPrice(product.price, currency)}</div>`;
    }

    let descHtml = "";
    if (showDescription && product.description) {
      descHtml = `<p style="font-size: 13px; color: #6d7175; margin: 0 0 12px; line-height: 1.4; font-family: sans-serif;">${product.description}</p>`;
    }

    const imageUrl = typeof product.image === 'string' ? product.image : (product.image?.url || product.featuredImage?.url || product.images?.[0]?.originalSrc || product.images?.[0]?.src || "");
    let imgHtml = "";
    if (imageUrl) {
      const escapedTitle = (product.title || "").replace(/"/g, '&quot;');
      imgHtml = `<a href="${pLink}" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; text-decoration:none;"><img src="${imageUrl}" alt="${escapedTitle}" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block; margin: 0 auto;" /></a>`;
    } else {
      imgHtml = `<div style="width: 100%; height: 100%; background: #f4f6f8; display: flex; align-items: center; justify-content: center; font-size: 24px; font-family: sans-serif;">🖼</div>`;
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
            <h4 style="margin: 0 0 6px; font-size: 16px; font-weight: 600; color: #202223; font-family: sans-serif; line-height: 1.3;">
              <a href="${pLink}" style="color: inherit; text-decoration: none;">${product.title || "Product"}</a>
            </h4>
            ${descHtml}
            ${priceHtml}
            <form action="/cart/add" method="post" enctype="multipart/form-data" style="margin: 0;">
              <input type="hidden" name="id" value="${numericVariantId}" />
              <button type="submit" style="display: inline-block; padding: 8px 16px; background: ${buttonColor}; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; text-align: center; cursor: pointer; font-family: sans-serif; width: auto;">
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
            <h4 style="margin: 0 0 6px; font-size: 15px; font-weight: 600; color: #202223; font-family: sans-serif; line-height: 1.3;">
              <a href="${pLink}" style="color: inherit; text-decoration: none;">${product.title || "Product"}</a>
            </h4>
            ${descHtml}
            ${priceHtml}
            <form action="/cart/add" method="post" enctype="multipart/form-data" style="margin: 0;">
              <input type="hidden" name="id" value="${numericVariantId}" />
              <button type="submit" style="display: block; width: 100%; padding: 10px 16px; background: ${buttonColor}; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; text-align: center; cursor: pointer; font-family: sans-serif;">
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
      return `<div style="padding: 32px 16px; text-align: center; border: 2px dashed #e1e3e5; border-radius: 8px; color: #6d7175; font-family: sans-serif;">` +
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
      headerHtml = `<h3 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #202223; text-align: ${titleAlign}; font-family: sans-serif;">${title}</h3>`;
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
        : `<div style="width: 100%; height: 180px; background: #f8f9fa; border-bottom:1px solid #f1f2f3; display: flex; align-items: center; justify-content: center; font-size: 24px; font-family: sans-serif;">🖼</div>`;

      const pCurrency = p.currency || _storeCurrency || 'USD';
      const pPrice = (showPrice && p.price)
        ? `<div style="font-size: 14px; color: #008060; font-weight: 700; margin-bottom: 8px; font-family: sans-serif;">${formatPrice(p.price, pCurrency)}</div>`
        : "";

      const pBtn = showButton
        ? `<form action="/cart/add" method="post" enctype="multipart/form-data" style="margin: 0;">
            <input type="hidden" name="id" value="${numericVId}" />
            <button type="submit" style="display: block; width: 100%; padding: 8px 12px; background: ${buttonColor}; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; text-align: center; cursor: pointer; font-family: sans-serif;">
              ${buttonText}
            </button>
          </form>`
        : "";

      cardsHtml += `
        <div style="${activeStyle}">
          ${pImg}
          <div style="padding: 12px;">
            <div style="font-size: 14px; font-weight: 600; color: #202223; margin-bottom: 4px; line-height: 1.3; font-family: sans-serif;">
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
      return `<div style="padding: 32px 16px; text-align: center; border: 2px dashed #e1e3e5; border-radius: 8px; color: #6d7175; font-family: sans-serif;">` +
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
      headerHtml = `<h3 style="margin: 0 0 16px; font-size: 20px; font-weight: 700; color: #202223; text-align: ${titleAlign}; font-family: sans-serif;">${title}</h3>`;
    }

    let cardsHtml = "";
    list.slice(0, parseInt(maxProducts)).forEach(p => {
      const vIdRaw = p.variantId || "";
      const numericVId = vIdRaw.match(/\d+$/)?.[0] || vIdRaw;
      const pLink = p.handle ? `/products/${p.handle}` : "#";

      const escapedTitle = (p.title || "").replace(/"/g, '&quot;');
      const pImg = p.image
        ? `<a href="${pLink}" style="display:block; text-decoration:none;"><img src="${p.image}" alt="${escapedTitle}" style="width: 100%; aspect-ratio: 1; object-fit: cover; display: block;" /></a>`
        : `<div style="width: 100%; aspect-ratio: 1; background: #f1f2f3; display: flex; align-items: center; justify-content: center; font-size: 24px; font-family: sans-serif;">🖼</div>`;

      const pCurrency = p.currency || _storeCurrency || 'USD';
      const pPrice = (showPrice && p.price)
        ? `<div style="font-size: 14px; color: #008060; font-weight: 700; margin-bottom: 8px; font-family: sans-serif;">${formatPrice(p.price, pCurrency)}</div>`
        : "";

      const pBtn = showButton
        ? `<form action="/cart/add" method="post" enctype="multipart/form-data" style="margin: 0;">
            <input type="hidden" name="id" value="${numericVId}" />
            <button type="submit" style="display: block; width: 100%; padding: 8px 12px; background: ${buttonColor}; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: 600; text-align: center; cursor: pointer; font-family: sans-serif;">
              ${buttonText}
            </button>
          </form>`
        : "";

      cardsHtml += `
        <div style="flex: 0 0 220px; scroll-snap-align: start; box-sizing: border-box;">
          <div style="${activeStyle}">
            ${pImg}
            <div style="padding: 12px;">
              <div style="font-size: 14px; font-weight: 600; color: #202223; margin-bottom: 4px; line-height: 1.3; font-family: sans-serif; height: 36px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
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
      <div class="shopify-blog-slider-container" style="position: relative; margin: 24px 0; font-family: sans-serif; box-sizing: border-box; width: 100%;">
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

    if (!collectionHandle) {
      return `<div style="padding: 32px 16px; text-align: center; border: 2px dashed #e1e3e5; border-radius: 8px; color: #6d7175; font-family: sans-serif;">` +
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
        ? `<a href="${viewAllLink}" style="font-size: 13px; color: #2c6ecb; font-weight: 500; text-decoration: none; padding: 6px 12px; border: 1px solid #2c6ecb; border-radius: 6px; font-family: sans-serif;">View All →</a>`
        : "";
      headerHtml = `
        <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%;">
          <h3 style="margin: 0; font-size: 20px; font-weight: 700; color: #202223; font-family: sans-serif;">${displayTitle}</h3>
          ${viewAllBtn}
        </div>
      `;
    }

    const cardStyle = `border: 1px solid #e1e3e5; border-radius: 10px; overflow: hidden; background: #fff; box-sizing: border-box;`;

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
        const pImg = p.image
          ? `<a href="${pLink}" style="display:block; text-decoration:none;"><img src="${p.image}" alt="${escapedTitle}" style="width: 100%; aspect-ratio: 1; object-fit: cover; display: block;" /></a>`
          : `<div style="width: 100%; aspect-ratio: 1; background: #f1f2f3; display: flex; align-items: center; justify-content: center; font-size: 24px; font-family: sans-serif;">🖼</div>`;

        const pCurrency = p.currency || _storeCurrency || 'USD';
        const pPrice = (showPrice && p.price)
          ? `<div style="font-size: 13px; color: #008060; font-weight: 700; margin-bottom: 6px; font-family: sans-serif;">${formatPrice(p.price, pCurrency)}</div>`
          : "";

        const pBtn = showButton
          ? `<form action="/cart/add" method="post" enctype="multipart/form-data" style="margin: 0;">
              <input type="hidden" name="id" value="${numericVId}" />
              <button type="submit" style="display: block; width: 100%; padding: 6px; background: ${buttonColor}; color: #fff; border: none; border-radius: 5px; font-size: 12px; font-weight: 600; text-align: center; cursor: pointer; font-family: sans-serif;">
                ${buttonText}
              </button>
            </form>`
          : "";

        scrollCards += `
          <div style="${cardWrapperStyle}">
            <div style="${cardStyle}">
              ${pImg}
              <div style="padding: 10px;">
                <div style="font-size: 13px; font-weight: 600; color: #202223; margin-bottom: 4px; line-height: 1.3; font-family: sans-serif; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
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
        const pImg = p.image
          ? `<a href="${pLink}" style="display:block; text-decoration:none;"><img src="${p.image}" alt="${escapedTitle}" style="width: 100%; aspect-ratio: 1; object-fit: cover; display: block;" /></a>`
          : `<div style="width: 100%; aspect-ratio: 1; background: #f1f2f3; display: flex; align-items: center; justify-content: center; font-size: 24px; font-family: sans-serif;">🖼</div>`;

        const pCurrency = p.currency || _storeCurrency || 'USD';
        const pPrice = (showPrice && p.price)
          ? `<div style="font-size: 13px; color: #008060; font-weight: 700; margin-bottom: 6px; font-family: sans-serif;">${formatPrice(p.price, pCurrency)}</div>`
          : "";

        const pBtn = showButton
          ? `<form action="/cart/add" method="post" enctype="multipart/form-data" style="margin: 0;">
              <input type="hidden" name="id" value="${numericVId}" />
              <button type="submit" style="display: block; width: 100%; padding: 6px; background: ${buttonColor}; color: #fff; border: none; border-radius: 5px; font-size: 12px; font-weight: 600; text-align: center; cursor: pointer; font-family: sans-serif;">
                ${buttonText}
              </button>
            </form>`
          : "";

        cardsHtml += `
          <div style="${cardStyle}">
            ${pImg}
            <div style="padding: 10px;">
              <div style="font-size: 13px; font-weight: 600; color: #202223; margin-bottom: 4px; line-height: 1.3; font-family: sans-serif; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
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
      return `<div style="padding: 24px; text-align: center; border: 1px dashed #e1e3e5; color: #6d7175; font-family: sans-serif;">Image not selected</div>`;
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
      ${caption ? `<div style="text-align: center; font-size: 14px; color: #6d7175; margin-top: 8px; font-family: sans-serif;">${caption}</div>` : ""}
    </div>`;
  }

  static renderProductCard(attrs) {
    const title = attrs.title || attrs.product?.title || "";
    const price = attrs.price || attrs.product?.price || "";
    const compareAtPrice = attrs.compareAtPrice || attrs.compareatprice || attrs.product?.compareAtPrice || "";
    const imageUrl = attrs.imageUrl || attrs.imageurl || attrs.image || (typeof attrs.featuredImage === 'string' ? attrs.featuredImage : attrs.featuredImage?.url) || attrs.product?.image || attrs.product?.featuredImage?.url || attrs.product?.images?.[0]?.originalSrc || attrs.product?.images?.[0]?.src || "";
    const handle = attrs.handle || attrs.product?.handle || "";
    const buttonText = attrs.buttonText || attrs.buttontext || "Add to Cart";
    const buttonColor = attrs.buttonColor || attrs.buttoncolor || "#2d6a4f";
    const showImage = attrs.showImage !== false && attrs.showimage !== false && attrs.showimage !== "false";
    const showPrice = attrs.showPrice !== false && attrs.showprice !== false && attrs.showprice !== "false";
    const showButton = attrs.showButton !== false && attrs.showbutton !== false && attrs.showbutton !== "false";
    const layout = attrs.layout || "vertical";
    const borderRadius = parseInt(attrs.borderRadius || attrs.borderradius) || 8;
    const borderColor = attrs.borderColor || attrs.bordercolor || "#e0e0e0";
    const backgroundColor = attrs.backgroundColor || attrs.backgroundcolor || "#ffffff";

    if (!title) {
      return `<div style="padding: 24px; text-align: center; border: 1px dashed #e1e3e5; color: #6d7175; font-family: sans-serif;">Product not selected</div>`;
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
      ? `<div style="margin: 0 0 12px 0;"><span style="font-weight: bold;">${escapeHtml(formattedPrice)}</span>${formattedCompareAtPrice ? `<span style="text-decoration: line-through; color: #6d7175; margin-left: 8px; font-size: 14px;">${escapeHtml(formattedCompareAtPrice)}</span>` : ""}</div>`
      : "";

    const buttonHtml = showButton
      ? `<a href="${productUrl}" style="display: ${layout === "vertical" ? "block" : "inline-block"}; background: ${buttonColor}; color: #ffffff; text-decoration: none; padding: 8px 16px; border-radius: 4px; font-weight: 600; text-align: center; margin-top: auto;">${escapeHtml(buttonText)}</a>`
      : "";

    return `
      <div style="display: flex; flex-direction: ${isHorizontal ? "row" : "column"}; height: 100%; flex: 1; ${isCompact ? "align-items: center;" : ""} border: 1px solid ${borderColor}; border-radius: ${borderRadius}px; background: ${backgroundColor}; overflow: hidden; margin: 16px 0; font-family: sans-serif; box-sizing: border-box;">
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
      return `<div style="padding: 24px; text-align: center; border: 1px dashed #e1e3e5; color: #6d7175; font-family: sans-serif;">Video URL not provided</div>`;
    }
    const embedUrl = getEmbedUrl(url);
    const paddingBottom = attrs.aspectRatio === "4:3" ? "75%" : "56.25%";
    return `<div style="position: relative; padding-bottom: ${paddingBottom}; height: 0; overflow: hidden; border-radius: 4px; background: #000;">` +
      `<iframe src="${escapeHtml(embedUrl)}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin"></iframe>` +
      `</div>`;
  }

  static generateStyles(settings) {
    return `
<style id="blogger-custom-styles">
  :root {
    --blogger-primary-color: ${settings.primaryColor || "#008060"};
    --blogger-secondary-color: ${settings.secondaryColor || "#005bd3"};
    --blogger-font-family: ${settings.fontFamily || "system-ui"};
    --blogger-layout-width: ${settings.blogLayout === "centered" ? "800px" : settings.blogLayout === "narrow" ? "640px" : "100%"};
  }

  .blogger-article-container {
    max-width: var(--blogger-layout-width) !important;
    margin-left: auto !important;
    margin-right: auto !important;
    font-family: var(--blogger-font-family) !important;
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

  .blogger-reading-time {
    display: ${settings.showReadingTime === false || settings.showReadingTime === "false" ? "none !important" : "inline-block"};
  }

  .blogger-author {
    display: ${settings.showAuthor === false || settings.showAuthor === "false" ? "none !important" : "inline-block"};
  }

  .blogger-published-date {
    display: ${settings.showPublishedDate === false || settings.showPublishedDate === "false" ? "none !important" : "inline-block"};
  }

  .blogger-related-posts {
    display: ${settings.showRelatedPosts === false || settings.showRelatedPosts === "false" ? "none !important" : "block"};
  }

  .blogger-toc {
    display: ${settings.showToc === false || settings.showToc === "false" ? "none !important" : "block"};
    float: ${settings.tocPosition === "left" ? "left" : settings.tocPosition === "right" ? "right" : "none"};
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
  }

</style>
`;
  }

  static async compileForStorefront(contentHtml, session = null, shopifyClient = null, shopDomain = null) {
    const compiled = await this.compile(contentHtml, session, shopifyClient);
    
    const domain = shopDomain || session?.shop;
    let settings = {};
    if (domain) {
      try {
        const shop = await prisma.shop.findUnique({
          where: { domain },
          include: { settings: true }
        });
        if (shop && shop.settings) {
          settings = shop.settings.reduce((acc, setting) => {
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
    
    const styles = this.generateStyles(settings);
    const headerCode = settings.customHeaderCode ? `\n${settings.customHeaderCode}\n` : "";
    const footerCode = settings.customFooterCode ? `\n${settings.customFooterCode}\n` : "";
    return `${styles}${headerCode}\n<div class="blogger-article-container">\n${compiled}\n</div>${footerCode}`;
  }
}

import * as cheerio from "cheerio";

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
  showviewall: 'showViewAll'
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
  let match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  if (match && match[1]) {
    return `https://www.youtube.com/embed/${match[1]}`;
  }
  match = url.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+)(?:$|\/|\?)/i);
  if (match && match[3]) {
    return `https://player.vimeo.com/video/${match[3]}`;
  }
  return url;
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
          const mappedKey = ATTR_MAP[nameWithoutData] || nameWithoutData;

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

      // Compile content based on block type
      let compiledHtml = "";
      try {
        switch (type) {
          case "dividerBlock":
            compiledHtml = this.renderDivider(attrs);
            break;
          case "spacerBlock":
            compiledHtml = this.renderSpacer(attrs);
            break;
          case "videoBlock":
            compiledHtml = this.renderVideo(attrs);
            break;
          case "heroBlock":
            compiledHtml = this.renderHero(attrs);
            break;
          case "ctaButton":
            compiledHtml = this.renderCtaButton(attrs);
            break;
          case "buyButton":
            compiledHtml = this.renderBuyButton(attrs);
            break;
          case "productGrid":
            compiledHtml = await this.renderProductGrid(attrs, shopifySession, shopifyClient);
            break;
          case "collection":
            compiledHtml = await this.renderCollection(attrs, shopifySession, shopifyClient);
            break;
          default:
            // Keep unchanged if unsupported
            compiledHtml = $el.html() || "";
            break;
        }
      } catch (err) {
        console.error(`Error compiling block of type ${type}:`, err);
        compiledHtml = `<div style="padding: 16px; border: 1px dashed red; color: red;">Error rendering section: ${type}</div>`;
      }

      // Replace the inner HTML of the wrapper div
      $el.html(compiledHtml);
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

    let priceHtml = "";
    if (showPrice && product.price) {
      priceHtml = `<div style="font-size: 16px; color: #008060; font-weight: 700; margin-bottom: 12px; font-family: sans-serif;">$${parseFloat(product.price).toFixed(2)}</div>`;
    }

    let descHtml = "";
    if (showDescription && product.description) {
      descHtml = `<p style="font-size: 13px; color: #6d7175; margin: 0 0 12px; line-height: 1.4; font-family: sans-serif;">${product.description}</p>`;
    }

    let imgHtml = "";
    if (product.image) {
      imgHtml = `<a href="${pLink}" style="display:block; text-decoration:none;"><img src="${product.image}" alt="${product.title}" style="width: 100%; height: 100%; object-fit: cover; display: block;" /></a>`;
    } else {
      imgHtml = `<div style="width: 100%; height: 100%; background: #f1f2f3; display: flex; align-items: center; justify-content: center; font-size: 24px; font-family: sans-serif;">🖼</div>`;
    }

    let cardStyle = "";
    if (layout === "horizontal") {
      cardStyle = `display: flex; gap: 16px; align-items: center; border: 1px solid #e1e3e5; border-radius: 10px; padding: 16px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.05); max-width: ${maxWidth || "600px"}; margin: 20px 0; box-sizing: border-box;`;
      return `
        <div style="${cardStyle}">
          <div style="width: ${imageSize}; height: ${imageSize}; flex-shrink: 0; border-radius: 8px; overflow: hidden; border: 1px solid #f1f2f3;">
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
      cardStyle = `border: 1px solid #e1e3e5; border-radius: 10px; overflow: hidden; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.05); max-width: ${maxWidth}; margin: 20px 0; box-sizing: border-box;`;
      return `
        <div style="${cardStyle}">
          <div style="aspect-ratio: 1; width: 100%; border-bottom: 1px solid #e1e3e5;">
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

      const pImg = p.image
        ? `<a href="${pLink}" style="display:block; text-decoration:none;"><img src="${p.image}" alt="${p.title}" style="width: 100%; aspect-ratio: 1; object-fit: cover; display: block;" /></a>`
        : `<div style="width: 100%; aspect-ratio: 1; background: #f1f2f3; display: flex; align-items: center; justify-content: center; font-size: 24px; font-family: sans-serif;">🖼</div>`;

      const pPrice = (showPrice && p.price)
        ? `<div style="font-size: 14px; color: #008060; font-weight: 700; margin-bottom: 8px; font-family: sans-serif;">$${parseFloat(p.price).toFixed(2)}</div>`
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
        <div style="${gridStyle}">
          ${cardsHtml}
        </div>
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

        const pImg = p.image
          ? `<a href="${pLink}" style="display:block; text-decoration:none;"><img src="${p.image}" alt="${p.title}" style="width: 100%; aspect-ratio: 1; object-fit: cover; display: block;" /></a>`
          : `<div style="width: 100%; aspect-ratio: 1; background: #f1f2f3; display: flex; align-items: center; justify-content: center; font-size: 24px; font-family: sans-serif;">🖼</div>`;

        const pPrice = (showPrice && p.price)
          ? `<div style="font-size: 13px; color: #008060; font-weight: 700; margin-bottom: 6px; font-family: sans-serif;">$${parseFloat(p.price).toFixed(2)}</div>`
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

        const pImg = p.image
          ? `<a href="${pLink}" style="display:block; text-decoration:none;"><img src="${p.image}" alt="${p.title}" style="width: 100%; aspect-ratio: 1; object-fit: cover; display: block;" /></a>`
          : `<div style="width: 100%; aspect-ratio: 1; background: #f1f2f3; display: flex; align-items: center; justify-content: center; font-size: 24px; font-family: sans-serif;">🖼</div>`;

        const pPrice = (showPrice && p.price)
          ? `<div style="font-size: 13px; color: #008060; font-weight: 700; margin-bottom: 6px; font-family: sans-serif;">$${parseFloat(p.price).toFixed(2)}</div>`
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

      contentHtml = `<div style="${gridStyle}">${cardsHtml}</div>`;
    }

    return `
      <div style="width: 100%; margin: 24px 0;">
        ${headerHtml}
        ${contentHtml}
      </div>
    `;
  }
}

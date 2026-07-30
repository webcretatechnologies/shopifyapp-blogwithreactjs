/**
 * ShopifyArticleParser
 * Server-side parser that converts raw Shopify article body_html into
 * structured editor blocks (contentJson) and raw editor HTML.
 *
 * This is the server-side equivalent of the frontend parseHtmlToBlocks,
 * reused across webhook handlers and the import route.
 */
import * as cheerio from "cheerio";

export class ShopifyArticleParser {
  /**
   * Parse Shopify article HTML into editor blocks.
   *
   * @param {string} html - Raw body_html from Shopify
   * @returns {{ blocks: Array, rawEditorHtml: string, structureDegraded: boolean }}
   */
  static parse(html) {
    if (!html || html.trim() === "") {
      return { blocks: [], rawEditorHtml: "", structureDegraded: false };
    }

    const $ = cheerio.load(html, null, false);

    // Strip any app-generated wrapper noise using cheerio
    this._stripAppWrapper($);
    // Fallback raw HTML after stripping wrappers (used when block→html reconstruction is empty)
    const cleanedHtml = ($("body").html() || "").trim() || $.html();
    const blocks = [];
    let structureDegraded = false;

    const processNode = (node, currentBlocksArray) => {
      if (node.type === "text") {
        if (node.data?.trim()) {
          currentBlocksArray.push({
            id: this._generateId(),
            type: "RichText",
            settings: { content: `<p>${node.data}</p>` },
          });
        }
        return;
      }

      if (node.type !== "tag") return;

      const $el = $(node);
      const tagName = node.tagName.toLowerCase();

      if (["style", "script", "meta", "link"].includes(tagName)) return;

      // 1. Check for app block wrappers (div[data-type] or h2[data-type] etc)
      const dataType = $el.attr("data-type");
      if (dataType) {
        const block = this._convertDataBlock($el, dataType);
        if (block) {
          if (block.type === "ColumnLayout" || block.type === "Column" || block.type === "Section") {
            block.children = [];
            currentBlocksArray.push(block);
            $el.contents().each((_, child) => processNode(child, block.children));
            return;
          } else {
            currentBlocksArray.push(block);
            return;
          }
        }
      }

      // 2. Unwrapped elements: inspect tag name
      if (/^h[1-6]$/.test(tagName)) {
        const level = parseInt(tagName.charAt(1), 10);
        const text = $el.text()?.trim();
        if (text) {
          currentBlocksArray.push({
            id: this._generateId(),
            type: "Heading",
            settings: { text, level, align: "left" },
          });
        }
        return;
      }

      if (tagName === "img") {
        const src = $el.attr("src");
        if (src) {
          currentBlocksArray.push({
            id: this._generateId(),
            type: "Image",
            settings: { src, alt: $el.attr("alt") || "", width: "100%", alignment: "center" },
          });
        }
        return;
      }

      if (tagName === "figure") {
        const $img = $el.find("img");
        const $caption = $el.find("figcaption");
        if ($img.length && $img.attr("src")) {
          currentBlocksArray.push({
            id: this._generateId(),
            type: "Image",
            settings: {
              src: $img.attr("src"),
              alt: $img.attr("alt") || "",
              caption: $caption.text()?.trim() || "",
              width: "100%",
              alignment: "center",
            },
          });
          return;
        }
      }

      if (tagName === "hr") {
        currentBlocksArray.push({
          id: this._generateId(),
          type: "Divider",
          settings: { style: "solid", thickness: "1px", color: "#e1e3e5" },
        });
        return;
      }

      if (tagName === "table") {
        const tableData = [];
        $el.find("tr").each((_, tr) => {
          const row = [];
          $(tr).find("th, td").each((_, td) => {
            row.push($(td).text()?.trim() || "");
          });
          if (row.length) tableData.push(row);
        });
        currentBlocksArray.push({
          id: this._generateId(),
          type: "Table",
          settings: { tableData: tableData.length ? tableData : [["Header 1", "Header 2"], ["Data 1", "Data 2"]] },
        });
        return;
      }

      if (tagName === "blockquote") {
        currentBlocksArray.push({
          id: this._generateId(),
          type: "Callout",
          settings: {
            title: "",
            body: $el.text()?.trim() || "",
            emoji: "💡",
            backgroundColor: "#fdfbc8",
            borderColor: "#eab308",
          },
        });
        return;
      }

      // If wrapper <div> or <section> or contains builder blocks, recurse into children
      const hasBuilderBlocks = $el.find("[data-type]").length > 0;
      const hasChildElements = $el.children().length > 0;
      if (hasBuilderBlocks || tagName === "div" || tagName === "section" || tagName === "article") {
        if (hasChildElements) {
          $el.contents().each((_, child) => processNode(child, currentBlocksArray));
          return;
        }
      }

      // Default: Paragraphs <p>, <ul>, <ol>, or other text markup
      if ($el.find("img").length > 0) {
        $el.contents().each((_, child) => processNode(child, currentBlocksArray));
        return;
      }

      const outerHtml = $.html(node);
      if (outerHtml?.trim()) {
        const cleanText = outerHtml.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim();
        const containsMedia = /<(img|iframe|table|video|svg|input|button)/i.test(outerHtml);
        if (cleanText || containsMedia) {
          currentBlocksArray.push({
            id: this._generateId(),
            type: "RichText",
            settings: { content: outerHtml },
          });
        }
      }
    };

    // Process top-level children
    $("body").children().each((_, el) => processNode(el, blocks));

    // If no blocks were found, create a single text block
    if (blocks.length === 0) {
      blocks.push({
        id: this._generateId(),
        type: "text",
        data: "",
        isHtml: true,
      });
    }

    // Reconstruct a raw editor HTML from parsed blocks
    const rawEditorHtml = this._blocksToRawHtml(blocks);

    return {
      blocks,
      rawEditorHtml: rawEditorHtml || cleanedHtml,
      structureDegraded,
    };
  }

  /**
   * Strip app-generated wrapper elements (custom styles, containers) using cheerio.
   * Mutates the cheerio $ object in place.
   */
  static _stripAppWrapper($) {
    // Remove blogger-custom-styles style blocks
    $("style#blogger-custom-styles").remove();

    // Remove blogger-article-container wrapper but keep inner content
    $(".blogger-article-container").each((_, el) => {
      const $el = $(el);
      const children = $el.contents();
      $el.replaceWith(children);
    });
  }

  /**
   * Convert a div[data-type] custom block element into a structured block object.
   */
  static _convertDataBlock($el, dataType) {
    const TYPE_MAP = {
      buyButton: "BuyButton",
      buy_button: "BuyButton",
      productGrid: "ProductGrid",
      product_grid: "ProductGrid",
      collection: "Collection",
      ctaButton: "CTAButton",
      cta_button: "CTAButton",
      heroBlock: "Hero",
      hero: "Hero",
      videoBlock: "Video",
      video: "Video",
      spacerBlock: "Spacer",
      spacer: "Spacer",
      dividerBlock: "Divider",
      divider: "Divider",
      imageBlock: "Image",
      image: "Image",
      product: "ProductCard",
      product_sidebar: "ProductSidebar",
      featured_product: "FeaturedProduct",
      product_switcher: "ProductSwitcher",
      product_slider: "ProductSlider",
      faqBlock: "FaqBlock",
      FaqBlock: "FaqBlock",
      faq: "FaqBlock",
      FAQ: "FaqBlock",
    };

    const ATTR_MAP = {
      buttontext: "buttonText",
      buttoncolor: "buttonColor",
      imagesize: "imageSize",
      showprice: "showPrice",
      showdescription: "showDescription",
      showbadge: "showBadge",
      product: "product",
      layout: "layout",
      version: "version",
      title: "title",
      columns: "columns",
      maxproducts: "maxProducts",
      cardstyle: "cardStyle",
      gap: "gap",
      showbutton: "showButton",
      manualproducts: "manualProducts",
      searchquery: "searchQuery",
      collection: "collection",
      limit: "limit",
      text: "text",
      url: "url",
      align: "align",
      color: "color",
      textcolor: "textColor",
      size: "size",
      borderradius: "borderRadius",
      heading: "heading",
      subheading: "subheading",
      backgroundimage: "backgroundImage",
      backgroundoverlay: "backgroundOverlay",
      overlaycolor: "overlayColor",
      overlayopacity: "overlayOpacity",
      minheight: "minHeight",
      showcta: "showCta",
      ctatext: "ctaText",
      ctaurl: "ctaUrl",
      ctacolor: "ctaColor",
      ctatextcolor: "ctaTextColor",
      caption: "caption",
      aspectratio: "aspectRatio",
      maxwidth: "maxWidth",
      height: "height",
      style: "style",
      thickness: "thickness",
      margin: "margin",
      src: "src",
      alt: "alt",
      width: "width",
      linkurl: "linkUrl",
      titlealign: "titleAlign",
      level: "level",
      hasheader: "hasHeader",
      type: "type",
    };

    const block = {
      id: this._generateId(),
      type: TYPE_MAP[dataType] || dataType,
    };

    Array.from($el.get(0)?.attributes || []).forEach((attr) => {
      if (attr.name.startsWith("data-")) {
        const key = attr.name.substring(5);
        if (key === "type") return;
        const mappedKey = ATTR_MAP[key] || key;
        let val = attr.value;
        if (val === "true") val = true;
        else if (val === "false") val = false;
        else if (val && (val.startsWith("{") || val.startsWith("["))) {
          try { val = JSON.parse(val); } catch (e) { /* keep string */ }
        } else if (!isNaN(val) && val.trim() !== "" && key === "overlayopacity") {
          val = parseFloat(val);
        }
        block.settings = block.settings || {};
        block.settings[mappedKey] = val;
      }
    });

    if (block.type === "Heading") {
      block.settings = block.settings || {};
      block.settings.text = $el.text() || "";
    } else if (block.type === "RichText") {
      block.settings = block.settings || {};
      block.settings.content = $el.html() || "";
    } else if (block.type === "Html") {
      block.settings = block.settings || {};
      block.settings.code = $el.html() || "";
    } else if (block.type === "Callout") {
      block.settings = block.settings || {};
      block.settings.text = $el.html() || "";
    } else if (block.type === "Table") {
      block.settings = block.settings || {};
      const tableData = [];
      $el.find("tr").each((_, tr) => {
        const row = [];
        // Support both th and td equally for generic iteration
        $(tr).find("th, td").each((_, td) => {
          row.push($(td).text() || "");
        });
        tableData.push(row);
      });
      block.settings.tableData = tableData;
    }

    return block;
  }

  /**
   * Convert parsed blocks back into raw editor HTML.
   * This is the inverse of the parsing logic.
   */
  static _blocksToRawHtml(blocks) {
    if (!blocks || blocks.length === 0) return "";

    let html = "";
    for (const block of blocks) {
      switch (block.type) {
        case "text":
          html += block.data || "";
          break;
        case "heading":
          html += `<h${block.level || 2}>${block.data || ""}</h${block.level || 2}>`;
          break;
        case "image":
          html += `<img src="${block.url || block.src || ""}" alt="${block.alt || ""}" />`;
          break;
        case "divider":
          html += "<hr />";
          break;
        case "spacer":
          html += `<div style="height: ${block.height || "40px"}"></div>`;
          break;
        case "list":
          if (block.listType === "ol") {
            html += "<ol>" + (block.items || []).map((i) => `<li>${i}</li>`).join("") + "</ol>";
          } else {
            html += "<ul>" + (block.items || []).map((i) => `<li>${i}</li>`).join("") + "</ul>";
          }
          break;
        default:
          // For custom app blocks, reconstruct as div[data-type] wrappers
          html += this._blockToDataHtml(block);
          break;
      }
    }
    return html;
  }

  /**
   * Convert a single app block back to its div[data-type] wrapper HTML.
   */
  static _blockToDataHtml(block) {
    const REVERSE_TYPE_MAP = {
      buy_button: "buyButton",
      product_grid: "productGrid",
      collection: "collection",
      cta_button: "ctaButton",
      hero: "heroBlock",
      video: "videoBlock",
      spacer: "spacerBlock",
      divider: "dividerBlock",
      image: "imageBlock",
      product: "product",
      product_sidebar: "product_sidebar",
      featured_product: "featured_product",
      product_switcher: "product_switcher",
      product_slider: "product_slider",
    };

    const REVERSE_ATTR_MAP = {
      buttonText: "buttontext",
      buttonColor: "buttoncolor",
      imageSize: "imagesize",
      showPrice: "showprice",
      showDescription: "showdescription",
      showBadge: "showbadge",
      collectionHandle: "collectionhandle",
      showTitle: "showtitle",
      showViewAll: "showviewall",
      linkUrl: "linkurl",
      minHeight: "minheight",
      titleAlign: "titlealign",
    };

    const dataType = REVERSE_TYPE_MAP[block.type] || block.type;
    let attrs = `data-type="${dataType}"`;

    const skipKeys = ["id", "type"];
    for (const [key, value] of Object.entries(block)) {
      if (skipKeys.includes(key)) continue;
      const attrName = REVERSE_ATTR_MAP[key] || key;
      let val = value;
      if (typeof val === "boolean") {
        val = val ? "true" : "false";
      } else if (typeof val === "object") {
        try { val = JSON.stringify(val); } catch (e) { continue; }
      }
      if (val !== undefined && val !== null) {
        attrs += ` data-${attrName}="${String(val).replace(/"/g, "&quot;")}"`;
      }
    }

    return `<div ${attrs}></div>`;
  }

  static _generateId() {
    return `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

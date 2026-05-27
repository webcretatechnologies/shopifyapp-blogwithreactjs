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
    let lastTextBlock = null;

    const appendTextBlock = (contentHtmlStr) => {
      if (!contentHtmlStr || contentHtmlStr.trim() === "") return;
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock && lastBlock.type === "text") {
        lastBlock.data = (lastBlock.data || "") + contentHtmlStr;
        lastBlock.isHtml = true;
      } else {
        blocks.push({
          id: this._generateId(),
          type: "text",
          data: contentHtmlStr,
          isHtml: true,
        });
      }
    };

    const processNode = (node) => {
      if (node.type === "text") {
        if (node.data?.trim()) {
          appendTextBlock(`<p>${node.data}</p>`);
        }
        return;
      }

      if (node.type !== "tag") return;

      const $el = $(node);
      const tagName = node.tagName.toLowerCase();

      // Check for custom app block data
      if ($el.attr("data-blog-app-block") !== undefined) {
        try {
          const dataStr = $el.attr("data-blog-app-data");
          const parsed = JSON.parse(dataStr);
          if (parsed) {
            parsed.id = this._generateId();
            blocks.push(parsed);
            return;
          }
        } catch (e) {
          // ignore parse errors
        }
      }

      // Check for app block wrappers (div[data-type])
      const dataType = $el.attr("data-type");
      if (dataType) {
        const block = this._convertDataBlock($el, dataType);
        if (block) {
          blocks.push(block);
          return;
        }
      }

      switch (tagName) {
        case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
          blocks.push({
            id: this._generateId(),
            type: "heading",
            level: parseInt(tagName.substring(1)),
            data: $el.text().trim(),
          });
          break;

        case "p": {
          // Check for inline app markers
          const text = $el.html()?.trim();
          if (text) {
            appendTextBlock(text);
          }
          break;
        }

        case "ul":
        case "ol": {
          const items = [];
          $el.children("li").each((_, li) => {
            const txt = $(li).html()?.trim();
            if (txt) items.push(txt);
          });
          if (items.length) {
            blocks.push({
              id: this._generateId(),
              type: "list",
              listType: tagName,
              items,
            });
          }
          break;
        }

        case "img": {
          const src = $el.attr("src");
          if (src) {
            blocks.push({
              id: this._generateId(),
              type: "image",
              url: src,
              alt: $el.attr("alt") || "",
              data: "",
            });
          }
          break;
        }

        case "hr":
          blocks.push({
            id: this._generateId(),
            type: "divider",
            data: "",
          });
          break;

        case "table": {
          const headers = [];
          const rows = [];
          $el.find("thead th, thead td").each((_, th) => headers.push($(th).text().trim()));
          $el.find("tbody tr, tr").each((_, tr) => {
            const row = [];
            $(tr).find("td, th").each((_, td) => {
              if ($(td).closest("thead").length === 0) {
                row.push($(td).text().trim());
              }
            });
            if (row.length) rows.push(row);
          });
          if (headers.length || rows.length) {
            blocks.push({
              id: this._generateId(),
              type: "table",
              headers,
              rows,
            });
          }
          break;
        }

        case "div":
        case "span":
        case "section":
          // Recursively process children
          $el.children().each((_, child) => processNode(child));
          break;

        case "style":
        case "script":
        case "meta":
        case "link":
          // Skip non-content elements
          break;

        default:
          // Wrap unknown elements as text
          const outerHtml = $.html(node);
          if (outerHtml?.trim()) {
            appendTextBlock(outerHtml);
          }
          break;
      }
    };

    // Process top-level children
    $("body").children().each((_, el) => processNode(el));

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
      buyButton: "buy_button",
      productGrid: "product_grid",
      collection: "collection",
      ctaButton: "cta_button",
      heroBlock: "hero",
      videoBlock: "video",
      spacerBlock: "spacer",
      dividerBlock: "divider",
      imageBlock: "image",
      product: "product",
      product_sidebar: "product_sidebar",
      featured_product: "featured_product",
      product_switcher: "product_switcher",
      product_slider: "product_slider",
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
        block[mappedKey] = val;
      }
    });

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

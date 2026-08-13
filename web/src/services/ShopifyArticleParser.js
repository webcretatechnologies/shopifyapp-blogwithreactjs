/**
 * ShopifyArticleParser
 * Server-side parser that converts raw Shopify article body_html into
 * structured editor blocks (contentJson) and raw editor HTML.
 *
 * This is the server-side equivalent of the frontend parseHtmlToBlocks,
 * reused across webhook handlers and the import route.
 */
import * as cheerio from "cheerio";

/** A `data-settings` attribute value can itself contain further nested "settings" keys from
 * historical corruption (see _convertDataBlock's docblock). Recursively unwrap before merging
 * so legacy multi-layer content parses correctly, not just single-wrapped content going
 * forward. */
function unwrapNestedSettings(val) {
  let current = val;
  while (current && typeof current === "object" && !Array.isArray(current) && current.settings && typeof current.settings === "object" && !Array.isArray(current.settings)) {
    current = current.settings;
  }
  return current;
}

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

    // Strip the injected view-tracking block (ArticleSyncService's analytics pixel + script,
    // delimited by BLOG_ANALYTICS_START/END comments) before cheerio ever sees it — it's app
    // infrastructure injected at push time, never merchant content. Without this, its tracking
    // <img> tag (a 1x1 pixel pointing at /track/view.gif) gets walked like any other <img> and
    // reconstructed as a real, user-editable Image block, which then persists in contentJson/
    // contentHtml and shows up as junk "Image" blocks in the builder — worse, it then survives
    // into the NEXT sync's output too, compounding on every subsequent echo/reconcile cycle.
    const withoutTracking = html.replace(/<!--\s*BLOG_ANALYTICS_START\s*-->[\s\S]*?<!--\s*BLOG_ANALYTICS_END\s*-->/g, "");

    const $ = cheerio.load(withoutTracking, null, false);

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
      let dataType = $el.attr("data-type");
      if (!dataType) {
        if ($el.hasClass("builder-faq-block") || $el.find("details.builder-faq-item").length > 0) {
          dataType = "FaqBlock";
        } else if ($el.hasClass("sp-toc-block") || $el.hasClass("sp-toc-details") || $el.find(".sp-toc-block, .sp-toc-details").length > 0) {
          dataType = "TableOfContents";
        } else if ($el.hasClass("builder-richtext-wrapper")) {
          dataType = "RichText";
        } else if ($el.hasClass("builder-section")) {
          dataType = "Section";
        } else if ($el.hasClass("builder-column-layout")) {
          dataType = "ColumnLayout";
        } else if ($el.hasClass("builder-column")) {
          dataType = "Column";
        } else if ($el.hasClass("builder-divider") || node.tagName?.toLowerCase() === "hr") {
          dataType = "Divider";
        } else if ($el.hasClass("builder-spacer")) {
          dataType = "Spacer";
        } else if ($el.hasClass("builder-callout")) {
          dataType = "Callout";
        } else if ($el.hasClass("builder-image-block")) {
          dataType = "Image";
        } else if ($el.hasClass("builder-video-embed")) {
          dataType = "VideoEmbed";
        } else if ($el.hasClass("builder-button-block")) {
          dataType = "ButtonBlock";
        } else if ($el.hasClass("builder-collection-block")) {
          dataType = "Collection";
        } else if ($el.hasClass("builder-product-slider")) {
          dataType = "ProductSlider";
        } else if ($el.hasClass("builder-product-grid")) {
          dataType = "ProductGrid";
        } else if ($el.hasClass("builder-product-card")) {
          dataType = "ProductCard";
        } else if ($el.hasClass("builder-cta-button")) {
          dataType = "CTAButton";
        } else if ($el.hasClass("builder-hero-section")) {
          dataType = "HeroSection";
        } else if ($el.hasClass("builder-buy-button")) {
          dataType = "BuyButton";
        } else if ($el.hasClass("builder-table-block")) {
          dataType = "Table";
        } else if ($el.hasClass("builder-heading-block")) {
          dataType = "Heading";
        } else if ($el.hasClass("builder-html-block") || $el.hasClass("custom-html-block")) {
          dataType = "Html";
        }
      }

      if (dataType) {
        const block = this._convertDataBlock($el, dataType, $);
        if (block) {
          // If fallback parsed block needs structure parsed manually (e.g. data-type attr was missing/stripped)
          if (!$el.attr("data-type")) {
            block.settings = ShopifyArticleParser._parseFallbackSettings($el, block.type, $);
          }

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
            settings: { src, alt: $el.attr("alt") || "", width: this._extractImageWidth($el), alignment: "center" },
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
              width: this._extractImageWidth($img),
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
    const $container = $("body").length > 0 ? $("body") : $.root();
    $container.contents().each((_, el) => processNode(el, blocks));

    // If no blocks were found, create a single empty RichText block — the current builder
    // schema ({ type, settings: {...} }), not the old pre-builder legacy shape
    // ({ type: "text", data, isHtml }) this used to emit. That legacy shape isn't renderable by
    // the current builder, and callers like import.js's own "no blocks" fallback couldn't catch
    // it either, since blocks.length was 1 (just the wrong shape), not 0.
    if (blocks.length === 0) {
      blocks.push({
        id: this._generateId(),
        type: "RichText",
        settings: { content: "" },
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

    // Defense in depth for the view-tracking pixel: the BLOG_ANALYTICS_START/END comment
    // markers are already stripped in parse() before cheerio parses the HTML, but content
    // that was already mis-parsed into a real Image block on a previous (pre-fix) pass no
    // longer has those markers around it at all — it's now indistinguishable from real
    // content except for its src. Catch that case directly so already-polluted content
    // self-heals the next time it round-trips, instead of requiring a manual repair.
    $('img[src*="/track/view.gif"]').remove();

    // The related-posts block (RelatedPostsService.renderRelatedPostsHtml) is app-generated at
    // sync time, same as the tracking pixel and custom-styles block above — it has no data-type
    // attribute (nothing to re-edit), so without this it gets echoed back on webhook reconcile,
    // preserved as real content, and a fresh block gets appended on top of it on the next sync —
    // duplicating (and re-duplicating) indefinitely.
    $(".blogger-related-posts").remove();

    // Byline (author / published date / reading time — EditorContentCompiler.compileForStorefront)
    // and the custom header/footer placeholders (Settings → Advanced) are the same class of
    // app-generated, sync-time-only markup with no data-type to re-edit. Without stripping them
    // here, a webhook reconcile round-trips them into real blocks in the canvas (the byline in
    // particular gets torn into separate "By X" / date / "N min read" text blocks, visible and
    // editable in the builder — confirmed live: this exact pollution is what showed up in the
    // canvas after a sync-back).
    $(".blogger-byline").remove();
    $("[data-custom-header]").remove();
    $("[data-custom-footer]").remove();

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
  static _convertDataBlock($el, dataType, $) {
    const TYPE_MAP = {
      buyButton: "BuyButton",
      buy_button: "BuyButton",
      BuyButton: "BuyButton",
      productGrid: "ProductGrid",
      product_grid: "ProductGrid",
      ProductGrid: "ProductGrid",
      collection: "Collection",
      Collection: "Collection",
      ctaButton: "ButtonBlock",
      cta_button: "ButtonBlock",
      buttonBlock: "ButtonBlock",
      ButtonBlock: "ButtonBlock",
      heroBlock: "HeroSection",
      hero: "HeroSection",
      HeroSection: "HeroSection",
      Hero: "HeroSection",
      videoBlock: "VideoEmbed",
      video: "VideoEmbed",
      VideoEmbed: "VideoEmbed",
      spacerBlock: "Spacer",
      spacer: "Spacer",
      Spacer: "Spacer",
      dividerBlock: "Divider",
      divider: "Divider",
      Divider: "Divider",
      imageBlock: "Image",
      image: "Image",
      Image: "Image",
      product: "ProductCard",
      productCard: "ProductCard",
      ProductCard: "ProductCard",
      product_sidebar: "ProductSidebar",
      featured_product: "FeaturedProduct",
      product_switcher: "ProductSwitcher",
      product_slider: "ProductSlider",
      ProductSlider: "ProductSlider",
      faqBlock: "FaqBlock",
      FaqBlock: "FaqBlock",
      faq: "FaqBlock",
      FAQ: "FaqBlock",
      toc: "TableOfContents",
      tableOfContents: "TableOfContents",
      table_of_contents: "TableOfContents",
      TableOfContents: "TableOfContents",
      RichText: "RichText",
      richtext: "RichText",
      Section: "Section",
      section: "Section",
      ColumnLayout: "ColumnLayout",
      columnLayout: "ColumnLayout",
      column_layout: "ColumnLayout",
      Column: "Column",
      column: "Column",
      Callout: "Callout",
      callout: "Callout",
      calloutBlock: "Callout",
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
      liststyle: "listStyle",
      accentcolor: "accentColor",
      backgroundcolor: "backgroundColor",
      bordercolor: "borderColor",
      paddingtop: "paddingTop",
      paddingbottom: "paddingBottom",
      paddingleft: "paddingLeft",
      paddingright: "paddingRight",
      firstopen: "firstOpen",
      enableschema: "enableSchema",
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
        const camelKey = key.split('-').map((w, i) => i === 0 ? w : w[0].toUpperCase() + w.substring(1)).join('');
        const mappedKey = ATTR_MAP[key] || ATTR_MAP[key.replace(/-/g, "")] || camelKey;
        let val = attr.value;
        if (val === "true") val = true;
        else if (val === "false") val = false;
        else if (val && (val.startsWith("{") || val.startsWith("["))) {
          try { val = JSON.parse(val); } catch (e) { /* keep string */ }
        } else if (!isNaN(val) && val.trim() !== "" && key === "overlayopacity") {
          val = parseFloat(val);
        }
        block.settings = block.settings || {};
        // A literal `data-settings` attribute IS the block's settings object, never a normal
        // field named "settings" — merge its own fields directly instead of nesting it under
        // a "settings" key. Without this, a round trip (sync -> Shopify echo -> reconcile)
        // wraps the real settings in an extra layer every single time, compounding forever
        // and eventually burying real data (e.g. a Product Slider's product list) so deep the
        // renderer can no longer find it. (Legacy content already affected by this needs a
        // one-time repair; this only stops it from happening again.)
        if (mappedKey === "settings" && val && typeof val === "object" && !Array.isArray(val)) {
          Object.assign(block.settings, unwrapNestedSettings(val));
        } else {
          block.settings[mappedKey] = val;
        }
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
      // Every block this parser produces uses the current builder schema (capitalized types,
      // e.g. "RichText"/"Heading"/"Image") — reconstruct as div[data-type] wrappers.
      html += this._blockToDataHtml(block);
    }
    return html;
  }

  /**
   * Convert a single app block back to its div[data-type] wrapper HTML. Mirrors
   * `injectBlockIdentity()` in the frontend's compileBlocksToHtml.js: flattens the block's own
   * `settings` fields into individual `data-<kebab-key>` attributes, one per field.
   *
   * This function previously JSON-stringified the ENTIRE `settings` object into a single
   * `data-settings="{...}"` attribute instead of flattening it — since `settings` was iterated
   * as just another top-level key on `block` alongside `id`/`type`/`children`, not recognized
   * as the object whose OWN fields need serializing. That produced two compounding bugs on
   * every echo/reconcile cycle that ran this function: (1) the real settings got buried one
   * layer deeper each time content round-tripped through here (a `data-settings` attribute
   * parses back as a single nested key, not flat fields — see EditorContentCompiler.compile()
   * and _convertDataBlock's own unwrapping fixes for the corresponding parse-side half of this),
   * and (2) leaf content blocks (Heading/RichText/Image/...) had no matching case in this
   * function's siblings, so they always fell into this generic path and rendered as an empty
   * self-closing `<div></div>` with no visible content at all.
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

    const settings = (block.settings && typeof block.settings === "object" && !Array.isArray(block.settings))
      ? block.settings
      : {};
    const skipKeys = ["content", "code", "tableData", "settings"];
    for (const [key, value] of Object.entries(settings)) {
      if (skipKeys.includes(key)) continue;
      if (value === null || value === undefined) continue;
      const attrName = REVERSE_ATTR_MAP[key] || key.replace(/([A-Z])/g, "-$1").toLowerCase();
      let val = value;
      if (typeof val === "boolean") {
        val = val ? "true" : "false";
      } else if (typeof val === "object") {
        try { val = JSON.stringify(val); } catch (e) { continue; }
      }
      attrs += ` data-${attrName}="${String(val).replace(/"/g, "&quot;")}"`;
    }
    // content/code/tableData are large/free-form — keep as data-* too (matches
    // injectBlockIdentity's own skipKeys carve-out of the SAME three fields, which stores
    // them as regular attributes rather than excluding them outright), so RichText/Html/
    // Table blocks still round-trip their actual content.
    for (const key of ["content", "code", "tableData"]) {
      const val = settings[key];
      if (val === null || val === undefined || val === "") continue;
      const attrName = key.replace(/([A-Z])/g, "-$1").toLowerCase();
      const serialized = typeof val === "object" ? JSON.stringify(val) : String(val);
      attrs += ` data-${attrName}="${serialized.replace(/"/g, "&quot;")}"`;
    }

    const innerHtml = Array.isArray(block.children) && block.children.length > 0
      ? this._blocksToRawHtml(block.children)
      : "";

    return `<div ${attrs}>${innerHtml}</div>`;
  }

  static _parseFallbackSettings($el, blockType, $) {
    const settings = {};
    const style = $el.attr("style") || "";

    const parseStyle = (property) => {
      const regex = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i');
      const match = style.match(regex);
      return match ? match[1].trim() : "";
    };

    switch (blockType) {
      case "Heading": {
        settings.text = $el.text()?.trim() || "";
        const tag = $el.get(0)?.tagName?.toLowerCase() || "h2";
        settings.level = parseInt(tag.replace("h", ""), 10) || 2;
        settings.align = parseStyle("text-align") || "left";
        settings.color = parseStyle("color") || "#202223";
        const fs = parseStyle("font-size");
        if (fs) settings.fontSize = fs;
        break;
      }
      case "RichText": {
        settings.content = $el.html() || "";
        break;
      }
      case "Section": {
        settings.backgroundColor = parseStyle("background-color") || "transparent";
        settings.maxWidth = parseStyle("max-width") || "100%";
        settings.borderRadius = parseStyle("border-radius") || "0px";
        const padding = parseStyle("padding") || "";
        if (padding) {
          const parts = padding.split(/\s+/);
          if (parts.length === 1) {
            settings.paddingTop = settings.paddingBottom = settings.paddingLeft = settings.paddingRight = parts[0];
          } else if (parts.length === 2) {
            settings.paddingTop = settings.paddingBottom = parts[0];
            settings.paddingLeft = settings.paddingRight = parts[1];
          } else if (parts.length === 4) {
            settings.paddingTop = parts[0];
            settings.paddingRight = parts[1];
            settings.paddingBottom = parts[2];
            settings.paddingLeft = parts[3];
          }
        }
        break;
      }
      case "ColumnLayout": {
        settings.gap = parseStyle("gap") || "16px";
        break;
      }
      case "Divider": {
        const hr = $el.is("hr") ? $el : $el.find("hr").first();
        const hrStyle = hr.attr("style") || "";
        const parseHrStyle = (property) => {
          const regex = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i');
          const match = hrStyle.match(regex);
          return match ? match[1].trim() : "";
        };
        const borderTop = parseHrStyle("border-top") || "";
        if (borderTop) {
          const parts = borderTop.split(/\s+/);
          if (parts.length >= 3) {
            settings.thickness = parts[0];
            settings.style = parts[1];
            settings.color = parts.slice(2).join(" ");
          }
        }
        settings.width = parseHrStyle("width") || "100%";
        break;
      }
      case "Spacer": {
        settings.height = parseStyle("height") || "40px";
        break;
      }
      case "Callout": {
        settings.backgroundColor = parseStyle("background-color") || "#fdfbc8";
        const borderLeft = parseStyle("border-left") || "";
        if (borderLeft) {
          const parts = borderLeft.split(/\s+/);
          settings.borderColor = parts.length >= 3 ? parts.slice(2).join(" ") : "";
        }
        settings.emoji = $el.find("span").first().text()?.trim() || "💡";
        settings.title = $el.find("strong").first().text()?.trim() || "";
        settings.body = $el.find("span").eq(1).text()?.trim() || $el.find("div span").text()?.trim() || "";
        break;
      }
      case "Image": {
        const img = $el.find("img").first();
        settings.src = img.attr("src") || "";
        settings.alt = img.attr("alt") || "";
        settings.width = img.css("width") || "100%";
        settings.height = img.css("height") || "auto";
        settings.align = parseStyle("text-align") || "center";
        settings.caption = $el.find("p").first().text()?.trim() || "";
        settings.linkUrl = $el.find("a").first().attr("href") || "";
        break;
      }
      case "VideoEmbed": {
        const iframe = $el.find("iframe").first();
        settings.url = iframe.attr("src") || "";
        settings.maxWidth = parseStyle("max-width") || "100%";
        break;
      }
      case "ButtonBlock":
      case "CTAButton": {
        const a = $el.find("a").first();
        const aStyle = a.attr("style") || "";
        const parseAStyle = (property) => {
          const regex = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i');
          const match = aStyle.match(regex);
          return match ? match[1].trim() : "";
        };
        settings.text = a.text()?.trim() || "Click Here";
        settings.url = a.attr("href") || "#";
        settings.alignment = parseStyle("text-align") || "center";
        settings.backgroundColor = parseAStyle("background-color") || "#008060";
        settings.textColor = parseAStyle("color") || "#ffffff";
        settings.borderRadius = parseInt(parseAStyle("border-radius"), 10) || 6;
        break;
      }
      case "FaqBlock": {
        settings.title = $el.find("h2").first().text()?.trim() || "";
        settings.layout = $el.find("details.builder-faq-item").length > 0 ? "accordion" : "grid";
        settings.items = [];
        if (settings.layout === "accordion") {
          $el.find("details.builder-faq-item").each((_, details) => {
            const $det = $(details);
            const question = $det.find(".faq-question-text").first().text()?.trim() || $det.find("summary").first().text()?.trim() || "";
            const answer = $det.find("div p").first().html()?.trim() || $det.find("p").first().html()?.trim() || "";
            settings.items.push({ question, answer });
          });
        } else {
          $el.find("div[style*='background-color']").each((_, itemEl) => {
            const $item = $(itemEl);
            const question = $item.find("h4").first().text()?.trim() || "";
            const answer = $item.find("p").first().html()?.trim() || "";
            if (question || answer) {
              settings.items.push({ question, answer });
            }
          });
        }
        break;
      }
      case "TableOfContents": {
        const isDetails = $el.hasClass("sp-toc-details") || $el.is("details");
        const $tocContainer = isDetails ? $el : $el.find(".sp-toc-block, .sp-toc-details").first();
        settings.title = $tocContainer.find("summary, div").first().text()?.trim() || "Table of Contents";
        settings.collapsible = isDetails;
        settings.listStyle = $tocContainer.find("ol").length > 0 ? "numbered" : "bullet";
        settings.levels = [2, 3];
        break;
      }
      case "Html": {
        settings.code = $el.html() || "";
        break;
      }
      case "Table": {
        const tableData = [];
        $el.find("tr").each((_, tr) => {
          const row = [];
          $(tr).find("th, td").each((_, td) => {
            row.push($(td).text()?.trim() || "");
          });
          if (row.length) tableData.push(row);
        });
        settings.tableData = tableData.length ? tableData : [];
        settings.hasHeader = $el.find("thead").length > 0;
        break;
      }
      case "HeroSection": {
        settings.heading = $el.find("h1").first().text()?.trim() || "";
        settings.subheading = $el.find("p").first().text()?.trim() || "";
        settings.textColor = parseStyle("color") || "#ffffff";
        settings.minHeight = parseStyle("min-height") || "360px";
        const bgImgStyle = parseStyle("background-image") || "";
        if (bgImgStyle && bgImgStyle.includes("url(")) {
          const match = bgImgStyle.match(/url\(['"]?([^'"]+)['"]?\)/);
          settings.backgroundImage = match ? match[1] : "";
        }
        const a = $el.find("a").first();
        settings.showCta = a.length > 0;
        if (settings.showCta) {
          settings.ctaText = a.text()?.trim() || "";
          settings.ctaUrl = a.attr("href") || "";
          const aStyle = a.attr("style") || "";
          const parseAStyle = (property) => {
            const regex = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i');
            const match = aStyle.match(regex);
            return match ? match[1].trim() : "";
          };
          settings.ctaColor = parseAStyle("background") || parseAStyle("background-color") || "#008060";
          settings.ctaTextColor = parseAStyle("color") || "#ffffff";
        }
        break;
      }
      case "Collection":
      case "ProductSlider":
      case "ProductGrid": {
        settings.title = $el.find("h3").first().text()?.trim() || "";
        settings.heading = settings.title;
        settings.manualProducts = [];
        $el.find("div[style*='border']").each((_, pEl) => {
          const $p = $(pEl);
          const title = $p.find("h4").first().text()?.trim() || "";
          const imageUrl = $p.find("img").first().attr("src") || "";
          const price = $p.find("p").first().text()?.trim() || "";
          if (title || imageUrl) {
            settings.manualProducts.push({
              title,
              image: imageUrl,
              price: price.replace(/[₹$]/g, "")
            });
          }
        });
        break;
      }
      case "ProductCard": {
        settings.title = $el.find("h4").first().text()?.trim() || "";
        settings.price = $el.find("p").first().text()?.trim() || "";
        settings.imageUrl = $el.find("img").first().attr("src") || "";
        break;
      }
      case "BuyButton": {
        const title = $el.find("h4").first().text()?.trim() || "";
        const price = $el.find("p").first().text()?.trim() || "";
        const image = $el.find("img").first().attr("src") || "";
        settings.product = {
          title,
          price: price.replace(/[₹$]/g, ""),
          image
        };
        break;
      }
    }
    return settings;
  }

  static _generateId() {
    return `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Reads an <img>'s actual rendered size from the source HTML (inline style width, then the
   * width HTML attribute, then a parent wrapper's width style) instead of assuming full width.
   * Without this, an image the merchant deliberately sized small in Shopify's native editor
   * (via its own resize handles, which write a `width` attribute or inline style) gets imported
   * as a full-width Image block — visually "the image became huge" even though nothing about
   * the image itself changed, only its display size was dropped during parsing.
   */
  static _extractImageWidth($el) {
    const style = $el.attr("style") || "";
    const styleMatch = style.match(/(?:^|;)\s*width\s*:\s*([^;]+)/i);
    if (styleMatch) return styleMatch[1].trim();

    const widthAttr = $el.attr("width");
    if (widthAttr && /^\d+(\.\d+)?$/.test(widthAttr.trim())) {
      return `${widthAttr.trim()}px`;
    }

    const $parent = $el.parent();
    if ($parent.length) {
      const parentStyle = $parent.attr("style") || "";
      const parentMatch = parentStyle.match(/(?:^|;)\s*width\s*:\s*([^;]+)/i);
      if (parentMatch) return parentMatch[1].trim();
    }

    return "100%";
  }
}

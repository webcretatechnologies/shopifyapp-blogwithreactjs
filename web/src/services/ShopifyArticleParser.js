/**
 * ShopifyArticleParser
 * Server-side parser that converts raw Shopify article body_html into
 * structured editor blocks (contentJson) and raw editor HTML.
 *
 * This is the server-side equivalent of the frontend parseHtmlToBlocks,
 * reused across webhook handlers and the import route.
 */
import * as cheerio from "cheerio";

// Mirrors EditorContentCompiler.js's own VISIBILITY_CSS constant exactly — kept as a separate
// copy (not imported) since this module has no dependency on EditorContentCompiler.js and
// shouldn't gain one just for this. Emitted once by _blocksToRawHtml() whenever any block in the
// tree carries a hide-on-device flag.
const VISIBILITY_CSS = `<style>
  @media (max-width: 767px)  { .builder-hide-mobile  { display: none !important; } }
  @media (min-width: 768px) and (max-width: 1023px) { .builder-hide-tablet  { display: none !important; } }
  @media (min-width: 1024px) { .builder-hide-desktop { display: none !important; } }
</style>`;

function hasVisibilityFlags(blocks) {
  if (!Array.isArray(blocks)) return false;
  for (const b of blocks) {
    const s = b.settings || {};
    if (s.hideOnMobile || s.hideOnTablet || s.hideOnDesktop) return true;
    if (b.children?.length && hasVisibilityFlags(b.children)) return true;
  }
  return false;
}

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

/** RichText content picks up an extra `<div class="builder-richtext-wrapper">` layer on every
 * Save & Sync -> Shopify echo -> reconcile round trip (EditorContentCompiler.renderRichText
 * always adds one wrapper; parsing here only ever stripped the single outermost one, so a
 * remaining inner layer from a prior cycle was never removed). Left unchecked this compounds
 * indefinitely — each layer is a real nested <div>, and Shopify's own admin article editor
 * renders each one with its own block spacing, so an article edited back and forth a few times
 * shows large, ever-growing blank gaps. Strip every wrapper layer, not just one, mirroring the
 * `unwrapNestedSettings` precedent above for the same class of compounding bug. */
function unwrapRichTextContent(html) {
  if (!html || typeof html !== "string") return html;
  let current = html.trim();
  const wrapperRe = /^<div class="builder-richtext-wrapper">([\s\S]*)<\/div>$/;
  let match = wrapperRe.exec(current);
  while (match) {
    current = match[1].trim();
    match = wrapperRe.exec(current);
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

      // Hide-on-device wrapper divs (builder-hide-mobile/tablet/desktop) MUST be recognized and
      // unwrapped here, before ANY class-based type-detection heuristic below runs — several of
      // those heuristics (TableOfContents, FaqBlock) match via $el.find(...) — a DESCENDANT
      // search — not just $el.hasClass(...). A hide-wrapper div necessarily CONTAINS the block
      // it's hiding, so it satisfies that find() check too, misclassifying the wrapper itself as
      // the inner block and completely bypassing the hide-flag recovery a few lines below
      // (dataType would already be truthy, so that logic's own `if (!dataType)` branch never
      // runs). This is why hiding a Heading (detected purely via hasClass, self-match only —
      // never mistakenly matches a wrapper) survived reconciliation fine, while hiding a TOC or
      // FAQ block did not.
      if (tagName === "div") {
        const hideFlags = {};
        if ($el.hasClass("builder-hide-mobile")) hideFlags.hideOnMobile = true;
        if ($el.hasClass("builder-hide-tablet")) hideFlags.hideOnTablet = true;
        if ($el.hasClass("builder-hide-desktop")) hideFlags.hideOnDesktop = true;
        if (Object.keys(hideFlags).length > 0 && $el.children().length > 0) {
          const wrappedBlocks = [];
          $el.contents().each((_, child) => processNode(child, wrappedBlocks));
          wrappedBlocks.forEach((b) => {
            b.settings = { ...(b.settings || {}), ...hideFlags };
          });
          currentBlocksArray.push(...wrappedBlocks);
          return;
        }
      }

      // 1. Check for app block wrappers (div[data-type] or h2[data-type] etc)
      let dataType = $el.attr("data-type");
      if (!dataType) {
        // Self-match (hasClass) checks ONLY here — every one of these can only ever match the
        // element itself, never a container that merely contains one of these somewhere inside
        // it, so ordering among them doesn't matter and none can misfire on an ancestor.
        // FaqBlock/TableOfContents's OWN descendant-based (.find()) fallback is handled in a
        // SEPARATE, LATER pass below — deliberately demoted to last resort, after every
        // self-match (including Section/ColumnLayout/Column) has already had a chance to match.
        // Checking it here, ahead of the container checks, misclassified any Section/Column/
        // ColumnLayout that simply contains an FAQ or TOC block ANYWHERE inside it — an ordinary
        // authoring pattern — as an FAQ/TOC block itself, collapsing the container's own settings
        // and any other sibling children the moment Shopify's echo strips data-type attributes.
        if ($el.hasClass("builder-faq-block")) {
          dataType = "FaqBlock";
        } else if ($el.hasClass("sp-toc-block") || $el.hasClass("sp-toc-details")) {
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
        } else if ($el.find("details.builder-faq-item").length > 0) {
          dataType = "FaqBlock";
        } else if ($el.find(".sp-toc-block, .sp-toc-details").length > 0) {
          dataType = "TableOfContents";
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
          // Device-visibility wrapper (compileBlocksToHtml.js's applyVisibilityWrapper /
          // ShopifyArticleParser's own _blockToDataHtml): <div class="builder-hide-desktop">
          // <div data-type="...">...</div></div>. This class is the ONLY thing that survives a
          // real Shopify round trip — Shopify strips data-* attributes from body_html on save
          // (confirmed empirically: a synced article's data-hide-on-desktop is gone even though
          // the CSS class is not), so hideOnDesktop can no longer be read back from the inner
          // block's own attributes the way every other setting is. Capture it here, on the
          // wrapper, before it's discarded by this recursion, and stamp it onto whatever block(s)
          // the recursion below produces — normally exactly one, since that's all this wrapper
          // ever contains.
          const hideFlags = {};
          if ($el.hasClass("builder-hide-mobile")) hideFlags.hideOnMobile = true;
          if ($el.hasClass("builder-hide-tablet")) hideFlags.hideOnTablet = true;
          if ($el.hasClass("builder-hide-desktop")) hideFlags.hideOnDesktop = true;

          if (Object.keys(hideFlags).length > 0) {
            const wrappedBlocks = [];
            $el.contents().each((_, child) => processNode(child, wrappedBlocks));
            wrappedBlocks.forEach((b) => {
              b.settings = { ...(b.settings || {}), ...hideFlags };
            });
            currentBlocksArray.push(...wrappedBlocks);
            return;
          }

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
    // Shopify's own admin blog article editor normalizes any empty block-level element (a <div>
    // or <p> with no visible content) into e.g. <div><br></div> when a merchant saves an article
    // there directly — a real DOM node with a real line-height, not just leftover whitespace.
    // Confirmed live: this is exactly what turned three genuinely-empty app placeholder divs
    // (related posts / custom footer / branding badge — all legitimately empty until their JS
    // fetch runs) into a large visible blank gap on the storefront after nothing more than a
    // plain Shopify-side save with no merchant content change at all. Collapse these back to
    // truly empty (whatever is/isn't identified as app infrastructure below still gets removed
    // the same way either way) before any other rule looks at them.
    $("div, p").each((_, el) => {
      const $el = $(el);
      if ($el.children().length === 1 && $el.children().first().is("br") && !$el.text().trim()) {
        $el.empty();
      }
    });

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
    // Class selectors alongside data-* ones: Shopify's own admin blog article editor strips
    // unrecognized data-* attributes when a merchant saves an article directly there (confirmed
    // live), so the data-* selector alone stops matching after any Shopify-side save — the class
    // is what survives and keeps these identifiable as app infrastructure instead of leaking into
    // the builder as real, editable blocks.
    $("[data-custom-header], .blogger-custom-header").remove();
    $("[data-custom-footer], .blogger-custom-footer").remove();

    // "Powered by Blogger" badge (ArticleSyncService.buildStorefrontHtmlForPost) — same class of
    // app-generated, sync-time-only markup as the byline above, and the same live bug: originally
    // shipped with no class/id/attribute at all, so it round-tripped into a real, editable,
    // deletable block with nothing distinguishing it from merchant content. Now marked with
    // .blogger-powered-by-badge specifically so it can be excluded here.
    $(".blogger-powered-by-badge").remove();

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
      block.settings.content = unwrapRichTextContent($el.html() || "");
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
  static _blocksToRawHtml(blocks, isTopLevel = true) {
    if (!blocks || blocks.length === 0) return "";

    let html = "";
    for (const block of blocks) {
      // Every block this parser produces uses the current builder schema (capitalized types,
      // e.g. "RichText"/"Heading"/"Image") — reconstruct as div[data-type] wrappers.
      html += this._blockToDataHtml(block);
    }
    // Prepended once at the top level only (never on recursive nested calls for a block's own
    // children, which would emit a redundant copy per nesting level) — mirrors
    // compileBlocksToHtml.js's own compileBlocksToHtml() doing the same at its single entry
    // point. Without this, every webhook echo / reconcile cycle that runs this function (the
    // ONLY code path that regenerates contentHtml on that round trip) silently drops the CSS
    // rule that makes hide-on-device flags do anything — the wrapper div and its class survive
    // (added below in _blockToDataHtml), but with no matching rule they have no effect, so a
    // block hidden on desktop/mobile/tablet quietly becomes visible again on the very next sync.
    if (isTopLevel && hasVisibilityFlags(blocks)) {
      html = VISIBILITY_CSS + html;
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
      ? this._blocksToRawHtml(block.children, false)
      : "";

    const blockHtml = `<div ${attrs}>${innerHtml}</div>`;

    // Mirrors compileBlocksToHtml.js's applyVisibilityWrapper() — wraps the block in a hide-on-
    // device class div matching the VISIBILITY_CSS rule prepended once at the top of the tree.
    const visClasses = [];
    if (settings.hideOnMobile) visClasses.push("builder-hide-mobile");
    if (settings.hideOnTablet) visClasses.push("builder-hide-tablet");
    if (settings.hideOnDesktop) visClasses.push("builder-hide-desktop");
    if (visClasses.length === 0) return blockHtml;
    return `<div class="${visClasses.join(" ")}">${blockHtml}</div>`;
  }

  // Recovers the presentation settings (button color/text/radius, card style, price/button
  // visibility, title alignment) for Collection/ProductSlider/ProductGrid from the exact markup
  // shapes EditorContentCompiler.renderProductSlider/renderProductGrid/renderCollection produce —
  // every card in those three uses the identical card/button/price structure, so one shared
  // extraction covers all three. Falls back to each field's own compiler default when a value
  // can't be found (e.g. the block currently has zero products, so there's no card to read from),
  // matching the same default the block would fall back to on re-edit anyway.
  static _extractProductBlockStyle($el, $) {
    const settings = {};

    const $titleEl = $el.find("h3").first();
    if ($titleEl.length) {
      const titleAlign = ($titleEl.attr("style") || "").match(/text-align:\s*([^;]+)/)?.[1]?.trim();
      settings.titleAlign = titleAlign || "left";
    }

    const $button = $el.find('form[action="/cart/add"] button').first();
    settings.showButton = $button.length > 0;
    if ($button.length) {
      const btnStyle = $button.attr("style") || "";
      const bg = btnStyle.match(/background:\s*([^;]+)/)?.[1]?.trim();
      const radius = btnStyle.match(/border-radius:\s*(\d+)px/)?.[1];
      if (bg) settings.buttonColor = bg;
      if (radius) settings.buttonRadius = parseInt(radius, 10);
      const text = $button.text()?.trim();
      if (text) settings.buttonText = text;
    }

    const $price = $el.find("div[style*='--blogger-primary-color']").first();
    settings.showPrice = $price.length > 0;

    // Card style is a preset (shadow/border/minimal) baked into the card wrapper's own inline
    // style — matched by the distinguishing declaration each preset is the only one to use.
    const $cardWrapper = $el.find("div[style*='border-radius'], div[style*='padding: 4px']").filter((_, cEl) => {
      const s = $(cEl).attr("style") || "";
      return s.includes("box-shadow") || (s.includes("border:") && s.includes("#e1e3e5")) || s.trim() === "padding: 4px;";
    }).first();
    const cardStyleAttr = $cardWrapper.attr("style") || "";
    if (cardStyleAttr.includes("box-shadow")) settings.cardStyle = "shadow";
    else if (cardStyleAttr.includes("border:")) settings.cardStyle = "border";
    else if (cardStyleAttr.trim() === "padding: 4px;") settings.cardStyle = "minimal";

    // Gap is only present on ProductSlider's horizontal scroll track, not ProductGrid/Collection
    // (which use a CSS grid with no equivalent single-value gap in this markup) — harmless to
    // look for unconditionally since it just won't match on those two.
    const gapMatch = $el.find(".shopify-blog-product-slider").first().attr("style")?.match(/gap:\s*([^;]+)/);
    if (gapMatch) settings.gap = gapMatch[1].trim();

    return settings;
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
        // The height may sit on this element itself, or on an inner div when the block came back
        // wrapped in EditorContentCompiler's identity/class wrapper (which carries no style of
        // its own) — without the inner lookup every round-tripped spacer silently reset to 40px.
        settings.height =
          parseStyle("height") ||
          $el.find("div[style*='height']").first().attr("style")?.match(/height:\s*([^;]+)/)?.[1]?.trim() ||
          "40px";
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
      case "Collection": {
        // A Collection block fetches its products LIVE by handle on every render — the handle is
        // encoded as a second class on the wrapper (see EditorContentCompiler's identity-wrap
        // step) specifically so a round trip can restore the real live-collection block instead
        // of freezing it into a static product snapshot from whatever was in stock at sync time.
        const handleClass = ($el.attr("class") || "")
          .split(/\s+/)
          .find((c) => c.startsWith("builder-collection-handle--"));
        if (handleClass) {
          settings.collectionHandle = decodeURIComponent(handleClass.replace("builder-collection-handle--", ""));
          settings.heading = $el.find("h3").first().text()?.trim() || "";
          settings.title = settings.heading;
          Object.assign(settings, ShopifyArticleParser._extractProductBlockStyle($el, $));
          break;
        }
        // No handle recoverable (e.g. the block had never been given a collection, or predates
        // this class) — fall through to the same rendered-markup recovery ProductSlider/
        // ProductGrid use, so at least the products visible at sync time aren't lost entirely.
      }
      // eslint-disable-next-line no-fallthrough
      case "ProductSlider":
      case "ProductGrid": {
        settings.title = settings.title || $el.find("h3").first().text()?.trim() || "";
        settings.heading = settings.heading || settings.title;
        settings.manualProducts = [];

        // Presentation settings (button color/text/radius, card style, price/button visibility,
        // title alignment, gap) — previously never recovered here, so every one of these silently
        // reset to its default the moment a slider/grid round-tripped through Shopify: a custom
        // black "Add to Cart" button came back Shopify-green (#008060), a bordered/minimal card
        // style came back as the default drop-shadow style, etc. The structure survived (after
        // the earlier fix) but every visual customization was being discarded on top of it.
        Object.assign(settings, ShopifyArticleParser._extractProductBlockStyle($el, $));

        // Anchored on the product links every rendered card contains, NOT on h4/p tags.
        // EditorContentCompiler renders each card's title as an <a> inside a styled <div> and its
        // price as a styled <div> — never h4/p — so the old lookup matched nothing and the block
        // came back with zero products even when it was correctly recognized as a slider. The
        // legacy h4/p shape is still handled as a fallback further below.
        const seenHandles = new Set();
        $el.find('a[href*="/products/"]').each((_, aEl) => {
          const $a = $(aEl);
          const href = $a.attr("href") || "";
          const handle = href.split("/products/")[1]?.split(/[?#]/)[0];
          if (!handle || seenHandles.has(handle)) return;
          seenHandles.add(handle);

          // Climb to the card container — the nearest ancestor holding both the image and a
          // product link — so title/price/variant lookups stay scoped to this one product
          // instead of picking up the next card's values.
          let $card = $a.parent();
          for (let i = 0; i < 6 && $card.length; i++) {
            if ($card.find("img").length > 0 && $card.find('a[href*="/products/"]').length > 0) break;
            $card = $card.parent();
          }
          if (!$card.length) $card = $a.parent();

          let title = "";
          $card.find(`a[href*="/products/${handle}"]`).each((_, t) => {
            const txt = $(t).text()?.trim();
            if (txt && !title) title = txt;
          });
          const $img = $card.find("img").first();
          if (!title) title = $img.attr("alt") || "";

          const price =
            $card.find("div[style*='--blogger-primary-color']").first().text()?.trim() ||
            $card.find("p").first().text()?.trim() ||
            "";
          const variantId = $card.find('input[name="id"]').first().attr("value") || "";

          if (title || $img.attr("src")) {
            settings.manualProducts.push({
              title,
              handle,
              image: $img.attr("src") || "",
              price: price.replace(/[₹$]/g, "").trim(),
              ...(variantId ? { variantId } : {}),
            });
          }
        });

        // Legacy shape: older compiled markup used an h4 title + p price with no product links.
        if (settings.manualProducts.length === 0) {
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
        }
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

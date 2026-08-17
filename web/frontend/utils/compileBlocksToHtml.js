/**
 * compileBlocksToHtml.js
 *
 * Compiles the Builder AST array into a single clean, responsive,
 * SEO-optimized HTML string.
 *
 * Visibility / hide-on-device:
 *   Blocks with settings.hideOnMobile / hideOnTablet / hideOnDesktop are
 *   wrapped in a <div> carrying a CSS class and compileBlocksToHtml() prepends
 *   a <style> block with the corresponding @media rules. The <style> is emitted
 *   once, not once-per-block, so output size is O(1) regardless of how many
 *   blocks use the feature. Blocks with no visibility flags are unchanged.
 */

import { generateHTML } from "@tiptap/html";
import { builderRichTextExtensions } from "../components/editor/richTextExtensions";
import { formatPrice } from "./priceUtils";
import { extractHeadingsFromAst, injectHeadingIdsToHtml } from "./headingSlugUtils.js";

/**
 * CSS emitted once at the top of compiled output when at least one block
 * has a visibility flag set. Breakpoints match the editor's device preview
 * (mobile ≤767px, tablet 768-1023px, desktop ≥1024px).
 */
const VISIBILITY_CSS = `<style>
  @media (max-width: 767px)  { .builder-hide-mobile  { display: none !important; } }
  @media (min-width: 768px) and (max-width: 1023px) { .builder-hide-tablet  { display: none !important; } }
  @media (min-width: 1024px) { .builder-hide-desktop { display: none !important; } }
</style>`;

/**
 * Wraps a compiled block's HTML string with hide-on-device class wrappers
 * if the block settings require it. Returns the original string untouched
 * if no visibility flags are set (zero overhead for the common case).
 */
function applyVisibilityWrapper(html, settings = {}) {
  if (!html) return html;
  const classes = [];
  if (settings.hideOnMobile)  classes.push("builder-hide-mobile");
  if (settings.hideOnTablet)  classes.push("builder-hide-tablet");
  if (settings.hideOnDesktop) classes.push("builder-hide-desktop");
  if (classes.length === 0) return html;
  return `<div class="${classes.join(" ")}">${html}</div>`;
}

/**
 * Walk a block AST and return true if any block or child has a hide flag set.
 * Used to decide whether to prepend the VISIBILITY_CSS style block.
 */
function hasVisibilityFlags(blocks) {
  if (!Array.isArray(blocks)) return false;
  for (const b of blocks) {
    const s = b.settings || {};
    if (s.hideOnMobile || s.hideOnTablet || s.hideOnDesktop) return true;
    if (b.children?.length && hasVisibilityFlags(b.children)) return true;
  }
  return false;
}

function injectBlockIdentity(html, block) {
  if (!html) return html;
  
  const trimmedHtml = html.trim();
  const tagRegex = /<([a-zA-Z0-9\-]+)([^>]*)>/g;
  let match;
  let targetIndex = -1;
  let targetTag = "";
  let targetRest = "";

  while ((match = tagRegex.exec(trimmedHtml)) !== null) {
    const tagName = match[1].toLowerCase();
    if (tagName !== "style" && tagName !== "script") {
      targetIndex = match.index;
      targetTag = match[1];
      targetRest = match[2];
      break;
    }
  }

  if (targetIndex === -1) return html;

  let dataAttrs = ` data-type="${block.type}"`;
  
  if (block.settings) {
    // "settings" is never a legitimate field name on a block's own settings object — its
    // presence means upstream data got corrupted (see ShopifyArticleParser._convertDataBlock's
    // docblock for the round-trip bug that used to produce this). Skipping it here is
    // defense-in-depth so a stray nested "settings" key can never be re-emitted as a
    // `data-settings` attribute and re-enter the compounding loop, even if it somehow
    // reappears in stored data before a repair runs.
    const skipKeys = ["content", "code", "tableData", "settings"];
    for (const [key, value] of Object.entries(block.settings)) {
      if (skipKeys.includes(key)) continue;
      if (value === null || value === undefined) continue;

      const kebabKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        const safeVal = String(value).replace(/"/g, '&quot;');
        dataAttrs += ` data-${kebabKey}="${safeVal}"`;
      } else if (typeof value === "object") {
        try {
          const jsonVal = JSON.stringify(value).replace(/"/g, '&quot;');
          dataAttrs += ` data-${kebabKey}="${jsonVal}"`;
        } catch (e) {}
      }
    }
  }

  const prefix = trimmedHtml.slice(0, targetIndex);
  const matchLength = match[0].length;
  const suffix = trimmedHtml.slice(targetIndex + matchLength);

  return prefix + `<${targetTag}${dataAttrs}${targetRest}>` + suffix;
}

export function compileSingleBlockToHtml(block, context = {}) {
  if (!block || !block.type) return "";

  const { type, settings = {}, children = [], id: blockId } = block;

  // Compile the core HTML for this block type, then optionally wrap it
  // in a hide-on-device <div> if any visibility flags are set.
  const html = compileCoreBlockHtml(type, settings, children, blockId, context);
  const identifiedHtml = injectBlockIdentity(html, block);
  return applyVisibilityWrapper(identifiedHtml, settings);
}

function compileCoreBlockHtml(type, settings, children, blockId, context = {}) {
  switch (type) {
    case "TableOfContents": {
      const title = settings.title || "Table of Contents";
      const levels = settings.levels || [2, 3];
      const listStyle = settings.listStyle || "bullet";
      const collapsible = Boolean(settings.collapsible);
      const textColor = settings.textColor || "#202223";

      const allHeadings = context.allHeadings || [];
      const allowedLevels = new Set(levels.map(Number));
      const matchingHeadings = allHeadings.filter((h) => allowedLevels.has(h.level));

      // Matches TableOfContentsPreview.jsx's canvas placeholder exactly — previously this
      // returned "" here, so a merchant who saw the canvas's own "No headings found" explanation
      // while editing then hit Preview and had it silently vanish with zero indication why,
      // looking like the block itself was broken rather than just needing H2/H3 headings to link
      // to. The live storefront compiler (EditorContentCompiler.js) deliberately keeps the silent
      // "" behavior instead — a real customer-facing page shouldn't show internal debug copy.
      if (matchingHeadings.length === 0) {
        return `<div style="padding: 16px 20px; background: #f9fafb; border: 1px dashed #c9cccf; border-radius: 8px; text-align: center; color: #6d7175; margin: 12px 0;">
  <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; color: #202223;">${title}</div>
  <div style="font-size: 13px;">No headings found — add an H2 or H3 to populate this list</div>
</div>`;
      }

      const minLevel = Math.min(...matchingHeadings.map((h) => h.level));

      const buildTocNodes = (headings) => {
        const rootNodes = [];
        const stack = [];
        headings.forEach((h) => {
          const node = { ...h, children: [] };
          while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
            stack.pop();
          }
          if (stack.length === 0) {
            rootNodes.push(node);
          } else {
            stack[stack.length - 1].children.push(node);
          }
          stack.push(node);
        });
        return rootNodes;
      };

      const renderTocNodesHtml = (items, isRoot = true) => {
        if (!items || items.length === 0) return "";
        const Tag = listStyle === "numbered" ? "ol" : "ul";
        const paddingLeft = isRoot ? (listStyle === "numbered" ? "20px" : "18px") : "20px";
        const marginTop = isRoot ? "0" : "6px";
        const marginBottom = isRoot ? "0" : "2px";
        const listType = listStyle === "numbered" ? (isRoot ? "decimal" : "lower-alpha") : (isRoot ? "disc" : "circle");

        // Matches the canvas's onMouseEnter/onMouseLeave underline toggle
        // (TableOfContentsPreview.jsx) — driven inline instead of a sibling <style> block, because
        // Shopify's own admin blog article editor doesn't render/strip raw <style> tags cleanly,
        // leaving a large blank block-height gap in its place when merchants open the post there
        // (the app's own storefront rendering was never affected by the old <style> block — this
        // was purely a Shopify admin-editor display bug).
        const lisHtml = items
          .map((item) => {
            const isMain = item.level === minLevel;
            const clickHandler = `var el=document.getElementById('${item.id}');if(el){el.scrollIntoView({behavior:'smooth',block:'start'});if(history.pushState){history.pushState(null,null,'#${item.id}');}return false;}`;
            const link = `<a href="#${item.id}" onclick="${clickHandler}" onmouseenter="this.style.textDecoration='underline'" onmouseleave="this.style.textDecoration='none'" style="color: ${textColor}; text-decoration: none; font-weight: ${isMain ? '600' : '400'}; transition: color 0.15s ease;">${item.text}</a>`;
            const childrenHtml = item.children && item.children.length > 0
              ? renderTocNodesHtml(item.children, false)
              : "";
            return `<li style="font-size: 14px; margin: 6px 0; display: list-item;">${link}${childrenHtml}</li>`;
          })
          .join("\n");

        return `<${Tag} style="margin: ${marginTop} 0 ${marginBottom} 0; padding-left: ${paddingLeft}; list-style-type: ${listType};">\n${lisHtml}\n</${Tag}>`;
      };

      const tree = buildTocNodes(matchingHeadings);
      const listContentHtml = renderTocNodesHtml(tree, true);

      if (collapsible) {
        // Chevron rotation used to be a [open] CSS selector — now driven by the <details>'
        // ontoggle handler directly, same reasoning as the hover fix above.
        const chevronSvg = `<svg class="toc-chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex-shrink: 0; width: 20px; height: 20px; transition: transform 0.25s ease; color: ${textColor};"><polyline points="5 8 10 13 15 8"/></svg>`;
        const toggleHandler = `var c=this.querySelector('.toc-chevron');if(c){c.style.transform=this.open?'rotate(180deg)':'rotate(0deg)';}`;
        return `<details class="sp-toc-details" open ontoggle="${toggleHandler}" style="padding: 16px 20px; background: #f4f6f8; border: 1px solid #e1e3e5; border-radius: 8px; margin: 16px 0;">
  <summary style="font-weight: 700; font-size: 16px; color: ${textColor}; outline: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; list-style: none; user-select: none; gap: 8px;"><span>${title}</span>${chevronSvg}</summary>
  <div style="margin-top: 12px;">
${listContentHtml}
  </div>
</details>`;
      }

      return `<div class="sp-toc-block" style="padding: 16px 20px; background: #f4f6f8; border: 1px solid #e1e3e5; border-radius: 8px; margin: 16px 0;">
  <div style="font-weight: 700; font-size: 16px; color: ${textColor}; margin-bottom: 12px;">${title}</div>
${listContentHtml}
</div>`;
    }

    case "Heading": {
      const level = settings.level || 2;
      const align = settings.align || "left";
      const color = settings.color || "#202223";
      const text = settings.text || "";
      const fontSize = settings.fontSize ? `font-size: ${settings.fontSize};` : "";
      const blockHeadings = context.headingsByBlockId?.[blockId] || [];
      const idAttr = blockHeadings[0] ? ` id="${blockHeadings[0].id}"` : "";
      return `<h${level}${idAttr} class="builder-heading-block" style="text-align: ${align}; color: ${color}; ${fontSize} margin: 16px 0 8px;">${text}</h${level}>`;
    }

    case "RichText": {
      if (!settings.content) return "";
      let html = "";
      if (typeof settings.content === "string") {
        html = settings.content;
      } else {
        try {
          html = generateHTML(settings.content, builderRichTextExtensions());
        } catch {
          return "";
        }
      }
      // Defensive: strip any pre-existing builder-richtext-wrapper layer(s) already baked into
      // settings.content (legacy/reconciled content) so a fresh wrapper never compounds on top
      // of stale ones — see unwrapRichTextContent in ShopifyArticleParser.js for the full story.
      html = html.trim();
      const wrapperRe = /^<div class="builder-richtext-wrapper">([\s\S]*)<\/div>$/;
      let m = wrapperRe.exec(html);
      while (m) {
        html = m[1].trim();
        m = wrapperRe.exec(html);
      }

      const cleanText = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim();
      const containsMedia = /<(img|iframe|table|video|svg|input|button)/i.test(html);
      if (!cleanText && !containsMedia) return "";

      const blockHeadings = context.headingsByBlockId?.[blockId] || [];
      if (blockHeadings.length > 0) {
        html = injectHeadingIdsToHtml(html, blockHeadings);
      }
      return `<div class="builder-richtext-wrapper">${html}</div>`;
    }

    case "Section": {
      const bg = settings.backgroundColor;
      const pt = settings.paddingTop || "0px";
      const pb = settings.paddingBottom || "0px";
      const pl = settings.paddingLeft || "0px";
      const pr = settings.paddingRight || "0px";
      const maxW = settings.maxWidth || "100%";
      const br = settings.borderRadius || "0px";
      const innerHtml = children.map((child) => compileSingleBlockToHtml(child, context)).join("");
      const bgStyle = bg && bg !== "#ffffff" && bg !== "transparent" ? `background-color: ${bg};` : "";
      return `<section style="${bgStyle} padding: ${pt} ${pr} ${pb} ${pl}; max-width: ${maxW}; border-radius: ${br}; margin: 0 auto 20px; box-sizing: border-box;" class="builder-section">${innerHtml}</section>`;
    }

    case "ColumnLayout": {
      const gap = settings.gap || "16px";
      const innerHtml = children.map((child) => compileSingleBlockToHtml(child, context)).join("");
      return `<div style="display: flex; gap: ${gap}; width: 100%; margin: 16px 0; box-sizing: border-box; align-items: stretch;" class="builder-column-layout">${innerHtml}</div>`;
    }

    case "Column": {
      const innerHtml = children.map((child) => compileSingleBlockToHtml(child, context)).join("");
      return `<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; box-sizing: border-box;" class="builder-column">${innerHtml}</div>`;
    }

    case "Divider": {
      const style = settings.style || "solid";
      const color = settings.color || "#e1e3e5";
      const thickness = settings.thickness || "1px";
      const width = settings.width || "100%";
      const mt = settings.marginTop || "16px";
      const mb = settings.marginBottom || "16px";
      return `<hr class="builder-divider" style="border: none; border-top: ${thickness} ${style} ${color}; width: ${width}; margin: ${mt} auto ${mb};" />`;
    }

    case "Spacer": {
      const height = settings.height || "40px";
      return `<div class="builder-spacer" style="height: ${height}; width: 100%;"></div>`;
    }

    case "Callout": {
      const bg = settings.backgroundColor || "#fdfbc8";
      const border = settings.borderColor || "#eab308";
      const emoji = settings.emoji || "💡";
      const title = settings.title || "";
      const body = settings.body || "";
      return `<div class="builder-callout" style="background-color: ${bg}; border-left: 4px solid ${border}; padding: 16px; border-radius: 6px; display: flex; gap: 12px; align-items: center; margin: 16px 0;">
        <span style="font-size: 24px;">${emoji}</span>
        <div>
          <strong style="display: block; margin-bottom: 4px; color: #202223;">${title}</strong>
          <span style="color: #4a4a4a;">${body}</span>
        </div>
      </div>`;
    }

    case "Image": {
      const src = settings.src || "";
      if (!src) return "";
      const alt = settings.alt || "";
      const width = settings.width || "100%";
      const height = settings.height || "auto";
      const objectFit = settings.objectFit || "cover";
      const align = settings.align || settings.alignment || "center";
      const br = settings.borderRadius || "0px";
      const caption = settings.caption || "";
      const paddingMap = { none: '0', small: '16px', medium: '32px', large: '64px' };
      const padding = paddingMap[settings.padding || 'none'] || '0';
      const shadowMap = { 
        none: 'none', 
        soft: '0 4px 12px rgba(0,0,0,0.1)', 
        medium: '0 8px 24px rgba(0,0,0,0.15)', 
        strong: '0 12px 32px rgba(0,0,0,0.25)' 
      };
      const boxShadow = shadowMap[settings.dropShadow || 'none'] || 'none';

      const imgTag = `<img src="${src}" alt="${alt}" style="max-width: 100%; width: ${width}; height: ${height}; object-fit: ${objectFit}; border-radius: ${br}; box-shadow: ${boxShadow}; display: inline-block;" />`;
      const linkedImg = settings.linkUrl ? `<a href="${settings.linkUrl}" target="${settings.linkTarget || '_self'}" style="display: inline-block;">${imgTag}</a>` : imgTag;

      return `<div class="builder-image-block" style="text-align: ${align}; margin: 16px 0; padding: ${padding}; box-sizing: border-box;">
        ${linkedImg}
        ${caption ? `<p style="font-size: 13px; color: #6d7175; margin-top: 6px; text-align: center;">${caption}</p>` : ''}
      </div>`;
    }

    case "VideoBlock":
    case "VideoEmbed": {
      const url = settings.url || "";
      if (!url) return "";
      
      let embedUrl = url;
      const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
      if (ytMatch) embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
      else {
        const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
        if (vimeoMatch) embedUrl = `https://player.vimeo.com/video/${vimeoMatch[1]}`;
      }

      const maxW = settings.maxWidth || "100%";
      return `<div class="builder-video-embed" style="max-width: ${maxW}; margin: 16px auto;">
        <iframe src="${embedUrl}" style="width: 100%; aspect-ratio: 16/9; border: none; border-radius: 8px;" allowfullscreen></iframe>
      </div>`;
    }

    case "ButtonBlock": {
      const text = settings.text || "Click Here";
      const url = settings.url || "#";
      const align = settings.alignment || settings.align || "center";
      const color = settings.backgroundColor || settings.color || "#008060";
      const textColor = settings.textColor || "#ffffff";
      const br = (settings.borderRadius !== undefined ? settings.borderRadius : 4) + "px";
      return `<div class="builder-button-block" style="text-align: ${align}; margin: 16px 0;">
        <a href="${url}" style="display: inline-block; background-color: ${color}; color: ${textColor}; padding: 12px 24px; border-radius: ${br}; font-weight: 600; text-decoration: none;">${text}</a>
      </div>`;
    }

    case "Collection": {
      const heading = settings.heading || "Featured Collection";
      const cols = settings.columns || 3;
      const products = settings.manualProducts || settings.products || [];
      return `<div class="builder-collection-block" style="margin: 24px 0;">
        ${settings.showTitle !== false && heading ? `<h3 style="font-size: 20px; font-weight: 600; margin-bottom: 16px; text-align: left;">${heading}</h3>` : ''}
        <div style="display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: ${settings.gap || '16px'};">
          ${products.map(p => `
            <div style="border: 1px solid #e1e3e5; border-radius: 8px; padding: 16px; text-align: center; background: #fff;">
              ${p.featuredImage?.url || p.image ? `<img src="${p.featuredImage?.url || p.image}" alt="${p.title}" style="max-width: 100%; height: 180px; object-fit: contain; margin-bottom: 12px;" />` : ''}
              <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 8px;">${p.title || 'Product'}</h4>
              ${settings.showPrice !== false && p.price ? `<p style="font-size: 14px; font-weight: 700; color: var(--blogger-primary-color, #008060); margin: 0 0 12px;">₹${p.price}</p>` : ''}
              ${settings.showButton !== false ? `<button style="background: ${settings.buttonColor || '#008060'}; color: #fff; border: none; padding: 8px 16px; border-radius: ${settings.buttonRadius ?? 5}px; font-weight: 600; width: 100%; cursor: pointer;">${settings.buttonText || 'Shop Now'}</button>` : ''}
            </div>
          `).join('')}
        </div>
      </div>`;
    }

    case "ProductSlider": {
      const title = settings.title || "";
      const products = settings.manualProducts || settings.products || [];
      // Mirrors the editor preview's & server compiler's cardStyle presets (ProductSliderBlock/index.jsx),
      // which this client compiler was previously ignoring entirely.
      const sliderCardStyles = {
        shadow: "border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; background: #fff;",
        border: "border-radius: 8px; border: 1px solid #e1e3e5; overflow: hidden; background: #fff;",
        minimal: "padding: 4px;",
      };
      const sliderCardStyle = sliderCardStyles[settings.cardStyle] || sliderCardStyles.shadow;
      return `<div class="builder-product-slider" style="margin: 24px 0; overflow-x: auto;">
        ${title ? `<h3 style="font-size: 20px; font-weight: 600; margin-bottom: 16px; text-align: ${settings.titleAlign || 'left'};">${title}</h3>` : ''}
        <div style="display: flex; gap: ${settings.gap || '16px'}; overflow-x: auto; padding-bottom: 8px;">
          ${products.map(p => `
            <div style="min-width: 220px; flex-shrink: 0; ${sliderCardStyle} padding: 16px; text-align: center;">
              ${p.featuredImage?.url || p.image ? `<img src="${p.featuredImage?.url || p.image}" alt="${p.title}" style="max-width: 100%; height: 160px; object-fit: contain; margin-bottom: 12px;" />` : ''}
              <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 8px;">${p.title || 'Product'}</h4>
              ${settings.showPrice !== false && p.price ? `<p style="font-size: 14px; font-weight: 700; color: var(--blogger-primary-color, #008060); margin: 0 0 12px;">₹${p.price}</p>` : ''}
              ${settings.showButton !== false ? `<button style="background: ${settings.buttonColor || '#008060'}; color: #fff; border: none; padding: 8px 16px; border-radius: ${settings.buttonRadius ?? 6}px; font-weight: 600; width: 100%; cursor: pointer;">${settings.buttonText || 'Add to Cart'}</button>` : ''}
            </div>
          `).join('')}
        </div>
      </div>`;
    }

    case "Html": {
      return `<div class="builder-html-block custom-html-block">${settings.code || ""}</div>`;
    }

    case "Table": {
      const data = settings.tableData || [];
      const hasHeader = settings.hasHeader;
      
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

      const theadHtml = theadRows.length > 0 ? `
        <thead>
          ${theadRows.map(row => `
            <tr>
              ${row.map(cell => `<th style="border: 1px solid #e1e3e5; padding: 8px; background: #f4f6f8; font-weight: 600;">${cell || ''}</th>`).join('')}
            </tr>
          `).join('')}
        </thead>
      ` : '';

      const tbodyHtml = `
        <tbody>
          ${tbodyRows.map(row => `
            <tr>
              ${row.map(cell => `<td style="border: 1px solid #e1e3e5; padding: 8px;">${cell || ''}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      `;

      return `
        <div class="builder-table-block" style="margin: 16px 0; overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #e1e3e5; text-align: left;">
            ${theadHtml}
            ${tbodyHtml}
          </table>
        </div>
      `;
    }

    case "CTAButton": {
      const text = settings.text || "Shop Now";
      const url = settings.url || "#";
      const align = settings.align || "center";
      const color = settings.color || "#008060";
      const textColor = settings.textColor || "#ffffff";
      const br = settings.borderRadius || "6px";
      return `<div class="builder-cta-button" style="text-align: ${align}; margin: 16px 0;">
        <a href="${url}" style="display: inline-block; background-color: ${color}; color: ${textColor}; padding: 12px 24px; border-radius: ${br}; font-weight: 600; text-decoration: none;">${text}</a>
      </div>`;
    }

    case "HeroSection": {
      const heading = settings.heading || "";
      const subheading = settings.subheading || "";
      const bgImg = settings.backgroundImage || "";
      const minH = settings.minHeight || "360px";
      const align = settings.align || "center";
      const textColor = settings.textColor || "#ffffff";
      const showCta = settings.showCta;
      const ctaText = settings.ctaText || "Shop Now";
      const ctaUrl = settings.ctaUrl || "#";
      const ctaColor = settings.ctaColor || "#008060";
      const ctaTextColor = settings.ctaTextColor || "#ffffff";

      return `<div class="builder-hero-section" style="position: relative; background-color: #1a1a1a; ${bgImg ? `background-image: url('${bgImg}'); background-size: cover; background-position: center;` : ''} min-height: ${minH}; display: flex; align-items: center; justify-content: ${align}; padding: 40px 24px; border-radius: 8px; color: ${textColor}; text-align: ${align}; margin: 20px 0;">
        <div style="max-width: 600px; z-index: 2;">
          <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 12px; color: inherit;">${heading}</h1>
          <p style="font-size: 16px; margin-bottom: 24px; opacity: 0.9; color: inherit;">${subheading}</p>
          ${showCta ? `<a href="${ctaUrl}" style="display: inline-block; background: ${ctaColor}; color: ${ctaTextColor}; padding: 12px 24px; border-radius: 6px; font-weight: 600; text-decoration: none;">${ctaText}</a>` : ''}
        </div>
      </div>`;
    }

    case "ProductGrid": {
      const title = settings.title || "";
      const products = settings.manualProducts || [];
      const cols = settings.columns || 3;
      // Mirrors the editor preview's & server compiler's cardStyle presets (ProductGridBlock/index.jsx),
      // which this client compiler was previously ignoring entirely.
      const gridCardStyles = {
        shadow: "border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden; background: #fff;",
        border: "border-radius: 8px; border: 1px solid #e1e3e5; overflow: hidden; background: #fff;",
        minimal: "padding: 4px;",
      };
      const gridCardStyle = gridCardStyles[settings.cardStyle] || gridCardStyles.shadow;
      return `<div class="builder-product-grid" style="margin: 24px 0;">
        ${title ? `<h3 style="font-size: 20px; font-weight: 600; margin-bottom: 16px; text-align: ${settings.titleAlign || 'left'};">${title}</h3>` : ''}
        <div style="display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: ${settings.gap || '16px'}; align-items: stretch;">
          ${products.map(p => {
            const imageUrl = typeof p.image === 'string' ? p.image : (p.image?.url || p.featuredImage?.url || p.images?.[0]?.originalSrc || p.images?.[0]?.src || "");
            const currency = p.currency || 'USD';
            const formattedPrice = p.price ? (String(p.price).startsWith('$') || String(p.price).startsWith('₹') ? p.price : formatPrice(p.price, currency)) : "";
            const pLink = p.handle ? `/products/${p.handle}` : "#";

            return `<div style="${gridCardStyle} display: flex; flex-direction: column; justify-content: space-between; height: 100%; box-sizing: border-box;">
              <div>
                <div style="width: 100%; height: 180px; background: #f8f9fa; border-bottom: 1px solid #f1f2f3; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                  ${imageUrl ? `<a href="${pLink}" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; text-decoration:none;"><img src="${imageUrl}" alt="${p.title || ''}" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block; margin: 0 auto;" /></a>` : '<span style="font-size: 24px;">🖼</span>'}
                </div>
                <div style="padding: 12px;">
                  <h4 style="font-size: 14px; font-weight: 600; margin: 0 0 4px; color: #202223;"><a href="${pLink}" style="color: inherit; text-decoration: none;">${p.title || 'Product'}</a></h4>
                  ${settings.showPrice !== false && formattedPrice ? `<p style="font-size: 14px; font-weight: 700; color: var(--blogger-primary-color, #008060); margin: 0 0 8px;">${formattedPrice}</p>` : ''}
                </div>
              </div>
              ${settings.showButton !== false ? `<div style="padding: 0 12px 12px;"><a href="${pLink}" style="display: block; background: ${settings.buttonColor || '#008060'}; color: #fff; text-decoration: none; padding: 8px 12px; border-radius: ${settings.buttonRadius ?? 6}px; font-weight: 600; text-align: center; font-size: 13px; margin-top: auto;">${settings.buttonText || 'Add to Cart'}</a></div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }

    case "ProductCard": {
      const title = settings.title || "Sample Product";
      const price = settings.price ? (String(settings.price).startsWith('$') || String(settings.price).startsWith('₹') ? settings.price : `$${settings.price}`) : "";
      const imageUrl = settings.imageUrl || settings.imageurl || settings.image || (typeof settings.featuredImage === 'string' ? settings.featuredImage : settings.featuredImage?.url) || settings.product?.image || settings.product?.featuredImage?.url || settings.product?.images?.[0]?.originalSrc || settings.product?.images?.[0]?.src || "";
      const showImage = settings.showImage !== false;
      const showPrice = settings.showPrice !== false;
      const showButton = settings.showButton !== false;
      const buttonText = settings.buttonText || "Add to Cart";
      const buttonColor = settings.buttonColor || "#008060";
      const layout = settings.layout || "vertical";
      const br = settings.borderRadius ?? 8;
      const buttonBr = settings.buttonRadius ?? 4;
      const borderColor = settings.borderColor || "#e1e3e5";
      const bg = settings.backgroundColor || "#ffffff";

      const isHorizontal = layout === "horizontal";
      const isCompact = layout === "compact";

      let imageHtml = "";
      if (showImage) {
        if (isCompact) {
          if (imageUrl) {
            imageHtml = `<div style="width: 60px; height: 60px; background: #f4f6f8; border-radius: 4px; overflow: hidden; flex-shrink: 0; margin-right: 12px; display: flex; align-items: center; justify-content: center; border: 1px solid ${borderColor};"><img src="${imageUrl}" alt="${title}" style="width: 100%; height: 100%; object-fit: contain; display: block;" /></div>`;
          }
        } else if (isHorizontal) {
          imageHtml = `<div style="width: 35%; min-width: 120px; min-height: 140px; background: #f4f6f8; overflow: hidden; display: flex; align-items: center; justify-content: center; border-right: 1px solid ${borderColor}; flex-shrink: 0;">${imageUrl ? `<img src="${imageUrl}" alt="${title}" style="max-width: 100%; max-height: 200px; width: auto; height: auto; object-fit: contain; display: block; margin: 0 auto;" />` : `<div style="color: #8c9196; font-size: 13px;">No image</div>`}</div>`;
        } else {
          imageHtml = `<div style="width: 100%; min-height: 160px; max-height: 280px; background: #f4f6f8; overflow: hidden; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid ${borderColor};">${imageUrl ? `<img src="${imageUrl}" alt="${title}" style="max-width: 100%; max-height: 280px; width: auto; height: auto; object-fit: contain; display: block; margin: 0 auto;" />` : `<div style="color: #8c9196; font-size: 13px;">No image</div>`}</div>`;
        }
      }

      return `<div style="border: 1px solid ${borderColor}; border-radius: ${br}px; background-color: ${bg}; overflow: hidden; display: flex; flex-direction: ${isHorizontal ? 'row' : 'column'}; align-items: ${isCompact ? 'center' : 'stretch'}; padding: ${isCompact ? '12px' : '0'}; margin: 16px 0; box-sizing: border-box; height: 100%; flex: 1;" class="builder-product-card">
        ${imageHtml}
        <div style="flex: 1; padding: ${isCompact ? '0 12px' : '16px'}; display: flex; flex-direction: column; justify-content: space-between;">
          <div style="flex: 1;">
            <h4 style="margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #202223;">${title}</h4>
            ${showPrice && price ? `<p style="margin: 0 0 12px; font-size: 14px; font-weight: 700; color: var(--blogger-primary-color, #008060);">${price}</p>` : ''}
          </div>
          ${showButton ? `<a href="${settings.handle ? `/products/${settings.handle}` : '#'}" style="display: inline-block; background-color: ${buttonColor}; color: #ffffff; text-decoration: none; border: none; padding: 8px 16px; border-radius: ${buttonBr}px; font-weight: 600; text-align: center; width: ${!isHorizontal && !isCompact ? '100%' : 'auto'}; box-sizing: border-box; margin-top: auto;">${buttonText}</a>` : ''}
        </div>
      </div>`;
    }

    case "BuyButton": {
      const p = settings.product;
      if (!p) return "";
      const currency = p.currency || "USD";
      const formattedPrice = p.price ? (String(p.price).startsWith('$') || String(p.price).startsWith('₹') ? p.price : formatPrice(p.price, currency)) : "";
      const imageUrl = typeof p.image === 'string' ? p.image : (p.image?.url || p.featuredImage?.url || p.images?.[0]?.originalSrc || p.images?.[0]?.src || "");
      const isVertical = settings.layout === "vertical";
      const pLink = p.handle ? `/products/${p.handle}` : "#";

      if (isVertical) {
        return `<div class="builder-buy-button" style="border: 1px solid #e1e3e5; border-radius: 10px; overflow: hidden; background: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.05); max-width: ${settings.maxWidth || '320px'}; margin: 16px auto; box-sizing: border-box;">
          <div style="height: 220px; width: 100%; background: #f4f6f8; border-bottom: 1px solid #e1e3e5; display: flex; align-items: center; justify-content: center; overflow: hidden;">
            ${imageUrl ? `<a href="${pLink}" style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; text-decoration:none;"><img src="${imageUrl}" alt="${p.title || ''}" style="max-width:100%; max-height:100%; object-fit:contain; display:block; margin:0 auto;" /></a>` : '<div style="font-size:24px;">🖼</div>'}
          </div>
          <div style="padding: 16px;">
            ${settings.showBadge && settings.badge ? `<span style="display: inline-block; padding: 2px 8px; background: #ffd700; color: #202223; font-size: 11px; font-weight: 700; border-radius: 12px; margin-bottom: 8px;">${settings.badge}</span>` : ''}
            <h4 style="font-size: 15px; font-weight: 600; margin: 0 0 6px; color: #202223;"><a href="${pLink}" style="color: inherit; text-decoration: none;">${p.title || ''}</a></h4>
            ${settings.showDescription && p.description ? `<p style="font-size: 13px; color: #6d7175; margin: 0 0 10px; line-height: 1.4;">${p.description}</p>` : ''}
            ${settings.showPrice && formattedPrice ? `<p style="font-size: 18px; font-weight: 700; color: var(--blogger-primary-color, #008060); margin: 0 0 12px;">${formattedPrice}</p>` : ''}
            <a href="${pLink}" style="display: block; width: 100%; background: ${settings.buttonColor || '#008060'}; color: #ffffff; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-weight: 600; text-align: center; box-sizing: border-box;">${settings.buttonText || 'Add to Cart'}</a>
          </div>
        </div>`;
      }

      return `<div class="builder-buy-button" style="border: 1px solid #e1e3e5; border-radius: 8px; padding: 16px; display: flex; align-items: center; gap: 16px; max-width: ${settings.maxWidth || '600px'}; margin: 16px 0; box-sizing: border-box; background: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
        ${imageUrl ? `<div style="width: ${settings.imageSize || '120px'}; height: ${settings.imageSize || '120px'}; background: #f4f6f8; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid #f1f2f3;"><img src="${imageUrl}" alt="${p.title || ''}" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;" /></div>` : ''}
        <div style="flex: 1; min-width: 0;">
          ${settings.showBadge && settings.badge ? `<span style="display: inline-block; padding: 2px 8px; background: #ffd700; color: #202223; font-size: 10px; font-weight: 700; border-radius: 12px; margin-bottom: 6px;">${settings.badge}</span>` : ''}
          <h4 style="font-size: 16px; font-weight: 600; margin: 0 0 4px; color: #202223;"><a href="${pLink}" style="color: inherit; text-decoration: none;">${p.title || ''}</a></h4>
          ${settings.showDescription && p.description ? `<p style="font-size: 13px; color: #6d7175; margin: 0 0 8px; line-height: 1.4;">${p.description}</p>` : ''}
          ${settings.showPrice && formattedPrice ? `<p style="font-size: 18px; font-weight: 700; color: var(--blogger-primary-color, #008060); margin: 0 0 10px;">${formattedPrice}</p>` : ''}
          <a href="${pLink}" style="display: inline-block; background: ${settings.buttonColor || '#008060'}; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; text-align: center; box-sizing: border-box;">${settings.buttonText || 'Add to Cart'}</a>
        </div>
      </div>`;
    }

    case "FaqBlock": {
      const title = settings.title || "";
      const titleAlign = settings.titleAlign || "left";
      const layout = settings.layout || "accordion";
      const items = Array.isArray(settings.items) ? settings.items : [];
      const accentColor = settings.accentColor || "#008060";
      const backgroundColor = settings.backgroundColor || "#ffffff";
      const borderColor = settings.borderColor || "#e1e3e5";
      const borderRadius = settings.borderRadius !== undefined ? settings.borderRadius : 8;
      const firstOpen = settings.firstOpen !== false;
      const enableSchema = settings.enableSchema !== false;

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
              <h4 style="margin: 0 0 8px 0; font-size: 16px; font-weight: 600; color: #202223; line-height: 1.4;">${item.question || ""}</h4>
              <p style="margin: 0; font-size: 14px; color: #6d7175; line-height: 1.6;">${item.answer || ""}</p>
            </div>
          `
          )
          .join("");

        contentHtml = `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin: 16px 0;">${gridItemsHtml}</div>`;
      } else {
        // Open/close visual state (question color, icon rotation, box-shadow) used to live in a
        // sibling <style> tag using [open] selectors — dropped because Shopify's own admin blog
        // article editor doesn't render/strip raw <style> tags cleanly, leaving a large blank
        // block-height gap in place of the tag when merchants open the post there (App-side
        // compiled/live storefront rendering was never affected — this was purely a Shopify
        // admin-editor display bug). Same open-state behavior is now driven inline via each
        // <details>' ontoggle handler instead of CSS. list-style:none plus the summary's own
        // display:flex already suppresses the native disclosure triangle in evergreen browsers
        // (::marker only renders for display:list-item), so no CSS was needed for that part either.
        const accordionItemsHtml = items
          .map((item, idx) => {
            const isOpen = firstOpen && idx === 0;
            const toggleHandler = `var q=this.querySelector('.faq-question-text'),i=this.querySelector('.faq-icon-wrapper');if(this.open){q.style.color='${accentColor}';i.style.transform='rotate(180deg)';this.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)';}else{q.style.color='#202223';i.style.transform='rotate(0deg)';this.style.boxShadow='0 1px 3px rgba(0,0,0,0.03)';}`;
            return `
            <details ${isOpen ? "open" : ""} class="builder-faq-item" ontoggle="${toggleHandler}" style="background-color: ${backgroundColor}; border: 1px solid ${borderColor}; border-radius: ${borderRadius}px; overflow: hidden; margin-bottom: 10px; box-shadow: ${isOpen ? "0 2px 8px rgba(0,0,0,0.06)" : "0 1px 3px rgba(0,0,0,0.03)"}; transition: all 0.2s ease;">
              <summary style="padding: 14px 18px; font-size: 15px; font-weight: 600; color: #202223; cursor: pointer; outline: none; list-style: none; display: flex; justify-content: space-between; align-items: center; user-select: none;">
                <span class="faq-question-text" style="color: ${isOpen ? accentColor : "#202223"}; font-size: 15px; font-weight: 600; line-height: 1.4; transition: color 0.2s ease;">${item.question || ""}</span>
                <span class="faq-icon-wrapper" style="color: ${accentColor}; flex-shrink: 0; display: inline-flex; transform: ${isOpen ? "rotate(180deg)" : "rotate(0deg)"}; transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </span>
              </summary>
              <div style="padding: 14px 18px 16px 18px; border-top: 1px solid ${borderColor}; background-color: transparent;">
                <p style="margin: 0; font-size: 14px; color: #4a4a4a; line-height: 1.6;">${item.answer || ""}</p>
              </div>
            </details>
          `;
          })
          .join("");

        contentHtml = `<div style="margin: 16px 0;">${accordionItemsHtml}</div>`;
      }

      const blockHeadings = context.headingsByBlockId?.[blockId] || [];
      const idAttr = blockHeadings[0] ? ` id="${blockHeadings[0].id}"` : "";
      const titleHtml = title ? `<h2${idAttr} style="text-align: ${titleAlign}; font-size: 22px; font-weight: 700; color: #202223; margin: 24px 0 16px 0;">${title}</h2>` : "";

      return `<div class="builder-faq-block" style="width: 100%; margin: 24px 0;">
        ${titleHtml}
        ${contentHtml}
        ${schemaScript}
      </div>`;
    }

    default: {
      return children.map((child) => compileSingleBlockToHtml(child, context)).join("");
    }
  }
}

export function compileBlocksToHtml(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return "";

  const allHeadings = extractHeadingsFromAst(blocks);
  const headingsByBlockId = {};
  allHeadings.forEach((h) => {
    if (!headingsByBlockId[h.blockId]) headingsByBlockId[h.blockId] = [];
    headingsByBlockId[h.blockId].push(h);
  });

  const context = { allHeadings, headingsByBlockId };

  const compiled = blocks.map((b) => compileSingleBlockToHtml(b, context)).join("\n");
  // Prepend the responsive visibility CSS once if any block has a hide flag.
  // This is O(1) in the output — one <style> block regardless of block count.
  const prefix = hasVisibilityFlags(blocks) ? VISIBILITY_CSS + "\n" : "";
  return prefix + compiled;
}

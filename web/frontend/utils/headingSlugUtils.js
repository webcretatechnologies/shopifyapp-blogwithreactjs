/**
 * headingSlugUtils.js
 *
 * Single source of truth for Table of Contents heading extraction,
 * deterministic slug generation, de-duplication, and anchor ID injection.
 */

// Headings sourced from raw HTML (RichText's own stored content, not a standalone Heading
// block's plain-text settings.text) carry real ampersands/quotes/etc. as HTML entities — e.g.
// "Products &amp; Services" — since that's how Tiptap serializes them. Stripping tags alone
// leaves those entities un-decoded, so the TOC's displayed text and generated slug both showed
// the literal "&amp;" instead of "&". A real <textarea> round-trip is the standard, complete way
// to decode entities in a browser context (handles named entities like &amp;/&nbsp;/&copy; and
// numeric entities like &#38;/&#x26; alike, not just the one or two cases a hand-rolled regex
// would cover).
function decodeHtmlEntities(str) {
  if (!str) return str;
  if (typeof document === "undefined") return str.replace(/&nbsp;/g, " ");
  const el = document.createElement("textarea");
  el.innerHTML = str;
  return el.value;
}

/**
 * Deterministically slugifies heading text.
 * E.g., "Why Fragrance Affects How We Feel!" -> "why-fragrance-affects-how-we-feel"
 */
export function slugifyHeading(text) {
  if (!text || typeof text !== "string") return "heading";
  const clean = decodeHtmlEntities(text.replace(/<[^>]*>/g, "")).trim();
  if (!clean) return "heading";

  const slug = clean
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Strip diacritics
    .replace(/[^\w\s-]/g, "") // Strip special characters/punctuation
    .replace(/\s+/g, "-") // Convert spaces to hyphens
    .replace(/-+/g, "-") // Collapse consecutive hyphens
    .replace(/^-|-$/g, ""); // Strip leading/trailing hyphens

  return slug || "heading";
}

/**
 * Recursively walk AST and extract all headings from standalone `Heading` blocks
 * and `RichText` blocks (both Tiptap JSON and raw HTML string representations).
 *
 * @param {Array} blocks - AST blocks array
 * @param {Array<number>} levelsToInclude - Array of heading levels e.g. [1, 2, 3]
 * @returns {Array<{ id: string, text: string, level: number, blockId: string }>}
 */
export function extractHeadingsFromAst(blocks, levelsToInclude = [1, 2, 3, 4, 5, 6]) {
  if (!Array.isArray(blocks) || blocks.length === 0) return [];

  const headings = [];
  const slugCounts = {};

  const allowedLevels = new Set(levelsToInclude.map(Number));

  function processTextContent(node) {
    if (!node) return "";
    if (typeof node === "string") return node;
    if (node.text) return node.text;
    if (Array.isArray(node.content)) {
      return node.content.map(processTextContent).join("");
    }
    return "";
  }

  function walkTiptapNodes(node, blockId) {
    if (!node || typeof node !== "object") return;

    if (node.type === "heading" && node.attrs?.level) {
      const level = Number(node.attrs.level);
      const text = processTextContent(node).trim();
      if (allowedLevels.has(level) && text) {
        const baseSlug = slugifyHeading(text);
        slugCounts[baseSlug] = (slugCounts[baseSlug] || 0) + 1;
        const id = slugCounts[baseSlug] === 1 ? baseSlug : `${baseSlug}-${slugCounts[baseSlug] - 1}`;
        headings.push({ id, text, level, blockId });
      }
    }

    if (Array.isArray(node.content)) {
      node.content.forEach((child) => walkTiptapNodes(child, blockId));
    }
  }

  function walkBlocks(nodes) {
    if (!Array.isArray(nodes)) return;

    nodes.forEach((block) => {
      if (!block || typeof block !== "object") return;

      const type = block.type;
      const settings = block.settings || {};

      const normalizedType =
        type === "FaqBlock" || type === "faq" || type === "faqBlock" || type === "FAQ" || type === "faq_block"
          ? "FaqBlock"
          : type === "Callout" || type === "callout"
          ? "Callout"
          : type === "HeroSection" || type === "hero" || type === "hero_section"
          ? "HeroSection"
          : type === "ProductGrid" || type === "product_grid" || type === "Collection" || type === "collection" || type === "ProductSlider" || type === "product_slider"
          ? "ProductBlock"
          : type === "ProductCard" || type === "product_card" || type === "productCard"
          ? "ProductCard"
          : type;

      if (normalizedType === "Heading") {
        const level = Number(settings.level || 2);
        const text = (settings.text || "").replace(/<[^>]*>/g, "").trim();
        if (allowedLevels.has(level) && text) {
          const baseSlug = slugifyHeading(text);
          slugCounts[baseSlug] = (slugCounts[baseSlug] || 0) + 1;
          const id = slugCounts[baseSlug] === 1 ? baseSlug : `${baseSlug}-${slugCounts[baseSlug] - 1}`;
          headings.push({ id, text, level, blockId: block.id });
        }
      } else if (normalizedType === "FaqBlock") {
        const level = 2; // FaqBlock title renders as an H2
        const text = (settings.title || "").replace(/<[^>]*>/g, "").trim();
        if (allowedLevels.has(level) && text) {
          const baseSlug = slugifyHeading(text);
          slugCounts[baseSlug] = (slugCounts[baseSlug] || 0) + 1;
          const id = slugCounts[baseSlug] === 1 ? baseSlug : `${baseSlug}-${slugCounts[baseSlug] - 1}`;
          headings.push({ id, text, level, blockId: block.id });
        }
      } else if (normalizedType === "HeroSection") {
        const level = 1; // HeroSection renders as an H1
        const text = (settings.heading || settings.title || "").replace(/<[^>]*>/g, "").trim();
        if (allowedLevels.has(level) && text) {
          const baseSlug = slugifyHeading(text);
          slugCounts[baseSlug] = (slugCounts[baseSlug] || 0) + 1;
          const id = slugCounts[baseSlug] === 1 ? baseSlug : `${baseSlug}-${slugCounts[baseSlug] - 1}`;
          headings.push({ id, text, level, blockId: block.id });
        }
      } else if (normalizedType === "Callout") {
        const level = 4; // Callout renders as an H4
        const text = (settings.title || "").replace(/<[^>]*>/g, "").trim();
        if (allowedLevels.has(level) && text) {
          const baseSlug = slugifyHeading(text);
          slugCounts[baseSlug] = (slugCounts[baseSlug] || 0) + 1;
          const id = slugCounts[baseSlug] === 1 ? baseSlug : `${baseSlug}-${slugCounts[baseSlug] - 1}`;
          headings.push({ id, text, level, blockId: block.id });
        }
      } else if (normalizedType === "ProductCard") {
        const level = 4; // ProductCard renders as an H4
        const text = (settings.title || "").replace(/<[^>]*>/g, "").trim();
        if (allowedLevels.has(level) && text) {
          const baseSlug = slugifyHeading(text);
          slugCounts[baseSlug] = (slugCounts[baseSlug] || 0) + 1;
          const id = slugCounts[baseSlug] === 1 ? baseSlug : `${baseSlug}-${slugCounts[baseSlug] - 1}`;
          headings.push({ id, text, level, blockId: block.id });
        }
      } else if (normalizedType === "ProductBlock") {
        if (settings.showTitle !== false) {
          const level = 3; // Product grid/collection renders as an H3
          const text = (settings.title || settings.heading || "").replace(/<[^>]*>/g, "").trim();
          if (allowedLevels.has(level) && text) {
            const baseSlug = slugifyHeading(text);
            slugCounts[baseSlug] = (slugCounts[baseSlug] || 0) + 1;
            const id = slugCounts[baseSlug] === 1 ? baseSlug : `${baseSlug}-${slugCounts[baseSlug] - 1}`;
            headings.push({ id, text, level, blockId: block.id });
          }
        }
      } else if (normalizedType === "RichText") {
        const content = settings.content;
        if (content && typeof content === "object") {
          walkTiptapNodes(content, block.id);
        } else if (typeof content === "string" && content.trim()) {
          const headingRegex = /<h([1-6])([^>]*)>(.*?)<\/h\1>/gi;
          let match;
          while ((match = headingRegex.exec(content)) !== null) {
            const level = Number(match[1]);
            const innerHtml = match[3] || "";
            const text = decodeHtmlEntities(innerHtml.replace(/<[^>]*>/g, "")).trim();
            if (allowedLevels.has(level) && text) {
              const baseSlug = slugifyHeading(text);
              slugCounts[baseSlug] = (slugCounts[baseSlug] || 0) + 1;
              const id = slugCounts[baseSlug] === 1 ? baseSlug : `${baseSlug}-${slugCounts[baseSlug] - 1}`;
              headings.push({ id, text, level, blockId: block.id });
            }
          }
        }
      }

      if (Array.isArray(block.children) && block.children.length > 0) {
        walkBlocks(block.children);
      }
    });
  }

  walkBlocks(blocks);
  return headings;
}

/**
 * Injects pre-computed heading anchor IDs into an HTML string by consuming
 * headings in exact sequence. Never recomputes slugs.
 *
 * @param {string} html - HTML string produced for a block
 * @param {Array} headingsList - Headings belonging to this block, with pre-computed `id`
 * @returns {string} HTML with `id="..."` attributes injected into `<h1..6>` tags.
 */
export function injectHeadingIdsToHtml(html, headingsList) {
  if (!html || !Array.isArray(headingsList) || headingsList.length === 0) return html;

  let headingIndex = 0;
  return html.replace(/<h([1-6])([^>]*)>/gi, (fullMatch, level, attrs) => {
    if (headingIndex < headingsList.length) {
      const heading = headingsList[headingIndex++];
      // Avoid duplicating id attribute if already present
      if (/id=["'][^"']*["']/i.test(attrs)) {
        return fullMatch;
      }
      return `<h${level}${attrs} id="${heading.id}">`;
    }
    return fullMatch;
  });
}

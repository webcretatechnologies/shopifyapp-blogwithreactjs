import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  InlineGrid,
  Text,
  Button,
  Select,
  TextField,
  Divider,
  Toast,
  Frame,
  Spinner,
  Box,
  Banner,
  Badge,
  ProgressBar,
  Icon,
} from "@shopify/polaris";
import {
  ArrowLeftIcon,
  LanguageIcon,
  AlertCircleIcon,
  SaveIcon,
  CheckCircleIcon,
  TextIcon,
  InfoIcon,
  LayoutSectionIcon,
  TextTitleIcon,
  DataTableIcon,
  ImageWithTextOverlayIcon,
  CodeAddIcon,
} from "@shopify/polaris-icons";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { TitleBar } from "@shopify/app-bridge-react";
import { smartBackAction } from "../../../utils/smartBack";
import UpgradePrompt from "../../../components/UpgradePrompt";
import { BlockRegistry } from "../../../components/builder/BlockRegistry";

// ══════════════════════════════════════════════════════════════════════════════
//  DOM / HTML PARSING & BLOCK TRANSLATION HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function extractTextFromTiptapNode(node) {
  if (!node) return "";
  if (node.text) return node.text;
  if (Array.isArray(node.content)) return node.content.map(extractTextFromTiptapNode).join("");
  return "";
}

function unpackTiptapNode(node, blocks) {
  if (!node) return;
  const type = node.type;
  if (type === "heading") {
    const text = extractTextFromTiptapNode(node).trim();
    if (text) {
      blocks.push({
        id: `block_h_${blocks.length}`,
        type: "Heading",
        settings: { text, level: node.attrs?.level || 2 },
      });
    }
  } else if (type === "paragraph") {
    const text = extractTextFromTiptapNode(node).trim();
    if (text) {
      blocks.push({
        id: `block_p_${blocks.length}`,
        type: "RichText",
        settings: { content: text },
      });
    }
  } else if (type === "blockquote") {
    const text = extractTextFromTiptapNode(node).trim();
    if (text) {
      blocks.push({
        id: `block_callout_${blocks.length}`,
        type: "Callout",
        settings: { title: "", body: text },
      });
    }
  } else if (type === "bulletList" || type === "orderedList") {
    if (Array.isArray(node.content)) {
      node.content.forEach((li) => unpackTiptapNode(li, blocks));
    }
  } else if (type === "listItem") {
    const text = extractTextFromTiptapNode(node).trim();
    if (text) {
      blocks.push({
        id: `block_li_${blocks.length}`,
        type: "RichText",
        settings: { content: text },
      });
    }
  } else if (Array.isArray(node.content)) {
    node.content.forEach((child) => unpackTiptapNode(child, blocks));
  }
}

/**
 * Recursively parse post HTML/JSON into structured translatable blocks.
 * Extracts individual paragraphs, headings, FAQs, callouts, tables, and custom blocks.
 */
function extractBlocksFromPost(post) {
  if (!post) return [];

  // 1. If post has contentJson AST with blocks, process & unpack them
  if (Array.isArray(post.contentJson) && post.contentJson.length > 0) {
    const blocks = [];
    // Purely structural/decorative types with no free text of their own — never worth showing
    // as their own translation card. Their CHILDREN (handled by the recursion below) still are.
    const NO_TEXT_TYPES = new Set(["Divider", "Spacer", "Html", "HtmlBlock"]);
    const CONTAINER_TYPES = new Set(["Section", "ColumnLayout", "Column"]);

    const walk = (list) => {
      (list || []).forEach((block, idx) => {
        const type = block.type || block.blockType || "RichText";
        const s = block.settings || block.data || {};

        if (CONTAINER_TYPES.has(type)) {
          walk(block.children);
          return;
        }
        if (NO_TEXT_TYPES.has(type)) {
          return;
        }

        if (type === "RichText" || type === "text") {
          const content = s.content;
          if (content && typeof content === "object" && Array.isArray(content.content)) {
            // Unpack Tiptap JSON document into individual granular blocks
            content.content.forEach((node) => unpackTiptapNode(node, blocks));
          } else if (typeof content === "string" && content.trim()) {
            // Unpack HTML string inside RichText block via DOMParser
            const subBlocks = extractBlocksFromPost({ contentHtml: content });
            if (subBlocks.length > 0) {
              blocks.push(...subBlocks);
            } else {
              blocks.push({
                id: block.id || `block_${idx}`,
                type: "RichText",
                settings: { content: content },
              });
            }
          } else {
            blocks.push({
              id: block.id || `block_${idx}`,
              type: "RichText",
              settings: { content: typeof s === "object" ? String(s.content || "") : String(s) },
            });
          }
        } else {
          blocks.push({
            id: block.id || `block_${idx}`,
            type,
            settings: typeof s === "object" ? { ...s } : { content: String(s) },
          });
        }

        // Recurse into any children even on a non-container type, in case it unexpectedly
        // carries nested blocks — harmless no-op when it doesn't.
        if (Array.isArray(block.children) && block.children.length > 0 && !CONTAINER_TYPES.has(type)) {
          walk(block.children);
        }
      });
    };

    walk(post.contentJson);
    return blocks;
  }

  // 2. Otherwise parse contentHtml via recursive DOM traversal
  const html = post.contentHtml || "";
  if (!html.trim()) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Remove script/style/meta wrappers for block building
  doc.querySelectorAll("script, style, meta, link").forEach((el) => el.remove());

  const blocks = [];

  const processNode = (node) => {
    if (!node) return;

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        blocks.push({
          id: `block_text_${blocks.length}`,
          type: "RichText",
          settings: { content: text },
        });
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node;
    const tagName = el.tagName.toLowerCase();

    if (["style", "script", "meta", "link"].includes(tagName)) return;

    // Check for app custom data-type elements or builder block classes
    const dataType = el.getAttribute("data-type");

    // The actual current storage format: blocks are empty <div data-type="X" data-field="...">
    // wrappers with no visible child HTML at all — every field lives in a data-* attribute
    // (see _blockToDataHtml/injectBlockIdentity on the compiler side). The structural
    // child-HTML matchers below (h2/details/blockquote-based) were written for a fully
    // rendered/expanded HTML shape and never match this, so they always found nothing —
    // read straight from the dataset first; it takes priority when present.
    if (dataType) {
      const ds = el.dataset;
      if (dataType === "Heading" && ds.text !== undefined) {
        blocks.push({
          id: `block_h_${blocks.length}`,
          type: "Heading",
          settings: { text: ds.text, level: parseInt(ds.level, 10) || 2 },
        });
        return;
      }
      if ((dataType === "FaqBlock" || dataType === "faq") && ds.items !== undefined) {
        let items = [];
        try { items = JSON.parse(ds.items); } catch { /* leave empty */ }
        blocks.push({
          id: `block_faq_${blocks.length}`,
          type: "FaqBlock",
          settings: { title: ds.title || "Frequently Asked Questions", items },
        });
        return;
      }
      if (dataType === "RichText" && ds.content !== undefined) {
        // A RichText block's own `content` is very often itself a real HTML blob (typed
        // directly in the rich-text editor) containing multiple genuine <h2>/<p>/etc tags —
        // NOT just a plain string. Path #1 (the contentJson-based extractor used for
        // `originalBlocks`) already unpacks this into individual granular sub-blocks via a
        // recursive call; this path must do exactly the same, or the two sides' block counts
        // diverge the moment a RichText block is reached, permanently desyncing every
        // per-type positional match after it (headings/paragraphs past this point end up
        // matched to the wrong translated block, or to nothing at all).
        const subBlocks = ds.content.includes("<") ? extractBlocksFromPost({ contentHtml: ds.content }) : [];
        if (subBlocks.length > 0) {
          blocks.push(...subBlocks);
        } else {
          blocks.push({
            id: `block_text_${blocks.length}`,
            type: "RichText",
            settings: { content: ds.content },
          });
        }
        return;
      }
      if (dataType === "Callout" && (ds.title !== undefined || ds.body !== undefined)) {
        blocks.push({
          id: `block_callout_${blocks.length}`,
          type: "Callout",
          settings: { title: ds.title || "", body: ds.body || "" },
        });
        return;
      }
      if ((dataType === "Hero" || dataType === "HeroSection" || dataType === "heroBlock") && ds.heading !== undefined) {
        blocks.push({
          id: `block_hero_${blocks.length}`,
          type: "Hero",
          settings: { heading: ds.heading || "", subheading: ds.subheading || "", ctaText: ds.ctaText || "" },
        });
        return;
      }
      if (dataType === "TableOfContents" && ds.title !== undefined) {
        blocks.push({
          id: `block_toc_${blocks.length}`,
          type: "TableOfContents",
          settings: { title: ds.title || "" },
        });
        return;
      }
      if (dataType === "Image" && (ds.alt !== undefined || ds.caption !== undefined)) {
        blocks.push({
          id: `block_image_${blocks.length}`,
          type: "Image",
          settings: { alt: ds.alt || "", caption: ds.caption || "" },
        });
        return;
      }
      if (dataType === "VideoEmbed" && ds.caption !== undefined) {
        blocks.push({
          id: `block_video_${blocks.length}`,
          type: "VideoEmbed",
          settings: { caption: ds.caption || "" },
        });
        return;
      }
      if (dataType === "ButtonBlock" && ds.text !== undefined) {
        blocks.push({
          id: `block_button_${blocks.length}`,
          type: "ButtonBlock",
          settings: { text: ds.text || "" },
        });
        return;
      }
      if (dataType === "BuyButton" && (ds.buttonText !== undefined || ds.badge !== undefined)) {
        blocks.push({
          id: `block_buybutton_${blocks.length}`,
          type: "BuyButton",
          settings: { buttonText: ds.buttonText || "", badge: ds.badge || "" },
        });
        return;
      }
      if ((dataType === "ProductGrid" || dataType === "Collection" || dataType === "ProductSlider") && (ds.title !== undefined || ds.buttonText !== undefined)) {
        blocks.push({
          id: `block_products_${blocks.length}`,
          type: dataType,
          settings: { title: ds.title || ds.heading || "", buttonText: ds.buttonText || "" },
        });
        return;
      }
      if (dataType === "ProductCard" && ds.buttonText !== undefined) {
        blocks.push({
          id: `block_productcard_${blocks.length}`,
          type: "ProductCard",
          settings: { buttonText: ds.buttonText || "" },
        });
        return;
      }
      if (dataType === "Table" && ds.tableData !== undefined) {
        let tableData = [];
        try { tableData = JSON.parse(ds.tableData); } catch { /* leave empty */ }
        blocks.push({
          id: `block_table_${blocks.length}`,
          type: "Table",
          settings: { tableData },
        });
        return;
      }
      // Structural/decorative types with no free text of their own (Section, ColumnLayout,
      // Column, Divider, Spacer, Html) — nothing to translate, but still need to recurse into
      // children so nested blocks (e.g. a RichText paragraph inside a Section) aren't skipped.
      if (["Section", "ColumnLayout", "Column"].includes(dataType)) {
        Array.from(el.children).forEach((child) => processNode(child));
        return;
      }
      if (["Divider", "Spacer", "Html", "HtmlBlock"].includes(dataType)) {
        return;
      }
    }

    if (dataType === "FaqBlock" || dataType === "faq" || el.classList.contains("builder-faq-block")) {
      const titleEl = el.querySelector("h2, h3, .faq-title");
      const title = titleEl ? titleEl.textContent.trim() : "Frequently Asked Questions";
      const items = [];
      el.querySelectorAll("details, .builder-faq-item").forEach((itemEl, i) => {
        const qEl = itemEl.querySelector("summary, .faq-question-text");
        const aEl = itemEl.querySelector("p, div, .faq-answer-text");
        items.push({
          id: `faq_item_${blocks.length}_${i}`,
          question: qEl ? qEl.textContent.trim() : "",
          answer: aEl ? aEl.textContent.trim() : "",
        });
      });
      blocks.push({
        id: `block_faq_${blocks.length}`,
        type: "FaqBlock",
        settings: { title, items },
      });
      return;
    }

    if (dataType === "Hero" || dataType === "heroBlock" || el.classList.contains("hero-block")) {
      const hEl = el.querySelector("h1, h2, .hero-title");
      const subEl = el.querySelector("p, .hero-subtitle");
      const btnEl = el.querySelector("a, button, .btn");
      blocks.push({
        id: `block_hero_${blocks.length}`,
        type: "Hero",
        settings: {
          heading: hEl ? hEl.textContent.trim() : "",
          subheading: subEl ? subEl.textContent.trim() : "",
          ctaText: btnEl ? btnEl.textContent.trim() : "",
        },
      });
      return;
    }

    if (dataType === "Callout" || el.classList.contains("callout-block") || tagName === "blockquote") {
      const titleEl = el.querySelector("h3, h4, .callout-title");
      const bodyEl = el.querySelector("p, .callout-body");
      blocks.push({
        id: `block_callout_${blocks.length}`,
        type: "Callout",
        settings: {
          title: titleEl ? titleEl.textContent.trim() : "",
          body: bodyEl ? bodyEl.textContent.trim() : el.textContent.trim(),
        },
      });
      return;
    }

    if (/^h[1-6]$/.test(tagName)) {
      const text = el.textContent.trim();
      if (text) {
        blocks.push({
          id: `block_h_${blocks.length}`,
          type: "Heading",
          settings: { text, level: parseInt(tagName.charAt(1), 10) },
        });
      }
      return;
    }

    if (tagName === "p" || tagName === "li") {
      const text = el.textContent.trim();
      if (text) {
        blocks.push({
          id: `block_text_${blocks.length}`,
          type: "RichText",
          settings: { content: text },
        });
      }
      return;
    }

    if (tagName === "table") {
      const rows = Array.from(el.querySelectorAll("tr")).map((tr) =>
        Array.from(tr.querySelectorAll("th, td")).map((td) => td.textContent.trim())
      );
      blocks.push({
        id: `block_table_${blocks.length}`,
        type: "Table",
        settings: { tableData: rows },
      });
      return;
    }

    // Generic container tags (div, article, section, main, body, ul, ol): recurse through children!
    if (["div", "section", "article", "main", "body", "ul", "ol"].includes(tagName)) {
      Array.from(el.children).forEach((child) => processNode(child));
      return;
    }

    // Fallback text for other inline elements
    const text = el.textContent.trim();
    if (text) {
      blocks.push({
        id: `block_fallback_${blocks.length}`,
        type: "RichText",
        settings: { content: text },
      });
    }
  };

  Array.from(doc.body.children).forEach((child) => processNode(child));

  return blocks;
}

/**
 * Sync edited block text fields into translated content HTML.
 *
 * originalHtml is the raw storage format — empty <div data-type="X" data-field="..."> wrapper
 * divs with no visible child HTML at all (see _blockToDataHtml/injectBlockIdentity on the
 * compiler side). This previously tried to write translations via querySelector into CHILD
 * elements (h2/details/summary/etc) that never exist in this format, so edits silently never
 * made it into the saved HTML for any block type. Fixed to write straight into the matching
 * data-* attributes on the wrapper div itself, matched positionally per-type (same convention
 * as hydrateBlockTranslationsFromHtml) since these elements carry no other stable identifier
 * once parsed from raw HTML.
 */
function applyBlockTranslationsToHtml(originalHtml, originalBlocks, blockTranslations) {
  if (!originalHtml) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(originalHtml, "text/html");

  const typeCounters = new Map();
  const nextElementOfType = (type) => {
    const list = doc.querySelectorAll(`[data-type="${type}"]`);
    const i = typeCounters.get(type) || 0;
    typeCounters.set(type, i + 1);
    return list[i] || null;
  };

  originalBlocks.forEach((block) => {
    const trans = blockTranslations[block.id];
    const el = nextElementOfType(block.type);
    if (!trans || !el) return;

    const setAttr = (attr, value) => {
      if (value !== undefined && value !== null) el.setAttribute(attr, value);
    };

    switch (block.type) {
      case "Heading":
      case "heading":
        setAttr("data-text", trans.text);
        break;
      case "FaqBlock":
      case "faq": {
        setAttr("data-title", trans.title);
        if (Array.isArray(trans.items)) {
          let items = [];
          try { items = JSON.parse(el.getAttribute("data-items") || "[]"); } catch { /* start empty */ }
          trans.items.forEach((itemTrans, idx) => {
            items[idx] = { ...items[idx], question: itemTrans.question, answer: itemTrans.answer };
          });
          el.setAttribute("data-items", JSON.stringify(items));
        }
        break;
      }
      case "Callout":
        setAttr("data-title", trans.title);
        setAttr("data-body", trans.body);
        break;
      case "Hero":
      case "HeroSection":
        setAttr("data-heading", trans.heading);
        setAttr("data-subheading", trans.subheading);
        setAttr("data-cta-text", trans.ctaText);
        break;
      case "TableOfContents":
        setAttr("data-title", trans.title);
        break;
      case "Image":
        setAttr("data-alt", trans.alt);
        setAttr("data-caption", trans.caption);
        break;
      case "VideoEmbed":
        setAttr("data-caption", trans.caption);
        break;
      case "ButtonBlock":
        setAttr("data-text", trans.text);
        break;
      case "BuyButton":
        setAttr("data-button-text", trans.buttonText);
        setAttr("data-badge", trans.badge);
        break;
      case "ProductGrid":
      case "Collection":
      case "ProductSlider":
        setAttr("data-title", trans.title);
        setAttr("data-button-text", trans.buttonText);
        break;
      case "ProductCard":
        setAttr("data-button-text", trans.buttonText);
        break;
      case "Table":
        if (Array.isArray(trans.tableData)) {
          el.setAttribute("data-table-data", JSON.stringify(trans.tableData));
        }
        break;
      default:
        setAttr("data-content", trans.content);
        break;
    }
  });

  // A <style> tag that appears as the very first token in originalHtml (e.g. the device-
  // visibility CSS compileBlocksToHtml.js prepends whenever any block has a hide-on-device flag)
  // gets auto-hoisted by DOMParser's HTML5 parsing into the implied <head>, not <body> — per spec,
  // a <style> encountered before any other body content is inserted into the document's <head>.
  // Returning only doc.body.innerHTML silently drops it: the hide-on-device wrapper <div> and its
  // class survive (divs stay in body), but the CSS rule that makes that class actually hide
  // anything is gone, so the block renders visible on every device in the translation even though
  // it's correctly hidden in the original language. Pull any such head-hoisted styles back out.
  const headStyles = Array.from(doc.head.querySelectorAll("style"))
    .map((el) => el.outerHTML)
    .join("");

  return headStyles + doc.body.innerHTML;
}

/**
 * Safely format any value (string, object, Tiptap JSON, null, undefined) into a primitive string
 * to prevent Polaris TextField from throwing "contents.replace is not a function".
 */
function formatTextValue(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (typeof val === "object") {
    try {
      if (Array.isArray(val.content)) {
        const extractText = (node) => {
          if (!node) return "";
          if (node.text) return node.text;
          if (Array.isArray(node.content)) return node.content.map(extractText).join(" ");
          return "";
        };
        return val.content.map(extractText).join("\n").trim();
      }
      if (val.text && typeof val.text === "string") return val.text;
      if (val.code && typeof val.code === "string") return val.code;
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

/**
 * Strip HTML tags from a string so plain-text fields (like Excerpt)
 * are not rendered with raw markup. Uses a temporary DOM element
 * so entities (e.g. &amp;) are also decoded correctly.
 */
function stripHtml(html) {
  if (!html) return "";
  if (typeof html !== "string") return String(html);
  // If there's no HTML at all, return as-is
  if (!html.includes("<")) return html.trim();
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || "").trim();
}

// ── Live Auto-Translate preview ────────────────────────────────────────────────────────────
// translate.py streams each finished string as {original, translated}. To drop those into the
// form while the run is still going, the post's own HTML is rewritten with the translations
// received so far and fed through the same hydrateBlockTranslationsFromHtml() the final result
// uses. The walk below mirrors translate.py's translate_text() exactly (same attributes, same
// JSON keys, same text nodes), because translate.py's cache keys ARE those exact strings.
// Strings not translated yet become LIVE_PENDING rather than "" — an emptied text node would
// drop out of extractBlocksFromPost() and shift every later block's positional match — and a
// field is only filled in once its value contains no LIVE_PENDING at all.
const LIVE_PENDING = "";
const LIVE_FLAT_TEXT_ATTRS = new Set([
  "data-text", "data-title", "data-caption", "data-alt", "data-subheading",
  "data-heading", "data-button-text", "data-buttontext", "data-badge",
  "data-description", "data-question", "data-answer", "data-label",
  "data-cta-text", // HeroSection's CTA button label — see translate.py's matching FLAT_TEXT_ATTRS
]);
const LIVE_JSON_TEXT_KEYS = new Set([
  "text", "title", "content", "caption", "alt", "subheading", "heading",
  "buttonText", "badge", "description", "question", "answer", "name", "label",
]);

function liveTranslateString(str, liveMap) {
  if (typeof str !== "string" || !str.trim()) return str;
  if (str.includes("<") && str.includes(">")) return liveTranslateHtml(str, liveMap);
  return liveMap.has(str) ? liveMap.get(str) : LIVE_PENDING;
}

function liveTranslateJson(value, liveMap) {
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "string" && item.trim()
        ? liveTranslateString(item, liveMap)
        : item && typeof item === "object"
          ? liveTranslateJson(item, liveMap)
          : item
    );
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] =
        typeof v === "string" && LIVE_JSON_TEXT_KEYS.has(key) && v.trim()
          ? liveTranslateString(v, liveMap)
          : v && typeof v === "object"
            ? liveTranslateJson(v, liveMap)
            : v;
    }
    return out;
  }
  return value;
}

function liveTranslateHtml(html, liveMap) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  for (const node of textNodes) {
    const parentTag = node.parentNode?.nodeName?.toLowerCase();
    if (parentTag === "script" || parentTag === "style") continue;
    const original = node.nodeValue;
    if (!original || !original.trim()) continue;
    node.nodeValue = liveMap.has(original) ? liveMap.get(original) : LIVE_PENDING;
  }
  for (const el of doc.body.querySelectorAll("*")) {
    for (const attr of Array.from(el.attributes)) {
      const value = attr.value;
      if (!value || !value.trim()) continue;
      if (attr.name === "data-content") {
        el.setAttribute(attr.name, liveTranslateString(value, liveMap));
      } else if (LIVE_FLAT_TEXT_ATTRS.has(attr.name)) {
        el.setAttribute(attr.name, liveMap.has(value) ? liveMap.get(value) : LIVE_PENDING);
      } else if (value.startsWith("{") || value.startsWith("[")) {
        try {
          el.setAttribute(attr.name, JSON.stringify(liveTranslateJson(JSON.parse(value), liveMap)));
        } catch {
          /* not JSON after all — translate.py skips these too */
        }
      }
    }
  }
  return doc.body.innerHTML;
}

// Counts non-whitespace text nodes in an HTML string (plain text counts as one implicit node).
// Used to detect a partially-translated RichText field — see hydrateBlockTranslationsFromHtml's
// generic/RichText branch — by comparing this count between the original and translated HTML
// rather than trusting "the string isn't empty," which a single successful paragraph out of
// several would already satisfy.
function countNonEmptyTextNodes(html) {
  if (!html || !html.trim()) return 0;
  if (!html.includes("<")) return 1;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let count = 0;
  while (walker.nextNode()) {
    const parentTag = walker.currentNode.parentNode?.nodeName?.toLowerCase();
    if (parentTag === "script" || parentTag === "style") continue;
    if (walker.currentNode.nodeValue && walker.currentNode.nodeValue.trim()) count++;
  }
  return count;
}

// Merges a live-hydrated block map into the current one, taking only fields that are fully
// translated (no LIVE_PENDING left) and actually differ from the English original. The latter
// matters because hydrateBlockTranslationsFromHtml() falls back to the original text for fields
// translate.py never touches — those must not be shown as "translated" mid-run. The final
// server result still replaces everything once the run completes.
function mergeLiveTranslations(current, next, original) {
  if (typeof next === "string") {
    const done = next.trim() && !next.includes(LIVE_PENDING) && next !== original;
    return done ? next : current;
  }
  if (Array.isArray(next)) {
    const base = Array.isArray(current) ? [...current] : [];
    next.forEach((value, i) => {
      base[i] = mergeLiveTranslations(base[i], value, Array.isArray(original) ? original[i] : undefined);
    });
    return base;
  }
  if (next && typeof next === "object") {
    const base = current && typeof current === "object" && !Array.isArray(current) ? { ...current } : {};
    for (const [key, value] of Object.entries(next)) {
      base[key] = mergeLiveTranslations(base[key], value, original && typeof original === "object" ? original[key] : undefined);
    }
    return base;
  }
  return current ?? next;
}

// The AI generator stamps every image it couldn't source a real picture for with this exact
// alt text (see AiArticleService.js) — it's an internal "you still need to add a photo" marker,
// never real merchant-facing copy. It isn't part of BlockRegistry's own defaults (Image.alt's
// default is ""), so it needs its own explicit check alongside the generic one below.
const AI_PLACEHOLDER_IMAGE_ALT = "Placeholder - replace with your own image";

function isBlankField(val) {
  if (val === null || val === undefined) return true;
  const text = stripHtml(formatTextValue(val));
  return !text.trim();
}

// General form of "this is scaffold, not real content": a block's own BlockRegistry
// defaultSettings IS exactly the value it's created with (Heading's "Your Heading", Callout's
// "Did you know?", ButtonBlock's "Click Here", a commerce block's "Add to Cart", etc.) — a
// field still equal to that value is something nobody has actually written, for ANY block
// type, not a one-off case for a particular block. Only compares plain string defaults; a
// block-specific check (like the AI image alt above, or FaqBlock's sample items below) is
// still needed for values BlockRegistry itself doesn't default to non-blank.
function isUnmodifiedDefaultField(blockType, fieldKey, val) {
  if (val === null || val === undefined) return false;
  const defaultVal = BlockRegistry[blockType]?.defaultSettings?.[fieldKey];
  if (typeof defaultVal !== "string" || !defaultVal.trim()) return false;
  return String(val).trim() === defaultVal.trim();
}

// FaqBlock scaffolds with 3 sample Q&As (see BlockRegistry.jsx) — an untouched block still
// carrying that exact sample array is just as un-customized as any single default string field.
function isUnmodifiedDefaultItems(blockType, fieldKey, items) {
  const defaultItems = BlockRegistry[blockType]?.defaultSettings?.[fieldKey];
  if (!Array.isArray(defaultItems) || !Array.isArray(items) || items.length !== defaultItems.length) return false;
  return items.every((item, i) => {
    const d = defaultItems[i] || {};
    return (item?.question || "").trim() === (d.question || "").trim() && (item?.answer || "").trim() === (d.answer || "").trim();
  });
}

// The single check every field-level "is this worth translating" decision below goes through —
// blank, OR still the block's own untouched scaffold default, OR the AI generator's own
// image-placeholder marker.
function fieldNeedsTranslation(blockType, fieldKey, val) {
  if (isBlankField(val)) return false;
  if (isUnmodifiedDefaultField(blockType, fieldKey, val)) return false;
  if (blockType === "Image" && fieldKey === "alt" && String(val).trim() === AI_PLACEHOLDER_IMAGE_ALT) return false;
  return true;
}

/**
 * Whether a content block has at least one field actually worth translating. A block whose
 * every relevant field is empty, or still exactly the scaffold value it was created with (see
 * fieldNeedsTranslation), only pads out the block list and drags down the translated-percentage
 * without giving the merchant anything real to translate.
 */
function blockHasTranslatableContent(block) {
  const s = block.settings || {};
  const t = block.type;
  switch (t) {
    case "Heading":
    case "ButtonBlock":
      return fieldNeedsTranslation(t, "text", s.text);
    case "FaqBlock":
    case "faq": {
      const itemsAreDefault = isUnmodifiedDefaultItems("FaqBlock", "items", s.items);
      return (
        fieldNeedsTranslation(t, "title", s.title) ||
        (!itemsAreDefault && Array.isArray(s.items) && s.items.some((item) => !isBlankField(item.question) || !isBlankField(item.answer)))
      );
    }
    case "Callout":
      return fieldNeedsTranslation(t, "title", s.title) || fieldNeedsTranslation(t, "body", s.body || s.text);
    case "Hero":
    case "HeroSection":
      return (
        fieldNeedsTranslation(t, "heading", s.heading || s.title) ||
        fieldNeedsTranslation(t, "subheading", s.subheading || s.body) ||
        fieldNeedsTranslation(t, "ctaText", s.ctaText || s.buttonText)
      );
    case "TableOfContents":
      return fieldNeedsTranslation(t, "title", s.title);
    case "Image":
      return fieldNeedsTranslation(t, "alt", s.alt) || fieldNeedsTranslation(t, "caption", s.caption);
    case "VideoEmbed":
      return fieldNeedsTranslation(t, "caption", s.caption);
    case "BuyButton":
      return fieldNeedsTranslation(t, "buttonText", s.buttonText) || fieldNeedsTranslation(t, "badge", s.badge);
    case "ProductGrid":
    case "Collection":
    case "ProductSlider":
      return fieldNeedsTranslation(t, "title", s.title || s.heading) || fieldNeedsTranslation(t, "buttonText", s.buttonText);
    case "ProductCard":
      return fieldNeedsTranslation(t, "buttonText", s.buttonText);
    case "Table":
      return Array.isArray(s.tableData) && s.tableData.some((row) => row.some((cell) => !isBlankField(cell)));
    default:
      return !isBlankField(s.content || s.text || (typeof s === "string" ? s : ""));
  }
}

// Live Auto-Translate status: "N of total" with a determinate bar and the section that just
// finished. `total` comes from translate.py's up-front "plan" event, so it's the real number of
// strings in this post, not an estimate.
const PROVIDER_DISPLAY_NAMES = { google: "Google", deepl: "DeepL", libretranslate: "LibreTranslate", mymemory: "MyMemory", cache: "cache" };

function LiveTranslateProgress({ progress, compact = false }) {
  const { count = 0, total = 0, label, cached, provider, failed = 0 } = progress;
  const percent = total > 0 ? Math.min(100, Math.round((count / total) * 100)) : 0;
  // "Text segments" here is a deliberately different, finer-grained count than the "N of M
  // fields translated" badge above this component (see completionStats) — that one counts
  // editable field rows (Title, Excerpt, a FAQ's Question #1, ...), one per row regardless of
  // length; this one counts every individual text node/attribute translate.py walks inside the
  // raw HTML (a single RichText field can contain several paragraph text nodes counted
  // separately). Both numbers are correct for what they measure — the label says which.
  const headline =
    total > 0 && count > 0
      ? `Translating ${Math.min(count, total)} of ${total} text segments (${percent}%)`
      : label || "Starting…";
  const providerName = provider && PROVIDER_DISPLAY_NAMES[provider];

  return (
    <BlockStack gap="200">
      <InlineStack gap="200" blockAlign="center" wrap={false}>
        <Spinner size="small" />
        {/* min-width: 0 is required for a flex child to actually shrink below its content's
            natural width — without it, `wrap={false}` on the InlineStack above just lets long
            "Just translated: ..." lines overflow past the box edge instead of truncating (the
            bug this fixes: text visibly spilling outside the floating progress card). */}
        <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
          <BlockStack gap="050">
            <Text variant="bodySm" fontWeight="semibold" truncate>{headline}</Text>
            {count > 0 && label && (
              <Text variant="bodySm" tone="subdued" truncate>
                {cached ? "Reused from a previous run: " : "Just translated: "}
                {label}
                {providerName ? ` (${providerName})` : ""}
                {failed > 0 ? ` · ${failed} couldn't be translated` : ""}
              </Text>
            )}
          </BlockStack>
        </div>
      </InlineStack>
      <ProgressBar progress={percent} size="small" tone="primary" animated />
    </BlockStack>
  );
}

// Helper component for side-by-side field pairs with matching Polaris chrome
function TranslationRowPair({ title, originalValue, translatedValue, onChange, multiline, maxLength, placeholder }) {
  const safeOriginal = formatTextValue(originalValue);
  const safeTranslated = formatTextValue(translatedValue);
  const isOriginalEmpty = !safeOriginal.trim();

  return (
    <BlockStack gap="200">
      <Text variant="headingSm" as="h3" tone="base">
        {title}
      </Text>
      <InlineGrid columns={["oneHalf", "oneHalf"]} gap="400" alignItems="start">
        {/* Left Side: Original Read-Only Reference */}
        <TextField
          label={`Original ${title}`}
          labelHidden
          value={isOriginalEmpty ? "" : safeOriginal}
          placeholder={isOriginalEmpty ? "No content provided." : ""}
          readOnly
          multiline={multiline}
          autoComplete="off"
        />
        {/* Right Side: Editable Translated Input */}
        <TextField
          label={`Translated ${title}`}
          labelHidden
          value={safeTranslated}
          onChange={onChange}
          multiline={multiline}
          maxLength={maxLength}
          showCharacterCount={Boolean(maxLength)}
          placeholder={placeholder || `Enter translated ${title.toLowerCase()}...`}
          autoComplete="off"
        />
      </InlineGrid>
    </BlockStack>
  );
}

// Block Icon mapper
function getBlockIcon(type) {
  switch (type) {
    case "FaqBlock":
    case "faq":
      return InfoIcon;
    case "Heading":
    case "heading":
      return TextTitleIcon;
    case "Hero":
    case "HeroSection":
      return LayoutSectionIcon;
    case "Callout":
      return TextIcon;
    case "Table":
      return DataTableIcon;
    case "Image":
      return ImageWithTextOverlayIcon;
    default:
      return CodeAddIcon;
  }
}

export default function PostTranslationPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [post, setPost] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  // Live section-by-section feedback while Auto-Translate streams (see handleAutoTranslate) —
  // null when not translating, otherwise { count, label, resuming, cachedCount }.
  const [translateProgress, setTranslateProgress] = useState(null);
  const [translations, setTranslations] = useState([]);
  const [storeLocales, setStoreLocales] = useState([]);

  // Selected locale for translation
  const [selectedLocale, setSelectedLocale] = useState("");
  const [toast, setToast] = useState(null);

  // Core Form Fields
  const [translatedTitle, setTranslatedTitle] = useState("");
  const [translatedExcerpt, setTranslatedExcerpt] = useState("");
  const [translatedContent, setTranslatedContent] = useState("");
  const [translatedMetaTitle, setTranslatedMetaTitle] = useState("");
  const [translatedMetaDesc, setTranslatedMetaDesc] = useState("");

  // Block AST & Block Translations
  const [originalBlocks, setOriginalBlocks] = useState([]);
  const [blockTranslations, setBlockTranslations] = useState({});
  const [features, setFeatures] = useState({});
  const [featuresLoaded, setFeaturesLoaded] = useState(false);

  // Blocks with nothing real to translate (empty fields, or an Image still carrying the AI
  // generator's own placeholder alt text) are excluded from the list shown to the merchant —
  // they'd otherwise just pad out the block count and drag down the translated percentage.
  const translatableBlocks = useMemo(
    () =>
      originalBlocks
        .map((block, bIdx) => ({ block, bIdx }))
        .filter(({ block }) => blockHasTranslatableContent(block)),
    [originalBlocks]
  );

  // Label for selected locale
  const selectedLocaleObj = useMemo(() => {
    return storeLocales.find((l) => l.value === selectedLocale);
  }, [storeLocales, selectedLocale]);

  // Load Post, Locales, and Saved Translations
  const loadTranslations = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/${id}/translations`);
      const data = await res.json();
      setTranslations(data.translations || []);
    } catch { }
  }, [id]);

  const loadLocales = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts/shopify/locales`);
      const data = await res.json();
      const mappedLocales = (data.locales || []).map((l) => ({
        label: `${l.name} (${l.locale})`,
        value: l.locale,
      }));
      setStoreLocales(mappedLocales);
      if (mappedLocales.length > 0) {
        setSelectedLocale(mappedLocales[0].value);
      }
    } catch { }
  }, []);

  useEffect(() => {
    async function loadPost() {
      try {
        const res = await fetch(`/api/posts/${id}`);
        const data = await res.json();
        const loadedPost = data.post;
        setPost(loadedPost);

        // Extract original structured blocks
        const blocks = extractBlocksFromPost(loadedPost);
        setOriginalBlocks(blocks);
      } catch {
      } finally {
        setIsLoading(false);
      }
    }
    loadPost();
    loadTranslations();
    loadLocales();
    fetch("/api/posts/plan/features")
      .then((r) => r.json())
      .then((d) => setFeatures(d.features || {}))
      .catch(() => {})
      .finally(() => setFeaturesLoaded(true));
  }, [id, loadTranslations, loadLocales]);

  // Helper to re-hydrate block translation state from translated HTML/blocks
  const hydrateBlockTranslationsFromHtml = useCallback((translatedHtml, blocks) => {
    if (!translatedHtml || blocks.length === 0) return {};
    const parsedTranslatedBlocks = extractBlocksFromPost({ contentHtml: translatedHtml });

    // Positional-per-type matching: blocks of the same type are matched in the order they
    // appear (Nth Heading in the original <-> Nth Heading in the translated output), since
    // neither side carries a shared stable ID once parsed from raw HTML. Grouping by type
    // (instead of one big index) keeps unrelated block types — e.g. an Image inserted
    // between two Headings — from throwing off each other's alignment.
    const byType = new Map();
    for (const b of parsedTranslatedBlocks) {
      const list = byType.get(b.type) || [];
      list.push(b);
      byType.set(b.type, list);
    }
    const typeCounters = new Map();
    const nextOfType = (type) => {
      const list = byType.get(type) || [];
      const i = typeCounters.get(type) || 0;
      typeCounters.set(type, i + 1);
      return list[i];
    };

    const initialMap = {};

    blocks.forEach((origBlock, idx) => {
      const origSettings = origBlock.settings || {};
      const matchingTransBlock = nextOfType(origBlock.type) || parsedTranslatedBlocks[idx];
      const transSettings = matchingTransBlock?.settings || {};

      // Deliberately NEVER falls back to origSettings here: a translated field that's empty
      // (translate.py returns "" for a unit every provider failed on, see do_translate) must
      // stay blank in this editable column. Falling back to the English original would make a
      // failed translation indistinguishable from a real one — the merchant would see English
      // text sitting in the Hindi/French/etc. field with no sign anything went wrong. The
      // Original/English reference column (driven from origSettings directly, not this map)
      // is the only place English is meant to show.
      if (origBlock.type === "Heading" || origBlock.type === "heading") {
        initialMap[origBlock.id] = { text: formatTextValue(transSettings.text) };
      } else if (origBlock.type === "FaqBlock" || origBlock.type === "faq") {
        const origItems = Array.isArray(origSettings.items) ? origSettings.items : [];
        const transItems = Array.isArray(transSettings.items) ? transSettings.items : [];
        initialMap[origBlock.id] = {
          title: formatTextValue(transSettings.title),
          items: origItems.map((item, i) => ({
            question: formatTextValue(transItems[i]?.question),
            answer: formatTextValue(transItems[i]?.answer),
          })),
        };
      } else if (origBlock.type === "Callout") {
        initialMap[origBlock.id] = {
          title: formatTextValue(transSettings.title),
          body: formatTextValue(transSettings.body),
        };
      } else if (origBlock.type === "Hero" || origBlock.type === "HeroSection") {
        initialMap[origBlock.id] = {
          heading: formatTextValue(transSettings.heading),
          subheading: formatTextValue(transSettings.subheading),
          ctaText: formatTextValue(transSettings.ctaText),
        };
      } else if (origBlock.type === "TableOfContents") {
        initialMap[origBlock.id] = { title: formatTextValue(transSettings.title) };
      } else if (origBlock.type === "Image") {
        initialMap[origBlock.id] = {
          alt: formatTextValue(transSettings.alt),
          caption: formatTextValue(transSettings.caption),
        };
      } else if (origBlock.type === "VideoEmbed") {
        initialMap[origBlock.id] = { caption: formatTextValue(transSettings.caption) };
      } else if (origBlock.type === "ButtonBlock") {
        initialMap[origBlock.id] = { text: formatTextValue(transSettings.text) };
      } else if (origBlock.type === "BuyButton") {
        initialMap[origBlock.id] = {
          buttonText: formatTextValue(transSettings.buttonText),
          badge: formatTextValue(transSettings.badge),
        };
      } else if (["ProductGrid", "Collection", "ProductSlider"].includes(origBlock.type)) {
        initialMap[origBlock.id] = {
          title: formatTextValue(transSettings.title),
          buttonText: formatTextValue(transSettings.buttonText),
        };
      } else if (origBlock.type === "ProductCard") {
        initialMap[origBlock.id] = { buttonText: formatTextValue(transSettings.buttonText) };
      } else if (origBlock.type === "Table") {
        const origRows = Array.isArray(origSettings.tableData) ? origSettings.tableData : [];
        const transRows = Array.isArray(transSettings.tableData) ? transSettings.tableData : [];
        initialMap[origBlock.id] = {
          tableData: origRows.map((row, r) => row.map((_cell, c) => formatTextValue(transRows[r]?.[c]))),
        };
      } else {
        // RichText paragraph / generic fallback. Unlike every other field above, this one is a
        // raw HTML blob that can itself contain several separately-translated text nodes (each
        // paragraph is its own translate.py unit) — so "not blank" alone doesn't mean "fully
        // translated," only "at least one paragraph succeeded." contentComplete compares how
        // many non-empty text nodes the translated HTML has against the original, so a field
        // where e.g. 2 of 3 paragraphs failed is flagged incomplete instead of counted as done
        // (see completionStats' matching check).
        const origContent = formatTextValue(origSettings.content ?? origSettings.text);
        const transContent = formatTextValue(transSettings.content ?? transSettings.text);
        initialMap[origBlock.id] = {
          content: transContent,
          contentComplete: countNonEmptyTextNodes(transContent) >= countNonEmptyTextNodes(origContent),
        };
      }
    });

    return initialMap;
  }, []);

  // Load existing translation into form when locale changes
  useEffect(() => {
    const found = translations.find((t) => t.locale === selectedLocale);
    if (found) {
      setTranslatedTitle(found.title || "");
      setTranslatedExcerpt(stripHtml(found.excerpt || ""));
      const contentHtml = found.contentHtml || "";
      setTranslatedContent(contentHtml);
      setTranslatedMetaTitle(found.metaTitle || "");
      setTranslatedMetaDesc(stripHtml(found.metaDescription || ""));

      // Populate block translations map
      if (originalBlocks.length > 0) {
        const blockMap = hydrateBlockTranslationsFromHtml(contentHtml, originalBlocks);
        setBlockTranslations(blockMap);
      }
    } else {
      setTranslatedTitle("");
      setTranslatedExcerpt("");
      setTranslatedContent("");
      setTranslatedMetaTitle("");
      setTranslatedMetaDesc("");
      setBlockTranslations({});
    }
  }, [selectedLocale, translations, originalBlocks, hydrateBlockTranslationsFromHtml]);

  // Handler to update specific block translation field
  const handleBlockTranslationChange = (blockId, fieldPath, value) => {
    setBlockTranslations((prev) => {
      const current = prev[blockId] ? { ...prev[blockId] } : {};

      if (fieldPath.includes(".")) {
        const [parentKey, indexStr, childKey] = fieldPath.split(".");
        const idx = parseInt(indexStr, 10);
        const list = Array.isArray(current[parentKey]) ? [...current[parentKey]] : [];
        if (parentKey === "tableData") {
          // 2D array (rows of cells), not an array of named-field objects like FAQ items —
          // childKey here is a column index, not an object key.
          const colIdx = parseInt(childKey, 10);
          const row = Array.isArray(list[idx]) ? [...list[idx]] : [];
          row[colIdx] = value;
          list[idx] = row;
        } else {
          list[idx] = { ...list[idx], [childKey]: value };
        }
        current[parentKey] = list;
      } else {
        current[fieldPath] = value;
        // A merchant editing a RichText field's content directly means they're now the
        // authority on it — it must count as complete regardless of the auto-translate-derived
        // contentComplete flag set by hydrateBlockTranslationsFromHtml, or a manual fix for a
        // partially-failed field would still show as incomplete after the merchant fixed it.
        if (fieldPath === "content") current.contentComplete = true;
      }

      const updatedMap = { ...prev, [blockId]: current };

      // Reconstruct clean HTML without raw tags in editor
      if (post?.contentHtml) {
        const updatedHtml = applyBlockTranslationsToHtml(post.contentHtml, originalBlocks, updatedMap);
        setTranslatedContent(updatedHtml);
      }

      return updatedMap;
    });
  };

  // Calculate dirty state
  const isDirty = useMemo(() => {
    const found = translations.find((t) => t.locale === selectedLocale) || {};
    return (
      (translatedTitle || "") !== (found.title || "") ||
      (translatedExcerpt || "") !== (found.excerpt || "") ||
      (translatedContent || "") !== (found.contentHtml || "") ||
      (translatedMetaTitle || "") !== (found.metaTitle || "") ||
      (translatedMetaDesc || "") !== (found.metaDescription || "")
    );
  }, [
    translations,
    selectedLocale,
    translatedTitle,
    translatedExcerpt,
    translatedContent,
    translatedMetaTitle,
    translatedMetaDesc,
  ]);

  // Translation Completeness Stats
  const completionStats = useMemo(() => {
    let total = 4; // Title, Excerpt, MetaTitle, MetaDesc
    let filled = 0;

    if (translatedTitle.trim()) filled++;
    if (translatedExcerpt.trim()) filled++;
    if (translatedMetaTitle.trim()) filled++;
    if (translatedMetaDesc.trim()) filled++;

    // Only blank-vs-filled among the SAME fields the block form actually renders per type
    // (mirrors the JSX below), and only fields fieldNeedsTranslation considers real content —
    // a field with nothing in the original, or still the block's own untouched scaffold
    // default, isn't something the merchant can translate, so it must not count toward total.
    const countField = (counts, blockType, fieldKey, originalVal, translatedVal) => {
      if (!fieldNeedsTranslation(blockType, fieldKey, originalVal)) return;
      counts.total++;
      if (!isBlankField(translatedVal)) counts.filled++;
    };

    translatableBlocks.forEach(({ block }) => {
      const trans = blockTranslations[block.id] || {};
      const s = block.settings || {};
      const t = block.type;
      const counts = { total: 0, filled: 0 };

      switch (t) {
        case "Heading":
        case "ButtonBlock":
          countField(counts, t, "text", s.text, trans.text);
          break;
        case "FaqBlock":
        case "faq": {
          countField(counts, t, "title", s.title, trans.title);
          const itemsAreDefault = isUnmodifiedDefaultItems("FaqBlock", "items", s.items);
          if (!itemsAreDefault) {
            (s.items || []).forEach((item, i) => {
              if (!isBlankField(item.question)) {
                counts.total++;
                if (!isBlankField(trans.items?.[i]?.question)) counts.filled++;
              }
              if (!isBlankField(item.answer)) {
                counts.total++;
                if (!isBlankField(trans.items?.[i]?.answer)) counts.filled++;
              }
            });
          }
          break;
        }
        case "Callout":
          countField(counts, t, "title", s.title, trans.title);
          countField(counts, t, "body", s.body || s.text, trans.body);
          break;
        case "Hero":
        case "HeroSection":
          countField(counts, t, "heading", s.heading || s.title, trans.heading);
          countField(counts, t, "subheading", s.subheading || s.body, trans.subheading);
          countField(counts, t, "ctaText", s.ctaText || s.buttonText, trans.ctaText);
          break;
        case "TableOfContents":
          countField(counts, t, "title", s.title, trans.title);
          break;
        case "Image":
          countField(counts, t, "alt", s.alt, trans.alt);
          countField(counts, t, "caption", s.caption, trans.caption);
          break;
        case "VideoEmbed":
          countField(counts, t, "caption", s.caption, trans.caption);
          break;
        case "BuyButton":
          countField(counts, t, "buttonText", s.buttonText, trans.buttonText);
          countField(counts, t, "badge", s.badge, trans.badge);
          break;
        case "ProductGrid":
        case "Collection":
        case "ProductSlider":
          countField(counts, t, "title", s.title || s.heading, trans.title);
          countField(counts, t, "buttonText", s.buttonText, trans.buttonText);
          break;
        case "ProductCard":
          countField(counts, t, "buttonText", s.buttonText, trans.buttonText);
          break;
        case "Table":
          (s.tableData || []).forEach((row, r) => {
            row.forEach((cell, c) => {
              if (!isBlankField(cell)) {
                counts.total++;
                if (!isBlankField(trans.tableData?.[r]?.[c])) counts.filled++;
              }
            });
          });
          break;
        default:
          if (!isBlankField(s.content || s.text || (typeof s === "string" ? s : ""))) {
            counts.total++;
            // contentComplete (set by hydrateBlockTranslationsFromHtml) catches a RichText field
            // where only some of its paragraphs translated — that must not count as "filled"
            // just because the field as a whole isn't blank.
            if (!isBlankField(trans.content) && trans.contentComplete !== false) counts.filled++;
          }
      }

      total += counts.total;
      filled += counts.filled;
    });

    const percentage = total > 0 ? Math.round((filled / total) * 100) : 0;
    return { filled, total, percentage };
  }, [translatedTitle, translatedExcerpt, translatedMetaTitle, translatedMetaDesc, translatableBlocks, blockTranslations]);

  const isFirstRender = useRef(true);
  const saveBarId = "translation-save-bar";

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (window.shopify?.saveBar) {
      if (isDirty) {
        window.shopify.saveBar.show(saveBarId).catch(() => { });
      } else {
        window.shopify.saveBar.hide(saveBarId).catch(() => { });
      }
    }
  }, [isDirty]);

  useEffect(() => {
    return () => {
      if (window.shopify?.saveBar) {
        window.shopify.saveBar.hide(saveBarId).catch(() => { });
      }
    };
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/posts/${id}/translations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: selectedLocale,
          title: translatedTitle,
          excerpt: translatedExcerpt,
          contentHtml: translatedContent,
          metaTitle: translatedMetaTitle,
          metaDescription: translatedMetaDesc,
        }),
      });
      if (!res.ok) throw new Error("Save translation failed");
      setToast({ content: "✅ Translation saved successfully" });
      await loadTranslations();
      if (window.shopify?.saveBar) {
        window.shopify.saveBar.hide(saveBarId).catch(() => { });
      }
    } catch {
      setToast({ content: "❌ Failed to save translation", error: true });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAutoTranslate = async () => {
    if (!post || !selectedLocale) return;
    setIsTranslating(true);
    setTranslateProgress({ count: 0, total: 0, label: "Starting…" });

    // Every string translated so far this run (original -> translated). Re-applied to the post
    // on a short throttle so each field fills in as soon as all of its text has arrived.
    const liveMap = new Map();
    const englishBlockMap =
      post.contentHtml && originalBlocks.length > 0
        ? hydrateBlockTranslationsFromHtml(post.contentHtml, originalBlocks)
        : {};
    let liveFlushTimer = null;
    const flushLiveTranslations = () => {
      liveFlushTimer = null;
      const liveTopLevel = (source) => {
        if (!source || !source.trim()) return null;
        const value = liveTranslateString(source, liveMap);
        return value && !value.includes(LIVE_PENDING) ? value : null;
      };
      const title = liveTopLevel(post.title);
      if (title !== null) setTranslatedTitle(title);
      const excerpt = liveTopLevel(post.excerpt);
      if (excerpt !== null) setTranslatedExcerpt(stripHtml(excerpt));
      const metaTitle = liveTopLevel(post.metaTitle || post.title);
      if (metaTitle !== null) setTranslatedMetaTitle(metaTitle);
      const metaDescription = liveTopLevel(post.metaDescription || post.excerpt);
      if (metaDescription !== null) setTranslatedMetaDesc(stripHtml(metaDescription));

      if (post.contentHtml && originalBlocks.length > 0) {
        const liveBlockMap = hydrateBlockTranslationsFromHtml(liveTranslateHtml(post.contentHtml, liveMap), originalBlocks);
        setBlockTranslations((current) => mergeLiveTranslations(current, liveBlockMap, englishBlockMap));
      }
    };
    const scheduleLiveFlush = () => {
      if (!liveFlushTimer) liveFlushTimer = setTimeout(flushLiveTranslations, 150);
    };

    try {
      const res = await fetch(`/api/posts/${id}/translate-auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: selectedLocale }),
      });

      // The route streams NDJSON (one JSON object per line) as translation progresses instead
      // of one big buffered response — this is what makes the block-by-block progress below
      // live, and (via the server's own incremental DB writes as each line arrives) is also
      // why a run interrupted partway through isn't lost: the next click resumes from there.
      if (!res.ok || !res.body) {
        const rawBody = await res.text().catch(() => "");
        let data = {};
        try {
          data = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          throw new Error(`Translation failed (server returned status ${res.status}). Please try again.`);
        }
        throw new Error(data.error || "Auto-translate failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalEvent = null;
      let streamError = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // keep the last, possibly-incomplete line for the next chunk

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue; // ignore a malformed line rather than aborting a mostly-working stream
          }

          if (event.type === "start") {
            setTranslateProgress((p) => ({
              ...p,
              label: event.resuming ? `Resuming — ${event.cachedCount} section${event.cachedCount === 1 ? "" : "s"} already translated` : "Starting…",
            }));
          } else if (event.type === "plan") {
            setTranslateProgress((p) => ({ ...p, total: event.total }));
          } else if (event.type === "progress") {
            setTranslateProgress((p) => ({
              ...p,
              count: event.count,
              label: event.label,
              cached: event.cached,
              provider: event.provider,
              failed: (p?.failed || 0) + (event.succeeded === false ? 1 : 0),
            }));
            // Failed strings come back as the untouched English — never show those as translated.
            if (event.succeeded !== false && typeof event.original === "string") {
              liveMap.set(event.original, event.translated);
              scheduleLiveFlush();
            }
          } else if (event.type === "complete" || event.type === "error") {
            finalEvent = event;
          }
        }
      }

      // Apply anything still waiting on the throttle before the final result lands, so an
      // interrupted run (no "complete" event) still leaves every finished field filled in.
      if (liveFlushTimer) {
        clearTimeout(liveFlushTimer);
        flushLiveTranslations();
      }

      if (!finalEvent) {
        throw new Error("Connection to the translation server was lost. Whatever finished before that was saved — click Auto-Translate again to resume.");
      }
      if (finalEvent.type === "error") {
        streamError = finalEvent.message;
      }

      if (streamError) {
        setToast({ content: `⚠️ ${streamError}`, error: true });
      } else if (finalEvent.warning) {
        // A section that fails on every translation provider is saved blank, never as the
        // English original (see translate.py's do_translate/translate_text), so a "successful"
        // response can still have unresolved blank fields. `warning` is how the server surfaces
        // that instead of it silently passing as a complete translation.
        setToast({ content: `⚠️ ${finalEvent.warning}`, error: true });
      } else {
        setToast({ content: "✨ Translation generated and saved successfully!" });
      }

      if (finalEvent.translation) {
        setTranslatedTitle(finalEvent.translation.title || "");
        setTranslatedExcerpt(stripHtml(finalEvent.translation.excerpt || ""));
        const contentHtml = finalEvent.translation.contentHtml || "";
        setTranslatedContent(contentHtml);
        setTranslatedMetaTitle(finalEvent.translation.metaTitle || "");
        setTranslatedMetaDesc(stripHtml(finalEvent.translation.metaDescription || ""));

        // Hydrate block translations
        if (originalBlocks.length > 0) {
          const blockMap = hydrateBlockTranslationsFromHtml(contentHtml, originalBlocks);
          setBlockTranslations(blockMap);
        }
      }

      await loadTranslations();
    } catch (err) {
      setToast({ content: `❌ ${err.message}`, error: true });
    } finally {
      setIsTranslating(false);
      setTranslateProgress(null);
    }
  };

  if (isLoading) {
    return (
      <Frame>
        <Page>
          <Box padding="800" align="center">
            <Spinner />
          </Box>
        </Page>
      </Frame>
    );
  }

  if (featuresLoaded && !features.translations?.enabled) {
    return (
      <Frame>
        <TitleBar title="Translate">
          <button variant="breadcrumb" onClick={() => navigate(`/posts/${id}/edit`)}>
            Back to edit
          </button>
        </TitleBar>
        <Page title="Translate" backAction={{ onAction: () => navigate(-1) }}>
          <Layout>
            <Layout.Section>
              <UpgradePrompt
                requiredPlan="Pro"
                title="Multi-language translation is a Pro feature"
                description="Upgrade to Pro to translate this article into other languages."
              />
            </Layout.Section>
          </Layout>
        </Page>
      </Frame>
    );
  }

  if (!post) {
    return (
      <Frame>
        <Page title="Post not found">
          <Banner tone="critical">The requested article could not be loaded.</Banner>
        </Page>
      </Frame>
    );
  }

  return (
    <Frame>
      <TitleBar title="Translate post">
        <button variant="breadcrumb" onClick={() => navigate(`/posts/${id}/edit`)}>
          Back to edit
        </button>
      </TitleBar>
      {toast && (
        <Toast content={toast.content} error={toast.error} onDismiss={() => setToast(null)} />
      )}

      {/* Floating copy of the live progress, so it stays visible while the merchant scrolls
          down through the blocks to watch their fields fill in. Pinned via position:fixed —
          inside Shopify's embedded admin iframe, "fixed" is relative to the iframe's own
          document (which resizes to the full page height, not just the visible viewport), so
          this ends up wherever the LONG page's bottom happens to be, not glued to the actual
          bottom of the screen the merchant sees. Harmless in practice here since the box's own
          content no longer overflows its bounds (see LiveTranslateProgress's truncate fix) —
          it can still land mid-page while scrolling, but it no longer spills text outside itself
          when it does. */}
      {translateProgress && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            width: "min(420px, calc(100vw - 32px))",
            maxWidth: "calc(100vw - 32px)",
            zIndex: 520,
            background: "var(--p-color-bg-surface)",
            border: "1px solid var(--p-color-border)",
            borderRadius: "12px",
            boxShadow: "var(--p-shadow-400)",
            padding: "12px 14px",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          <LiveTranslateProgress progress={translateProgress} compact />
        </div>
      )}

      {/* Always-mounted SaveBar — visibility controlled by window.shopify.saveBar.show/hide */}
      <ui-save-bar id={saveBarId}>
        <button variant="primary" onClick={handleSave} loading={isSaving ? "" : undefined}>
          Save
        </button>
        <button
          onClick={() => {
            const found = translations.find((t) => t.locale === selectedLocale);
            setTranslatedTitle(found?.title || "");
            setTranslatedExcerpt(stripHtml(found?.excerpt || ""));
            setTranslatedContent(found?.contentHtml || "");
            setTranslatedMetaTitle(found?.metaTitle || "");
            setTranslatedMetaDesc(stripHtml(found?.metaDescription || ""));
            // Reset block translations to match the saved state
            if (found?.contentHtml && originalBlocks.length > 0) {
              const blockMap = hydrateBlockTranslationsFromHtml(found.contentHtml, originalBlocks);
              setBlockTranslations(blockMap);
            } else {
              setBlockTranslations({});
            }
          }}
        >
          Discard
        </button>
      </ui-save-bar>

      <Page
        backAction={{
          ...smartBackAction(navigate, location, `/posts/${id}/edit`, "Back to edit"),
          icon: ArrowLeftIcon,
        }}
        title="Translate post"
        subtitle={`Translating: ${post.title}`}
      >
        <Layout>
          {/* Top Control Bar & Translation Completeness Status */}
          <Layout.Section>
            <Card padding="500">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    <Box width="280px">
                      <Select
                        label="Target language"
                        labelHidden
                        options={storeLocales}
                        value={selectedLocale}
                        onChange={(newLocale) => setSelectedLocale(newLocale)}
                        disabled={storeLocales.length === 0}
                      />
                    </Box>
                    <Badge tone={completionStats.percentage === 100 ? "success" : "attention"} size="medium">
                      {completionStats.percentage === 100 ? "Fully translated (100%)" : `${completionStats.filled} of ${completionStats.total} fields translated (${completionStats.percentage}%)`}
                    </Badge>
                  </InlineStack>

                  <InlineStack gap="200">
                    <Button
                      variant="primary"
                      icon={LanguageIcon}
                      onClick={handleAutoTranslate}
                      loading={isTranslating}
                      disabled={storeLocales.length === 0}
                    >
                      Auto-Translate this Language
                    </Button>
                    <Button
                      variant="secondary"
                      icon={SaveIcon}
                      onClick={handleSave}
                      loading={isSaving}
                      disabled={!isDirty}
                    >
                      Save Translation
                    </Button>
                  </InlineStack>
                </InlineStack>

                {/* Progress Bar */}
                <Box paddingBlockStart="200">
                  <ProgressBar progress={completionStats.percentage} size="small" tone={completionStats.percentage === 100 ? "success" : "primary"} />
                </Box>

                {/* Live section-by-section Auto-Translate feed — see handleAutoTranslate's
                    streamed NDJSON progress events. "Fields" above counts editable rows (Title,
                    a FAQ's Question #1, ...); "text segments" below counts the individual pieces
                    of text within them (a single field can contain several) — different counts
                    by design, not a bug, so the label says which is which. */}
                {translateProgress && (
                  <BlockStack gap="150">
                    <Text variant="bodySm" tone="subdued">
                      Fields (above) = editable rows · Text segments (below) = individual pieces of text within them
                    </Text>
                    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                      <LiveTranslateProgress progress={translateProgress} />
                    </Box>
                  </BlockStack>
                )}

                {storeLocales.length === 0 && (
                  <Banner tone="warning" icon={AlertCircleIcon}>
                    No active secondary languages found in your store. Add and publish languages in your Shopify Settings.
                  </Banner>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Sticky Column Headers for Visual & Contextual Clarity */}
          <Layout.Section>
            <Card padding="300">
              <InlineGrid columns={["oneHalf", "oneHalf"]} gap="400" alignItems="center">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={CheckCircleIcon} tone="subdued" />
                    <Text variant="headingSm" as="h3" fontWeight="bold">
                      Original (English)
                    </Text>
                  </InlineStack>
                  <Badge tone="info">Read-only Reference</Badge>
                </InlineStack>

                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={LanguageIcon} tone="success" />
                    <Text variant="headingSm" as="h3" fontWeight="bold">
                      Translated ({selectedLocaleObj?.label || selectedLocale || "Target language"})
                    </Text>
                  </InlineStack>
                  <Badge tone="success">Editable Fields</Badge>
                </InlineStack>
              </InlineGrid>
            </Card>
          </Layout.Section>

          {/* Core Metadata Fields (Title & Excerpt) */}
          <Layout.Section>
            <Card padding="500">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Post Overview & Summary
                </Text>

                <TranslationRowPair
                  title="Title"
                  originalValue={post.title}
                  translatedValue={translatedTitle}
                  onChange={(val) => setTranslatedTitle(val)}
                  placeholder="Enter translated article title..."
                />

                <Divider />

                <TranslationRowPair
                  title="Excerpt"
                  originalValue={stripHtml(post.excerpt)}
                  translatedValue={translatedExcerpt}
                  onChange={(val) => setTranslatedExcerpt(val)}
                  multiline={3}
                  placeholder="Enter translated article excerpt..."
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Priority 1 — Structured Block-by-Block Content Translation */}
          <Layout.Section>
            <Card padding="500">
              <BlockStack gap="500">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      Article Content Blocks ({translatableBlocks.length})
                    </Text>
                    <Text variant="bodySm" tone="subdued">
                      Translate individual block content without touching raw HTML code or CSS styling.
                    </Text>
                  </BlockStack>
                </InlineStack>

                {translatableBlocks.length === 0 ? (
                  <Box padding="400" background="bg-surface-secondary" borderRadius="200" align="center">
                    <Text tone="subdued">No content blocks found to translate.</Text>
                  </Box>
                ) : (
                  translatableBlocks.map(({ block, bIdx }) => {
                    const blockIcon = getBlockIcon(block.type);
                    const trans = blockTranslations[block.id] || {};
                    const s = block.settings || {};

                    return (
                      <Box
                        key={block.id || bIdx}
                        padding="400"
                        background="bg-surface-secondary"
                        borderRadius="200"
                        borderWidth="025"
                        borderColor="border-secondary"
                      >
                        <BlockStack gap="300">
                          {/* Block Card Header */}
                          <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="200" blockAlign="center">
                              <Icon source={blockIcon} tone="base" />
                              <Text variant="headingSm" as="h3" fontWeight="semibold">
                                Block #{bIdx + 1}: {block.type}
                              </Text>
                            </InlineStack>
                          </InlineStack>

                          <Divider />

                          {/* Block-Specific Structured Input Fields */}
                          {block.type === "Heading" && (
                            <TranslationRowPair
                              title="Heading text"
                              originalValue={s.text}
                              translatedValue={trans.text || ""}
                              onChange={(val) => handleBlockTranslationChange(block.id, "text", val)}
                            />
                          )}

                          {(block.type === "FaqBlock" || block.type === "faq") && (
                            <BlockStack gap="300">
                              <TranslationRowPair
                                title="FAQ section title"
                                originalValue={s.title || "Frequently Asked Questions"}
                                translatedValue={trans.title || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "title", val)}
                              />

                              {Array.isArray(s.items) &&
                                s.items.map((item, iIdx) => (
                                  <Box
                                    key={item.id || iIdx}
                                    padding="300"
                                    background="bg-surface"
                                    borderRadius="200"
                                    borderWidth="025"
                                    borderColor="border-subdued"
                                  >
                                    <BlockStack gap="300">
                                      <Text variant="bodySm" fontWeight="bold" tone="subdued">
                                        Question #{iIdx + 1}
                                      </Text>
                                      <TranslationRowPair
                                        title={`Question #${iIdx + 1}`}
                                        originalValue={item.question}
                                        translatedValue={trans.items?.[iIdx]?.question || ""}
                                        onChange={(val) =>
                                          handleBlockTranslationChange(block.id, `items.${iIdx}.question`, val)
                                        }
                                      />
                                      <TranslationRowPair
                                        title={`Answer #${iIdx + 1}`}
                                        originalValue={item.answer}
                                        translatedValue={trans.items?.[iIdx]?.answer || ""}
                                        onChange={(val) =>
                                          handleBlockTranslationChange(block.id, `items.${iIdx}.answer`, val)
                                        }
                                        multiline={3}
                                      />
                                    </BlockStack>
                                  </Box>
                                ))}
                            </BlockStack>
                          )}

                          {block.type === "Callout" && (
                            <BlockStack gap="300">
                              <TranslationRowPair
                                title="Callout title"
                                originalValue={s.title}
                                translatedValue={trans.title || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "title", val)}
                              />
                              <TranslationRowPair
                                title="Callout body"
                                originalValue={s.body || s.text}
                                translatedValue={trans.body || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "body", val)}
                                multiline={3}
                              />
                            </BlockStack>
                          )}

                          {(block.type === "Hero" || block.type === "HeroSection") && (
                            <BlockStack gap="300">
                              <TranslationRowPair
                                title="Hero headline"
                                originalValue={s.heading || s.title}
                                translatedValue={trans.heading || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "heading", val)}
                              />
                              <TranslationRowPair
                                title="Hero subheading"
                                originalValue={s.subheading || s.body}
                                translatedValue={trans.subheading || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "subheading", val)}
                                multiline={2}
                              />
                              <TranslationRowPair
                                title="Button label"
                                originalValue={s.ctaText || s.buttonText}
                                translatedValue={trans.ctaText || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "ctaText", val)}
                              />
                            </BlockStack>
                          )}

                          {block.type === "TableOfContents" && (
                            <TranslationRowPair
                              title="Table of contents title"
                              originalValue={s.title}
                              translatedValue={trans.title || ""}
                              onChange={(val) => handleBlockTranslationChange(block.id, "title", val)}
                            />
                          )}

                          {block.type === "Image" && (
                            <BlockStack gap="300">
                              <TranslationRowPair
                                title="Image alt text"
                                originalValue={s.alt}
                                translatedValue={trans.alt || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "alt", val)}
                              />
                              <TranslationRowPair
                                title="Image caption"
                                originalValue={s.caption}
                                translatedValue={trans.caption || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "caption", val)}
                              />
                            </BlockStack>
                          )}

                          {block.type === "VideoEmbed" && (
                            <TranslationRowPair
                              title="Video caption"
                              originalValue={s.caption}
                              translatedValue={trans.caption || ""}
                              onChange={(val) => handleBlockTranslationChange(block.id, "caption", val)}
                            />
                          )}

                          {block.type === "ButtonBlock" && (
                            <TranslationRowPair
                              title="Button text"
                              originalValue={s.text}
                              translatedValue={trans.text || ""}
                              onChange={(val) => handleBlockTranslationChange(block.id, "text", val)}
                            />
                          )}

                          {block.type === "BuyButton" && (
                            <BlockStack gap="300">
                              <TranslationRowPair
                                title="Button text"
                                originalValue={s.buttonText}
                                translatedValue={trans.buttonText || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "buttonText", val)}
                              />
                              <TranslationRowPair
                                title="Badge text"
                                originalValue={s.badge}
                                translatedValue={trans.badge || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "badge", val)}
                              />
                            </BlockStack>
                          )}

                          {["ProductGrid", "Collection", "ProductSlider"].includes(block.type) && (
                            <BlockStack gap="300">
                              <TranslationRowPair
                                title="Section title"
                                originalValue={s.title || s.heading}
                                translatedValue={trans.title || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "title", val)}
                              />
                              <TranslationRowPair
                                title="Button text"
                                originalValue={s.buttonText}
                                translatedValue={trans.buttonText || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "buttonText", val)}
                              />
                            </BlockStack>
                          )}

                          {block.type === "ProductCard" && (
                            <TranslationRowPair
                              title="Button text"
                              originalValue={s.buttonText}
                              translatedValue={trans.buttonText || ""}
                              onChange={(val) => handleBlockTranslationChange(block.id, "buttonText", val)}
                            />
                          )}

                          {block.type === "Table" && Array.isArray(s.tableData) && (
                            <BlockStack gap="200">
                              {s.tableData.map((row, rIdx) => (
                                <InlineStack key={rIdx} gap="200" wrap>
                                  {row.map((cell, cIdx) => (
                                    <TranslationRowPair
                                      key={cIdx}
                                      title={`Row ${rIdx + 1}, Col ${cIdx + 1}`}
                                      originalValue={cell}
                                      translatedValue={trans.tableData?.[rIdx]?.[cIdx] || ""}
                                      onChange={(val) => handleBlockTranslationChange(block.id, `tableData.${rIdx}.${cIdx}`, val)}
                                    />
                                  ))}
                                </InlineStack>
                              ))}
                            </BlockStack>
                          )}

                          {![
                            "Heading", "FaqBlock", "faq", "Callout", "Hero", "HeroSection",
                            "TableOfContents", "Image", "VideoEmbed", "ButtonBlock", "BuyButton",
                            "ProductGrid", "Collection", "ProductSlider", "ProductCard", "Table",
                          ].includes(block.type) && (
                              <TranslationRowPair
                                title="Content text"
                                originalValue={stripHtml(formatTextValue(s.content || s.text || (typeof s === "string" ? s : "")))}
                                translatedValue={trans.content || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "content", val)}
                                multiline={4}
                              />
                            )}
                        </BlockStack>
                      </Box>
                    );
                  })
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Search Engine Optimization (SEO) Fields */}
          <Layout.Section>
            <Card padding="500">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">
                  Search Engine Optimization (SEO)
                </Text>

                <TranslationRowPair
                  title="Meta title"
                  originalValue={post.metaTitle || post.title}
                  translatedValue={translatedMetaTitle}
                  onChange={(val) => setTranslatedMetaTitle(val)}
                  maxLength={70}
                  placeholder="Enter localized search engine title..."
                />

                <Divider />

                <TranslationRowPair
                  title="Meta description"
                  originalValue={stripHtml(post.metaDescription || "")}
                  translatedValue={translatedMetaDesc}
                  onChange={(val) => setTranslatedMetaDesc(val)}
                  maxLength={160}
                  multiline={3}
                  placeholder="Enter localized search engine description..."
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}

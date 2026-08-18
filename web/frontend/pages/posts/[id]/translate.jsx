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
import { smartBackAction } from "../../../utils/smartBack";
import UpgradePrompt from "../../../components/UpgradePrompt";

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

      if (origBlock.type === "Heading" || origBlock.type === "heading") {
        initialMap[origBlock.id] = { text: formatTextValue(transSettings.text || origSettings.text) };
      } else if (origBlock.type === "FaqBlock" || origBlock.type === "faq") {
        const origItems = Array.isArray(origSettings.items) ? origSettings.items : [];
        const transItems = Array.isArray(transSettings.items) ? transSettings.items : [];
        initialMap[origBlock.id] = {
          title: formatTextValue(transSettings.title || origSettings.title || "Frequently Asked Questions"),
          items: origItems.map((item, i) => ({
            question: formatTextValue(transItems[i]?.question || item.question),
            answer: formatTextValue(transItems[i]?.answer || item.answer),
          })),
        };
      } else if (origBlock.type === "Callout") {
        initialMap[origBlock.id] = {
          title: formatTextValue(transSettings.title || origSettings.title),
          body: formatTextValue(transSettings.body || origSettings.body),
        };
      } else if (origBlock.type === "Hero" || origBlock.type === "HeroSection") {
        initialMap[origBlock.id] = {
          heading: formatTextValue(transSettings.heading || origSettings.heading),
          subheading: formatTextValue(transSettings.subheading || origSettings.subheading),
          ctaText: formatTextValue(transSettings.ctaText || origSettings.ctaText),
        };
      } else if (origBlock.type === "TableOfContents") {
        initialMap[origBlock.id] = { title: formatTextValue(transSettings.title || origSettings.title) };
      } else if (origBlock.type === "Image") {
        initialMap[origBlock.id] = {
          alt: formatTextValue(transSettings.alt || origSettings.alt),
          caption: formatTextValue(transSettings.caption || origSettings.caption),
        };
      } else if (origBlock.type === "VideoEmbed") {
        initialMap[origBlock.id] = { caption: formatTextValue(transSettings.caption || origSettings.caption) };
      } else if (origBlock.type === "ButtonBlock") {
        initialMap[origBlock.id] = { text: formatTextValue(transSettings.text || origSettings.text) };
      } else if (origBlock.type === "BuyButton") {
        initialMap[origBlock.id] = {
          buttonText: formatTextValue(transSettings.buttonText || origSettings.buttonText),
          badge: formatTextValue(transSettings.badge || origSettings.badge),
        };
      } else if (["ProductGrid", "Collection", "ProductSlider"].includes(origBlock.type)) {
        initialMap[origBlock.id] = {
          title: formatTextValue(transSettings.title || origSettings.title || origSettings.heading),
          buttonText: formatTextValue(transSettings.buttonText || origSettings.buttonText),
        };
      } else if (origBlock.type === "ProductCard") {
        initialMap[origBlock.id] = { buttonText: formatTextValue(transSettings.buttonText || origSettings.buttonText) };
      } else if (origBlock.type === "Table") {
        const origRows = Array.isArray(origSettings.tableData) ? origSettings.tableData : [];
        const transRows = Array.isArray(transSettings.tableData) ? transSettings.tableData : [];
        initialMap[origBlock.id] = {
          tableData: origRows.map((row, r) => row.map((cell, c) => formatTextValue(transRows[r]?.[c] ?? cell))),
        };
      } else {
        // RichText paragraph / generic fallback
        initialMap[origBlock.id] = {
          content: formatTextValue(transSettings.content || transSettings.text || origSettings.content || origSettings.text),
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

    originalBlocks.forEach((block) => {
      const trans = blockTranslations[block.id];
      if (block.type === "Heading") {
        total++;
        if (trans?.text?.trim()) filled++;
      } else if (block.type === "FaqBlock" || block.type === "faq") {
        total++;
        if (trans?.title?.trim()) filled++;
        const items = block.settings?.items || [];
        items.forEach((_, i) => {
          total += 2;
          if (trans?.items?.[i]?.question?.trim()) filled++;
          if (trans?.items?.[i]?.answer?.trim()) filled++;
        });
      } else if (block.type === "Callout") {
        total += 2;
        if (trans?.title?.trim()) filled++;
        if (trans?.body?.trim()) filled++;
      } else if (block.type === "Hero" || block.type === "HeroSection") {
        total += 3;
        if (trans?.heading?.trim()) filled++;
        if (trans?.subheading?.trim()) filled++;
        if (trans?.ctaText?.trim()) filled++;
      } else {
        total++;
        if (trans?.content?.trim()) filled++;
      }
    });

    const percentage = total > 0 ? Math.round((filled / total) * 100) : 0;
    return { filled, total, percentage };
  }, [translatedTitle, translatedExcerpt, translatedMetaTitle, translatedMetaDesc, originalBlocks, blockTranslations]);

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
    setToast({ content: "🪄 Translating content..." });
    setIsTranslating(true);

    try {
      const res = await fetch(`/api/posts/${id}/translate-auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: selectedLocale }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Auto-translate failed");

      setToast({ content: "✨ Translation generated and saved successfully!" });

      if (data.translation) {
        setTranslatedTitle(data.translation.title || "");
        setTranslatedExcerpt(stripHtml(data.translation.excerpt || ""));
        const contentHtml = data.translation.contentHtml || "";
        setTranslatedContent(contentHtml);
        setTranslatedMetaTitle(data.translation.metaTitle || "");
        setTranslatedMetaDesc(stripHtml(data.translation.metaDescription || ""));

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
        <Page title="Translate" backAction={{ onAction: () => navigate(-1) }}>
          <Layout>
            <Layout.Section>
              <UpgradePrompt
                requiredPlan="Pro"
                title="Multi Language Translation is a Pro feature"
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
        <Page title="Post Not Found">
          <Banner tone="critical">The requested article could not be loaded.</Banner>
        </Page>
      </Frame>
    );
  }

  return (
    <Frame>
      {toast && (
        <Toast content={toast.content} error={toast.error} onDismiss={() => setToast(null)} />
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
          ...smartBackAction(navigate, location, `/posts/${id}/edit`, "Back to Edit"),
          icon: ArrowLeftIcon,
        }}
        title="Translate Post"
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
                        label="Target Language"
                        labelHidden
                        options={storeLocales}
                        value={selectedLocale}
                        onChange={(newLocale) => setSelectedLocale(newLocale)}
                        disabled={storeLocales.length === 0}
                      />
                    </Box>
                    <Badge tone={completionStats.percentage === 100 ? "success" : "attention"} size="medium">
                      {completionStats.percentage === 100 ? "Fully Translated (100%)" : `${completionStats.filled} of ${completionStats.total} fields translated (${completionStats.percentage}%)`}
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
                      Translated ({selectedLocaleObj?.label || selectedLocale || "Target Language"})
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
                      Article Content Blocks ({originalBlocks.length})
                    </Text>
                    <Text variant="bodySm" tone="subdued">
                      Translate individual block content without touching raw HTML code or CSS styling.
                    </Text>
                  </BlockStack>
                </InlineStack>

                {originalBlocks.length === 0 ? (
                  <Box padding="400" background="bg-surface-secondary" borderRadius="200" align="center">
                    <Text tone="subdued">No content blocks found to translate.</Text>
                  </Box>
                ) : (
                  originalBlocks.map((block, bIdx) => {
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
                              title="Heading Text"
                              originalValue={s.text}
                              translatedValue={trans.text || ""}
                              onChange={(val) => handleBlockTranslationChange(block.id, "text", val)}
                            />
                          )}

                          {(block.type === "FaqBlock" || block.type === "faq") && (
                            <BlockStack gap="300">
                              <TranslationRowPair
                                title="FAQ Section Title"
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
                                title="Callout Title"
                                originalValue={s.title}
                                translatedValue={trans.title || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "title", val)}
                              />
                              <TranslationRowPair
                                title="Callout Body"
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
                                title="Hero Headline"
                                originalValue={s.heading || s.title}
                                translatedValue={trans.heading || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "heading", val)}
                              />
                              <TranslationRowPair
                                title="Hero Subheading"
                                originalValue={s.subheading || s.body}
                                translatedValue={trans.subheading || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "subheading", val)}
                                multiline={2}
                              />
                              <TranslationRowPair
                                title="Button Label"
                                originalValue={s.ctaText || s.buttonText}
                                translatedValue={trans.ctaText || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "ctaText", val)}
                              />
                            </BlockStack>
                          )}

                          {block.type === "TableOfContents" && (
                            <TranslationRowPair
                              title="Table of Contents Title"
                              originalValue={s.title}
                              translatedValue={trans.title || ""}
                              onChange={(val) => handleBlockTranslationChange(block.id, "title", val)}
                            />
                          )}

                          {block.type === "Image" && (
                            <BlockStack gap="300">
                              <TranslationRowPair
                                title="Image Alt Text"
                                originalValue={s.alt}
                                translatedValue={trans.alt || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "alt", val)}
                              />
                              <TranslationRowPair
                                title="Image Caption"
                                originalValue={s.caption}
                                translatedValue={trans.caption || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "caption", val)}
                              />
                            </BlockStack>
                          )}

                          {block.type === "VideoEmbed" && (
                            <TranslationRowPair
                              title="Video Caption"
                              originalValue={s.caption}
                              translatedValue={trans.caption || ""}
                              onChange={(val) => handleBlockTranslationChange(block.id, "caption", val)}
                            />
                          )}

                          {block.type === "ButtonBlock" && (
                            <TranslationRowPair
                              title="Button Text"
                              originalValue={s.text}
                              translatedValue={trans.text || ""}
                              onChange={(val) => handleBlockTranslationChange(block.id, "text", val)}
                            />
                          )}

                          {block.type === "BuyButton" && (
                            <BlockStack gap="300">
                              <TranslationRowPair
                                title="Button Text"
                                originalValue={s.buttonText}
                                translatedValue={trans.buttonText || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "buttonText", val)}
                              />
                              <TranslationRowPair
                                title="Badge Text"
                                originalValue={s.badge}
                                translatedValue={trans.badge || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "badge", val)}
                              />
                            </BlockStack>
                          )}

                          {["ProductGrid", "Collection", "ProductSlider"].includes(block.type) && (
                            <BlockStack gap="300">
                              <TranslationRowPair
                                title="Section Title"
                                originalValue={s.title || s.heading}
                                translatedValue={trans.title || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "title", val)}
                              />
                              <TranslationRowPair
                                title="Button Text"
                                originalValue={s.buttonText}
                                translatedValue={trans.buttonText || ""}
                                onChange={(val) => handleBlockTranslationChange(block.id, "buttonText", val)}
                              />
                            </BlockStack>
                          )}

                          {block.type === "ProductCard" && (
                            <TranslationRowPair
                              title="Button Text"
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
                                title="Content Text"
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
                  title="Meta Title"
                  originalValue={post.metaTitle || post.title}
                  translatedValue={translatedMetaTitle}
                  onChange={(val) => setTranslatedMetaTitle(val)}
                  maxLength={70}
                  placeholder="Enter localized search engine title..."
                />

                <Divider />

                <TranslationRowPair
                  title="Meta Description"
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

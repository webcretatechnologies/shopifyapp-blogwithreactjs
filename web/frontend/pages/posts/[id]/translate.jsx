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
import { useParams, useNavigate } from "react-router-dom";

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
    post.contentJson.forEach((block, idx) => {
      const type = block.type || block.blockType || "RichText";
      const s = block.settings || block.data || {};

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
    });
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
 * Sync edited block text fields into translated content HTML while preserving tag structures.
 */
function applyBlockTranslationsToHtml(originalHtml, originalBlocks, blockTranslations) {
  if (!originalHtml) return "";

  const parser = new DOMParser();
  const doc = parser.parseFromString(originalHtml, "text/html");

  let pIdx = 0;
  let hIdx = 0;

  originalBlocks.forEach((block) => {
    const trans = blockTranslations[block.id];
    if (!trans) return;

    if (block.type === "Heading" || block.type === "heading") {
      const headings = doc.querySelectorAll("h1, h2, h3, h4, h5, h6");
      if (headings[hIdx] && trans.text !== undefined) {
        headings[hIdx].textContent = trans.text;
      }
      hIdx++;
    } else if (block.type === "FaqBlock" || block.type === "faq") {
      const faqBlocks = doc.querySelectorAll("[data-type='FaqBlock'], .builder-faq-block");
      faqBlocks.forEach((faqEl) => {
        const titleEl = faqEl.querySelector("h2, h3, .faq-title");
        if (titleEl && trans.title !== undefined) titleEl.textContent = trans.title;

        const items = faqEl.querySelectorAll("details, .builder-faq-item");
        items.forEach((itemEl, idx) => {
          const itemTrans = trans.items?.[idx];
          if (!itemTrans) return;
          const qEl = itemEl.querySelector("summary, .faq-question-text");
          const aEl = itemEl.querySelector("p, div, .faq-answer-text");
          if (qEl && itemTrans.question !== undefined) qEl.textContent = itemTrans.question;
          if (aEl && itemTrans.answer !== undefined) aEl.textContent = itemTrans.answer;
        });
      });
    } else if (block.type === "Callout") {
      const callouts = doc.querySelectorAll("[data-type='Callout'], .callout-block");
      callouts.forEach((cEl) => {
        const tEl = cEl.querySelector("h3, h4, .callout-title");
        const bEl = cEl.querySelector("p, .callout-body");
        if (tEl && trans.title !== undefined) tEl.textContent = trans.title;
        if (bEl && trans.body !== undefined) bEl.textContent = trans.body;
      });
    } else if (block.type === "Hero" || block.type === "HeroSection") {
      const heroes = doc.querySelectorAll("[data-type='Hero'], .hero-block");
      heroes.forEach((hEl) => {
        const h1 = hEl.querySelector("h1, h2, .hero-title");
        const p = hEl.querySelector("p, .hero-subtitle");
        const a = hEl.querySelector("a, button, .btn");
        if (h1 && trans.heading !== undefined) h1.textContent = trans.heading;
        if (p && trans.subheading !== undefined) p.textContent = trans.subheading;
        if (a && trans.ctaText !== undefined) a.textContent = trans.ctaText;
      });
    } else if (block.type === "RichText" || block.type === "text") {
      const textNodes = doc.querySelectorAll("p, li");
      if (textNodes[pIdx] && trans.content !== undefined) {
        textNodes[pIdx].textContent = trans.content;
      }
      pIdx++;
    }
  });

  return doc.body.innerHTML;
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
    } catch {}
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
    } catch {}
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
  }, [id, loadTranslations, loadLocales]);

  // Helper to re-hydrate block translation state from translated HTML/blocks
  const hydrateBlockTranslationsFromHtml = useCallback((translatedHtml, blocks) => {
    if (!translatedHtml || blocks.length === 0) return {};
    const parsedTranslatedBlocks = extractBlocksFromPost({ contentHtml: translatedHtml });
    
    const initialMap = {};
    let transPIdx = 0;
    let transHIdx = 0;

    const translatedParagraphs = parsedTranslatedBlocks.filter((b) => b.type === "RichText");
    const translatedHeadings = parsedTranslatedBlocks.filter((b) => b.type === "Heading");
    const translatedFaqs = parsedTranslatedBlocks.filter((b) => b.type === "FaqBlock" || b.type === "faq");

    blocks.forEach((origBlock, idx) => {
      const origSettings = origBlock.settings || {};

      if (origBlock.type === "Heading" || origBlock.type === "heading") {
        const matchingTransBlock = translatedHeadings[transHIdx] || parsedTranslatedBlocks[idx];
        transHIdx++;
        const transSettings = matchingTransBlock?.settings || {};
        initialMap[origBlock.id] = { text: formatTextValue(transSettings.text || origSettings.text) };
      } else if (origBlock.type === "FaqBlock" || origBlock.type === "faq") {
        const matchingTransBlock = translatedFaqs[0] || parsedTranslatedBlocks[idx];
        const transSettings = matchingTransBlock?.settings || {};
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
        const matchingTransBlock = parsedTranslatedBlocks.find((b) => b.type === "Callout") || parsedTranslatedBlocks[idx];
        const transSettings = matchingTransBlock?.settings || {};
        initialMap[origBlock.id] = {
          title: formatTextValue(transSettings.title || origSettings.title),
          body: formatTextValue(transSettings.body || origSettings.body),
        };
      } else if (origBlock.type === "Hero" || origBlock.type === "HeroSection") {
        const matchingTransBlock = parsedTranslatedBlocks.find((b) => b.type === "Hero") || parsedTranslatedBlocks[idx];
        const transSettings = matchingTransBlock?.settings || {};
        initialMap[origBlock.id] = {
          heading: formatTextValue(transSettings.heading || origSettings.heading),
          subheading: formatTextValue(transSettings.subheading || origSettings.subheading),
          ctaText: formatTextValue(transSettings.ctaText || origSettings.ctaText),
        };
      } else {
        // RichText paragraph block: match sequentially from translatedParagraphs
        const matchingTransBlock = translatedParagraphs[transPIdx] || parsedTranslatedBlocks[idx];
        transPIdx++;
        const transSettings = matchingTransBlock?.settings || {};
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
      setTranslatedExcerpt(found.excerpt || "");
      const contentHtml = found.contentHtml || "";
      setTranslatedContent(contentHtml);
      setTranslatedMetaTitle(found.metaTitle || "");
      setTranslatedMetaDesc(found.metaDescription || "");

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
        list[idx] = { ...list[idx], [childKey]: value };
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
        window.shopify.saveBar.show(saveBarId).catch(() => {});
      } else {
        window.shopify.saveBar.hide(saveBarId).catch(() => {});
      }
    }
  }, [isDirty]);

  useEffect(() => {
    return () => {
      if (window.shopify?.saveBar) {
        window.shopify.saveBar.hide(saveBarId).catch(() => {});
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
        window.shopify.saveBar.hide(saveBarId).catch(() => {});
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
        setTranslatedExcerpt(data.translation.excerpt || "");
        const contentHtml = data.translation.contentHtml || "";
        setTranslatedContent(contentHtml);
        setTranslatedMetaTitle(data.translation.metaTitle || "");
        setTranslatedMetaDesc(data.translation.metaDescription || "");

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

      <ui-save-bar id={saveBarId}>
        <button variant="primary" onClick={handleSave} loading={isSaving ? "" : undefined}>
          Save
        </button>
        <button
          onClick={() => {
            const found = translations.find((t) => t.locale === selectedLocale);
            setTranslatedTitle(found?.title || "");
            setTranslatedExcerpt(found?.excerpt || "");
            setTranslatedContent(found?.contentHtml || "");
            setTranslatedMetaTitle(found?.metaTitle || "");
            setTranslatedMetaDesc(found?.metaDescription || "");
          }}
        >
          Discard
        </button>
      </ui-save-bar>

      <Page
        backAction={{
          content: "Back to Edit",
          onAction: () => navigate(`/posts/${id}/edit`),
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
                <Box paddingBlockStart="100">
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
            <Box
              padding="300"
              background="bg-surface-secondary"
              borderRadius="200"
              borderWidth="025"
              borderColor="border-secondary"
            >
              <InlineGrid columns={["oneHalf", "oneHalf"]} gap="400" alignItems="center">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={CheckCircleIcon} tone="subdued" />
                  <Text variant="headingSm" as="h3" fontWeight="bold">
                    Original (English)
                  </Text>
                  <Badge tone="info">Read-only Reference</Badge>
                </InlineStack>

                <InlineStack gap="200" blockAlign="center">
                  <Icon source={LanguageIcon} tone="success" />
                  <Text variant="headingSm" as="h3" fontWeight="bold">
                    Translated ({selectedLocaleObj?.label || selectedLocale || "Target Language"})
                  </Text>
                  <Badge tone="success">Editable Fields</Badge>
                </InlineStack>
              </InlineGrid>
            </Box>
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
                  originalValue={post.excerpt}
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

                          {block.type !== "Heading" &&
                            block.type !== "FaqBlock" &&
                            block.type !== "faq" &&
                            block.type !== "Callout" &&
                            block.type !== "Hero" &&
                            block.type !== "HeroSection" && (
                              <TranslationRowPair
                                title="Content Text"
                                originalValue={s.content || s.text || (typeof s === "string" ? s : "")}
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
                  originalValue={post.metaDescription || post.excerpt}
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

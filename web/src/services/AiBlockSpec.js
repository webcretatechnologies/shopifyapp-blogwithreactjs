/**
 * Complete Builder block vocabulary for AI generation — Layout, Content, Media, Commerce.
 * Mirrors web/frontend/components/builder/BlockRegistry.jsx categories and settings.
 */

export const ALLOWED_AI_BLOCK_TYPES = new Set([
  "Section",
  "ColumnLayout",
  "Column",
  "Heading",
  "RichText",
  "Image",
  "Divider",
  "Spacer",
  "Callout",
  "Table",
  "TableOfContents",
  "FaqBlock",
  "ButtonBlock",
  "BuyButton",
  "ProductGrid",
  "ProductSlider",
  "Collection",
  "HeroSection",
  "VideoEmbed",
  "Html",
  "ProductCard",
]);

/** Which settings the model may rewrite or tune per block type. Everything else stays as-is. */
export const WRITABLE_SETTINGS = {
  Section: ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "backgroundColor", "borderRadius", "maxWidth"],
  ColumnLayout: ["columns", "gap"],
  Column: ["width"],
  Heading: ["text", "level", "align"],
  RichText: ["paragraphs", "content"],
  Table: ["tableData", "rows", "cols", "hasHeader"],
  Callout: ["type", "title", "body", "emoji"],
  FaqBlock: ["title", "titleAlign", "items", "firstOpen"],
  TableOfContents: ["title", "listStyle", "style", "collapsible"],
  Divider: ["style", "thickness", "marginTop", "marginBottom"],
  Spacer: ["height"],
  Image: ["alt", "caption", "alignment", "width", "borderRadius", "linkUrl"],
  VideoEmbed: ["caption", "url", "aspectRatio", "maxWidth"],
  Html: [],
  HeroSection: [
    "heading",
    "subheading",
    "showCta",
    "ctaText",
    "ctaUrl",
    "align",
    "minHeight",
    "overlayOpacity",
    "textColor",
  ],
  ButtonBlock: ["text", "url", "alignment"],
  BuyButton: ["buttonText", "layout", "showPrice", "showDescription", "showBadge", "badge"],
  ProductGrid: ["title", "titleAlign", "columns", "buttonText", "showPrice", "showButton", "cardStyle", "gap"],
  ProductSlider: ["title", "titleAlign", "buttonText", "showPrice", "showButton", "cardStyle", "gap"],
  Collection: ["heading", "layout", "columns", "buttonText", "showTitle", "showViewAll", "showPrice", "showButton"],
  ProductCard: ["title", "buttonText", "layout", "showImage", "showPrice", "showButton"],
};

/** Never sent back from the model — template photos, product bindings, raw HTML. */
export const LOCKED_SETTINGS = {
  Section: [],
  ColumnLayout: [],
  Column: [],
  Heading: ["color", "fontSize"],
  RichText: [],
  Table: [],
  Callout: ["backgroundColor", "borderColor"],
  FaqBlock: ["accentColor", "backgroundColor", "borderColor", "borderRadius", "enableSchema"],
  TableOfContents: ["levels", "textColor", "titleColor", "backgroundColor", "padding", "borderRadius"],
  Divider: ["color", "width"],
  Spacer: [],
  Image: ["src", "linkTarget"],
  VideoEmbed: [],
  Html: ["code"],
  HeroSection: ["backgroundImage", "overlayColor", "ctaColor", "ctaTextColor", "backgroundOverlay"],
  ButtonBlock: ["backgroundColor", "textColor", "borderRadius"],
  BuyButton: ["product", "buttonColor", "imageSize", "maxWidth"],
  ProductGrid: ["manualProducts", "searchQuery", "maxProducts", "buttonColor", "buttonRadius"],
  ProductSlider: ["manualProducts", "searchQuery", "buttonColor", "buttonRadius"],
  Collection: ["collectionHandle", "manualProducts", "maxProducts", "buttonColor", "buttonRadius"],
  ProductCard: ["productId", "price", "imageUrl", "buttonColor", "buttonRadius", "borderRadius", "borderColor"],
};

export const BLOCK_VOCABULARY = `
# Shopify Blog Builder — complete block reference

You receive a template as an ordered manifest: every block (Layout, Content, Media, Commerce) with its
current settings, section context, and which fields you may change. You decide what each block needs
for THIS article — rewrite copy, fill tables, tune layout spacing, pick column counts, set CTAs,
write alt text — while respecting locked fields (photos, product objects, theme colours).

## How to respond
Return block_updates: one entry per block you change, matched by manifest "id". Only include settings
keys listed in that block's writable_settings. Omit blocks that need no change only if another block
covers the same content — when in doubt, rewrite sample/template copy.

RichText blocks: use settings.paragraphs as an array of plain-text strings (one per paragraph slot).
Table blocks: use settings.tableData as [[cell,...],...] — NEVER leave template sample rows.
FaqBlock: settings.items as [{question, answer}] — keep or add ids like faq_1 if present in template.
Heading "Step N:" lines: keep the Step N prefix, rewrite the rest for this topic.

## LAYOUT blocks

### Section (category: layout)
Visual band wrapping child blocks. Settings:
- paddingTop/Bottom/Left/Right (css, e.g. "28px") — tune vertical rhythm
- backgroundColor — subtle section tints ok; "transparent" for none
- borderRadius, maxWidth — keep template values unless brief asks for full-bleed
- children: nested blocks (you update children via their own ids, not here)

### ColumnLayout (category: layout)
Multi-column row. Settings:
- columns (2-4) — you MAY change if topic needs side-by-side vs stacked content
- gap (e.g. "16px", "24px")
- children: Column blocks

### Column (category: layout)
Single column inside ColumnLayout. Settings:
- width (e.g. "50%", "100%") — usually leave as template balanced
- children: content blocks

## CONTENT blocks

### Heading
- text — the visible heading (H1–H6)
- level (1-6) — usually keep; level 1 = article title
- align: left|center|right

### RichText
- paragraphs: ["sentence one.", "sentence two."] — plain text, no markdown/HTML
- Or full Tiptap doc in content (prefer paragraphs array)

### Table
- tableData: 2D string array, first row often headers when hasHeader true
- rows, cols, hasHeader — sync with tableData dimensions
- CRITICAL: replace ALL template sample data (wrong recipe/product/spec rows)

### Callout
- type: info|tip|warning|success
- title, body (1-3 sentences), emoji (single emoji)

### FaqBlock
- title, titleAlign
- items: [{id?, question, answer}] — 2-6 topic-specific Q&As. Write NEW questions - never reuse or
  lightly reword the template's own sample questions - and don't treat the template's item count as
  a target; use however many genuinely fit this topic

### TableOfContents
- title — panel label ("In this article", "Make it", etc.)
- listStyle: bullet|numbered, style: plain|panel, collapsible: bool
- Auto-built from headings at render — you do not list sections manually

### Divider / Spacer
- Divider: style (solid|dashed|dotted), thickness, marginTop/Bottom — spacing rhythm
- Spacer: height (e.g. "32px", "48px")

### Html
- Raw HTML/Liquid — do NOT modify (locked)

## MEDIA blocks

### Image
- alt, caption — describe the photo THIS topic needs (merchant replaces src later)
- alignment: left|center|right, width, borderRadius, linkUrl
- NEVER output src — template photo or placeholder stays

### VideoEmbed
- caption — describe the video
- url — ONLY if merchant gave a YouTube/Vimeo URL in brief; otherwise leave empty
- aspectRatio (default "56.25%"), maxWidth

## COMMERCE blocks

### HeroSection
- heading (use article title), subheading (article hook)
- showCta, ctaText, ctaUrl ("#" ok)
- align, minHeight, overlayOpacity, textColor
- NEVER output backgroundImage — template hero photo stays

### ButtonBlock
- text (CTA label), url, alignment

### BuyButton
- buttonText, layout (horizontal|vertical), showPrice, showDescription, showBadge, badge
- product object is locked — filled from merchant's linked products after generation

### ProductGrid / ProductSlider
- title, titleAlign, columns (grid), buttonText, showPrice, showButton, cardStyle, gap
- manualProducts locked — merchant products applied post-generation

### Collection
- heading, layout (grid|slider), columns, buttonText, showTitle, showViewAll, showPrice, showButton
- collectionHandle, manualProducts locked

### ProductCard
- title, buttonText, layout, showImage, showPrice, showButton
- price, imageUrl locked when product-bound

## Rules
1. Never invent image URLs or product catalogue data.
2. Never leave template sample copy (cookie ingredients, fake brand names, placeholder products).
3. Use only facts from the merchant brief — no fabricated health claims, prices, or reviews.
4. Plain prose only — no markdown asterisks, no HTML in text fields except Html blocks.
5. You decide layout tuning (columns, padding, spacers) when it improves readability for this topic.
`.trim();

/**
 * Short vocabulary for Groq free-tier TPM limits (~8k). Full BLOCK_VOCABULARY is too large to
 * send alongside a template manifest — this keeps the model informed without blowing the budget.
 */
export const BLOCK_VOCABULARY_COMPACT = `
Blocks (Layout/Content/Media/Commerce). Return block_updates[{id,settings}] using each block's writable_settings only.
LOCKED forever: image src, hero backgroundImage, product objects, Html code, theme colours.

GENERAL RULE, applies to every block below: every count, sample row, sample question and min_paragraphs
you're shown is the TEMPLATE AUTHOR'S OWN placeholder content and its accidental length — never a spec to
match. Rewrite the actual words (questions, headings, cells, paragraphs), not just the answers under them,
and use however much content - more paragraphs, more FAQ items, more table rows, fewer of any of them -
this specific topic genuinely needs. A short topic should produce a short section; a topic with a lot to
say should produce a longer one. Matching the template's original counts on every block is the bug this
rule exists to prevent.

- Section: padding*, backgroundColor, borderRadius, maxWidth
- ColumnLayout: columns, gap | Column: width
- Heading: text, level, align (keep "Step N:" prefix)
- RichText: paragraphs[] plain strings — min_paragraphs is a floor (the template sample's own length), not a target; write MORE than that whenever this section has more to say
- Table: tableData[[]] — MUST replace all sample rows with this topic's own data; row count is not fixed
- Callout: type, title, body, emoji
- FaqBlock: title, items[{question,answer}] — write NEW questions (never reuse/reword the template's); item_count_in_template is not a target, use 2-6 based on what this topic needs
- TableOfContents: title, listStyle, style | Divider/Spacer: thickness/margins/height
- Image: alt, caption, alignment (never src) | VideoEmbed: caption, url only if brief has one
- HeroSection: heading, subheading, showCta, ctaText, ctaUrl, minHeight
- ButtonBlock: text, url | BuyButton: buttonText, showPrice, badge
- ProductGrid/Slider: title, columns, buttonText | Collection: heading, columns | ProductCard: title, buttonText
Rules: no invented photos/products/prices/health claims; no markdown; rewrite ALL sample copy.
`.trim();

/** Types we always ask the model to rewrite when present in a template. */
const PROMPT_PRIORITY_TYPES = new Set([
  "Heading",
  "RichText",
  "Table",
  "Callout",
  "FaqBlock",
  "TableOfContents",
  "HeroSection",
  "Image",
  "ButtonBlock",
  "BuyButton",
  "ProductGrid",
  "ProductSlider",
  "Collection",
  "ProductCard",
  "VideoEmbed",
]);

const BLOCK_CATEGORY_MAP = {
  Section: "layout",
  ColumnLayout: "layout",
  Column: "layout",
  Heading: "content",
  RichText: "content",
  Table: "content",
  Callout: "content",
  FaqBlock: "content",
  TableOfContents: "content",
  Divider: "content",
  Spacer: "content",
  Html: "content",
  Image: "media",
  VideoEmbed: "media",
  HeroSection: "commerce",
  ButtonBlock: "commerce",
  BuyButton: "commerce",
  ProductGrid: "commerce",
  ProductSlider: "commerce",
  Collection: "commerce",
  ProductCard: "commerce",
};

export function blockCategory(type) {
  return BLOCK_CATEGORY_MAP[type] || "content";
}

/** Strip locked/heavy fields before sending settings to the model. */
export function sanitizeSettingsForPrompt(type, settings) {
  const s = { ...(settings || {}) };
  const locked = new Set(LOCKED_SETTINGS[type] || []);

  if (type === "RichText" && s.content) {
    const paras = plainTextFromDoc(s.content);
    // A field literally named "paragraph_count: 1" reads as a target no matter what the prompt
    // text says around it - models anchor hard on a concrete number sitting next to the block
    // they're patching. Naming it as a minimum instead removes that anchor.
    const templateHad = (s.content.content || []).filter((n) => n.type === "paragraph").length;
    return {
      min_paragraphs: Math.max(1, templateHad),
      write_more_if_topic_needs_depth: true,
      template_sample_preview: paras.slice(0, 120),
    };
  }
  if (type === "Image") {
    return { alt: s.alt || "", caption: s.caption || "", alignment: s.alignment || "center" };
  }
  if (type === "HeroSection") {
    return {
      heading: s.heading || "",
      subheading: s.subheading || "",
      showCta: Boolean(s.showCta),
      ctaText: s.ctaText || "",
      minHeight: s.minHeight || "",
    };
  }
  if (type === "BuyButton") {
    return { buttonText: s.buttonText || "Add to Cart", showPrice: s.showPrice !== false };
  }
  if (type === "ProductGrid" || type === "ProductSlider" || type === "Collection") {
    return {
      title: s.title || s.heading || "",
      columns: s.columns,
      buttonText: s.buttonText || "",
    };
  }
  if (type === "Html") {
    return {};
  }
  if (type === "Table" && Array.isArray(s.tableData)) {
    // Header + one sample body row only — full sample tables blow Groq's TPM budget.
    const sample = s.hasHeader !== false
      ? [s.tableData[0], s.tableData[1] || []].filter((r) => Array.isArray(r) && r.length)
      : s.tableData.slice(0, 2);
    return {
      cols: s.cols || s.tableData[0]?.length || 2,
      hasHeader: s.hasHeader !== false,
      sample_rows: sample,
      // "must_replace" alone read as "swap these cells for new ones, same shape" - the row count
      // is the template author's sample data, not a spec, so it needs to say so explicitly or the
      // model mirrors whatever row count it's shown, same failure mode as the FAQ count below.
      must_replace: true,
      row_count_is_not_fixed: "add or remove rows - use however many this topic's data actually needs",
    };
  }
  if (type === "FaqBlock") {
    // Previously included the template's own sample_questions verbatim, which - given to a model
    // as "here are 2 existing questions" - reads as content to answer, not a structural example to
    // move past. That's exactly why it kept only rewriting answers and leaving the questions
    // untouched, and why it never varied count: it was shown 2 real questions and matched them.
    // structure_example is deliberately generic (not the template's real questions) and item_count
    // is framed as a floor, not a target.
    return {
      title: s.title || "FAQs",
      structure_example: "{question, answer}",
      item_count_in_template: Array.isArray(s.items) ? s.items.length : 0,
      instruction:
        "Write NEW topic-specific questions (never reuse or lightly reword the template's own) and " +
        "use however many items - 2 to 6 - genuinely fit this topic, not necessarily the template's count",
    };
  }
  if (type === "Section" || type === "ColumnLayout" || type === "Column" || type === "Divider" || type === "Spacer") {
    const slim = {};
    for (const key of WRITABLE_SETTINGS[type] || []) {
      if (s[key] != null && s[key] !== "") slim[key] = s[key];
    }
    return slim;
  }

  for (const key of locked) delete s[key];
  return s;
}

/**
 * Compact manifest for the Groq prompt: priority content/media/commerce blocks with slim
 * settings. Layout shells are listed as id+type only so ids stay aligned with the full tree.
 */
export function buildCompactPromptManifest(blocks) {
  return buildTemplateManifest(blocks).map((entry) => {
    if (!PROMPT_PRIORITY_TYPES.has(entry.type)) {
      return { id: entry.id, type: entry.type, category: entry.category };
    }
    return {
      id: entry.id,
      type: entry.type,
      category: entry.category,
      section: entry.section_heading || undefined,
      role: entry.role,
      writable: entry.writable_settings,
      settings: entry.current_settings,
    };
  });
}

function plainTextFromDoc(content) {
  if (!content || !Array.isArray(content.content)) return "";
  return content.content
    .map((node) => (Array.isArray(node.content) ? node.content.map((n) => n.text || "").join("") : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Flat manifest of every block in tree order — same walk order as applyBlockPatches.
 * Gives the model full structural context to decide per-block updates.
 */
export function buildTemplateManifest(blocks) {
  const manifest = [];
  let n = 0;

  const walk = (list, sectionHeading, depth) => {
    (Array.isArray(list) ? list : []).forEach((block) => {
      if (!block || typeof block !== "object" || !ALLOWED_AI_BLOCK_TYPES.has(block.type)) return;
      n += 1;
      const id = `b_${n}`;
      const settings = block.settings || {};
      let role = "";
      if (block.type === "Table") role = "tabular data — replace all cells";
      else if (block.type === "RichText") role = "body copy";
      else if (block.type === "HeroSection") role = "article banner";
      else if (block.type === "ProductGrid" || block.type === "ProductSlider") role = "shoppable product row";
      else if (block.type === "Image") role = "photo slot — write alt/caption only";
      else if (block.type === "FaqBlock") role = "FAQ accordion";
      else if (block.type === "Callout") role = "highlighted aside";

      manifest.push({
        id,
        type: block.type,
        category: blockCategory(block.type),
        depth,
        section_heading: sectionHeading || null,
        role: role || undefined,
        writable_settings: WRITABLE_SETTINGS[block.type] || [],
        locked_settings: LOCKED_SETTINGS[block.type] || [],
        current_settings: sanitizeSettingsForPrompt(block.type, settings),
        child_count: Array.isArray(block.children) ? block.children.length : 0,
      });

      let nextHeading = sectionHeading;
      if (block.type === "Heading" && settings.text) {
        const text = String(settings.text).trim();
        if (settings.level !== 1) nextHeading = text;
      } else if (block.type === "Section") {
        nextHeading = "";
      }
      walk(block.children, nextHeading, depth + 1);
    });
  };

  walk(blocks, "", 0);
  return manifest;
}

export function paragraphsToRichDoc(paragraphs) {
  const list = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
  return {
    type: "doc",
    content: list
      .map((p) => String(p || "").trim())
      .filter(Boolean)
      .map((text) => ({
        type: "paragraph",
        content: [{ type: "text", text }],
      })),
  };
}

/** Merge only writable keys from an AI patch into existing block settings. */
export function mergeBlockPatch(type, existing, patch) {
  if (!patch || typeof patch !== "object") return existing;
  const writable = new Set(WRITABLE_SETTINGS[type] || []);
  const locked = new Set(LOCKED_SETTINGS[type] || []);
  const out = { ...existing };

  if (type === "RichText" && Array.isArray(patch.paragraphs)) {
    out.content = paragraphsToRichDoc(patch.paragraphs);
    return out;
  }

  if (type === "Table" && (patch.tableData || patch.headers || patch.rows)) {
    if (Array.isArray(patch.tableData)) {
      out.tableData = patch.tableData.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "").trim()) : []));
    } else if (Array.isArray(patch.headers) || Array.isArray(patch.rows)) {
      const headers = Array.isArray(patch.headers) ? patch.headers : [];
      const body = Array.isArray(patch.rows) ? patch.rows : [];
      out.tableData = patch.hasHeader !== false && headers.length ? [headers, ...body] : body;
    }
    if (Array.isArray(out.tableData)) {
      out.rows = out.tableData.length;
      out.cols = Math.max(...out.tableData.map((r) => r.length), 1);
      if (patch.hasHeader !== undefined) out.hasHeader = patch.hasHeader;
    }
    return out;
  }

  if (type === "FaqBlock" && Array.isArray(patch.items)) {
    out.items = patch.items
      .filter((it) => it && String(it.question || "").trim() && String(it.answer || "").trim())
      .map((it, i) => ({
        id: it.id || existing.items?.[i]?.id || `faq_${i + 1}`,
        question: String(it.question).trim(),
        answer: String(it.answer).trim(),
      }));
    if (patch.title) out.title = String(patch.title).trim();
    return out;
  }

  for (const [key, val] of Object.entries(patch)) {
    if (!writable.has(key) || locked.has(key)) continue;
    if (val === undefined || val === null) continue;
    out[key] = val;
  }
  return out;
}

/** Walk tree in manifest order; apply block_updates[id].settings when present. Returns patch count. */
export function applyBlockPatches(blocks, updatesMap) {
  let n = 0;
  let applied = 0;

  const walk = (list) =>
    (Array.isArray(list) ? list : [])
      .map((block) => {
        if (!block || typeof block !== "object" || !ALLOWED_AI_BLOCK_TYPES.has(block.type)) return null;
        n += 1;
        const id = `b_${n}`;
        let settings = { ...(block.settings || {}) };
        const patch = updatesMap?.[id];
        if (patch?.settings) {
          settings = mergeBlockPatch(block.type, settings, patch.settings);
          applied += 1;
        }
        return {
          ...block,
          settings,
          children: walk(block.children),
        };
      })
      .filter(Boolean);

  return { blocks: walk(blocks), applied };
}

export default {
  BLOCK_VOCABULARY,
  BLOCK_VOCABULARY_COMPACT,
  WRITABLE_SETTINGS,
  LOCKED_SETTINGS,
  ALLOWED_AI_BLOCK_TYPES,
  buildTemplateManifest,
  buildCompactPromptManifest,
  mergeBlockPatch,
  applyBlockPatches,
  paragraphsToRichDoc,
  blockCategory,
};

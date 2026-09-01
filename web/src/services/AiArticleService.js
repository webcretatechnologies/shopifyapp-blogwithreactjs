import { getBlogTemplateByKey } from "../data/blogTemplates.js";
import {
  BLOCK_VOCABULARY,
  BLOCK_VOCABULARY_COMPACT,
  ALLOWED_AI_BLOCK_TYPES,
  buildTemplateManifest,
  buildCompactPromptManifest,
  applyBlockPatches,
  mergeBlockPatch,
} from "./AiBlockSpec.js";

/**
 * AiArticleService — turns a merchant's brief into a Builder block tree.
 *
 * The generator sits behind `generateArticleBlocks()` so the wizard, the job runner and the
 * progress UI are all written against one interface. Today that interface is fulfilled by a
 * deterministic local generator (no API key, no network, no cost); swapping in a real model
 * means implementing `callModel()` and nothing above it changes.
 *
 * Two rules that hold for any provider:
 *
 *  1. **Never invent images.** The merchant's brief is text; images stay as the chosen
 *     template's own sample photography (or a placeholder), and the "After you use it"
 *     checklist already tells them to swap those for their own. Generating imagery would mean
 *     a second model, a second bill, and pictures of products the merchant doesn't sell.
 *
 *  2. **Only emit blocks the editor actually has.** Output is validated against the Builder's
 *     own block vocabulary before it reaches a post, so a hallucinated block type can never
 *     reach normalizeBlocksAst() and render as a blank hole in someone's article.
 *
 * Template generation walks every block (Layout, Content, Media, Commerce) via a full manifest
 * sent to the model — current settings, writable fields, section context — and applies
 * per-block settings patches so the AI decides copy, tables, layout tuning, and commerce labels.
 * Slot-filling fallback remains for truncated responses. Layout/photo/product bindings stay
 * constrained: no invented image URLs or catalogue data.
 */

/** Block types the Builder can render. Anything outside this set is dropped, not guessed at. */
const ALLOWED_BLOCK_TYPES = ALLOWED_AI_BLOCK_TYPES;

/** Stage labels the list page shows while a job runs. Ordered; each carries its own percentage. */
export const AI_STAGES = [
  { key: "reading", label: "Reading your brief", progress: 8 },
  { key: "outline", label: "Planning the outline", progress: 26 },
  { key: "drafting", label: "Writing the sections", progress: 52 },
  { key: "layout", label: "Laying it out in your template", progress: 74 },
  { key: "products", label: "Placing products and images", progress: 88 },
  { key: "finishing", label: "Final polish", progress: 96 },
];

const sentenceCase = (str) => {
  const s = String(str || "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * Merchants write the brief the way they'd talk to a chat model - "Write a **Collection
 * Spotlight Blog** for X", bullet lists of what to "Include", markdown emphasis. The local
 * generator has no model to interpret that with, so without this it was pasting those
 * instructions straight into the article as if they were content. This strips the markdown
 * syntax so any of that text that does end up on the page at least reads as plain prose.
 */
const stripMarkdown = (str) =>
  String(str || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "$1")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .trim();

// A line written as an instruction to a model, not as article content: markdown bullets/numbered
// lists, or directive openers like "Include:" / "Also provide:". These are what a merchant
// pastes when they're prompting like they would with a chat model - keeping them out of the
// paragraph pool is what stops that prompt from surfacing verbatim in the published article.
const INSTRUCTION_LINE =
  /^(\*|-|•|\d+[.)])\s|^(include|also provide|important|note|do not|avoid|use only|format|output)\b\s*:?/i;

/** "Write a guide for X" -> "X" - drops the imperative framing so it reads as a title, not a command. */
const stripImperative = (str) =>
  String(str || "").replace(/^(write|create|generate|draft|compose|produce)\s+(me\s+)?(a|an|the)?\s*/i, "").trim();

/** Strips the rich-text HTML the wizard's editor produces down to plain sentences. */
export function briefToPlainText(brief) {
  return String(brief || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

/** The brief's first line is the working title; the rest is supporting detail. */
function parseBrief(brief) {
  const text = briefToPlainText(brief);
  const lines = text.split("\n").filter(Boolean);

  // The wizard always collects a real title in its own field before this runs, so this is only
  // a last-resort label for other callers that don't supply one - the brief itself is never
  // treated as "line one is the title, the rest is detail" the way it used to be. A merchant can
  // write a one-line brief or a whole page and every line of it is read the same way.
  const topic = sentenceCase(stripImperative(stripMarkdown(lines[0] || ""))).replace(/[.!?]+$/, "");

  const instructionCount = lines.filter((line) => INSTRUCTION_LINE.test(line.trim())).length;
  // A brief written as a set of instructions to a model - several "Include:" / "Also provide:" /
  // bullet lines - isn't content to reuse, even on the lines that don't themselves look like an
  // instruction (a sentence like "Create a 900-1,200 word SEO-friendly article" reads as prose
  // but is still a spec, not something about the merchant's actual topic). Once a brief crosses
  // that bar, none of its lines are trustworthy as body copy for the deterministic fallback -
  // only its topic is kept, and the fallback's own paragraphs are used instead. This only affects
  // the fallback generator; the real model (see generateWithGroq) is always given the full brief
  // verbatim and reads the whole thing regardless of length or shape.
  const looksLikePrompt = instructionCount >= 2 || (lines.length > 0 && instructionCount / lines.length > 0.25);

  const detail = looksLikePrompt
    ? []
    : lines
        .filter((line) => !INSTRUCTION_LINE.test(line.trim()))
        .map(stripMarkdown)
        .filter((line) => line.split(/\s+/).filter(Boolean).length >= 6);

  return { topic, detail, text };
}

/**
 * Walks a template's tree and applies AI block_updates where provided, then fills any remaining
 * content slots via ctx (deterministic fallback for truncated model output).
 */
function adaptTreeToTopic(blocks, ctx, blockUpdatesMap = null) {
  let blockIndex = 0;

  const walk = (block) => {
    if (!block || typeof block !== "object") return null;
    if (!ALLOWED_BLOCK_TYPES.has(block.type)) return null;

    blockIndex += 1;
    const blockId = `b_${blockIndex}`;
    const patch = blockUpdatesMap?.[blockId];
    let settings = { ...(block.settings || {}) };
    const patched = Boolean(patch?.settings);

    if (patched) {
      settings = mergeBlockPatch(block.type, settings, patch.settings);
    }

    // Slot-filling fallback for blocks the model skipped or returned empty
    if (!patched || block.type === "Heading") {
      if (block.type === "Heading" && settings.text) {
        settings.text = settings.level === 1 ? ctx.title : rewriteHeading(settings.text, ctx);
      }
    }
    if (!patched) {
      if (block.type === "HeroSection") {
        if (settings.heading) settings.heading = ctx.title;
        if (settings.subheading) settings.subheading = ctx.subtitle;
        if (settings.showCta && ctx.nextHeroCta) {
          const cta = ctx.nextHeroCta();
          if (cta) settings.ctaText = cta;
        }
      }
      if (block.type === "RichText" && settings.content) {
        settings.content = rewriteRichText(settings.content, ctx);
      }
      if (block.type === "Callout") {
        const callout = ctx.nextCallout?.();
        if (callout) {
          if (callout.title) settings.title = callout.title;
          if (callout.body) settings.body = callout.body;
          if (callout.emoji) settings.emoji = callout.emoji;
        }
      }
      if (block.type === "FaqBlock") {
        const faq = ctx.nextFaq?.();
        if (faq) {
          if (faq.title) settings.title = faq.title;
          if (Array.isArray(faq.items) && faq.items.length) settings.items = faq.items;
        }
      }
      if (block.type === "Table") {
        const table = ctx.nextTable?.();
        if (table?.tableData?.length) {
          settings.tableData = table.tableData;
          settings.rows = table.rows;
          settings.cols = table.cols;
          settings.hasHeader = table.hasHeader;
        }
      }
      if (block.type === "ButtonBlock" && ctx.nextButton) {
        const text = ctx.nextButton();
        if (text) settings.text = text;
      }
      if (block.type === "BuyButton" && ctx.nextButton) {
        const text = ctx.nextButton();
        if (text) settings.buttonText = text;
      }
      if (block.type === "Image" && ctx.nextImageAlt) {
        const alt = ctx.nextImageAlt();
        if (alt) {
          settings.alt = alt;
          if (settings.caption) settings.caption = alt;
        }
      }
      if (block.type === "TableOfContents" && ctx.nextTocTitle) {
        const title = ctx.nextTocTitle();
        if (title) settings.title = title;
      }
      if (block.type === "Collection" && ctx.nextCollectionHeading) {
        const heading = ctx.nextCollectionHeading();
        if (heading) settings.heading = heading;
      }
      if ((block.type === "ProductGrid" || block.type === "ProductSlider") && ctx.nextProductTitle) {
        const title = ctx.nextProductTitle();
        if (title) settings.title = title;
      }
      if (block.type === "ProductCard" && ctx.nextProductTitle) {
        const title = ctx.nextProductTitle();
        if (title) settings.title = title;
      }
      if (block.type === "VideoEmbed" && ctx.nextVideoCaption) {
        const caption = ctx.nextVideoCaption();
        if (caption) settings.caption = caption;
      }
    } else if (block.type === "HeroSection") {
      if (settings.heading) settings.heading = ctx.title;
    }

    const children = Array.isArray(block.children)
      ? block.children.map(walk).filter(Boolean)
      : [];

    return { ...block, settings, children };
  };

  return (Array.isArray(blocks) ? blocks : []).map(walk).filter(Boolean);
}

/** Template headings carry the section's job ("Ingredients", "Step 1: ...") - keep that shape. */
function rewriteHeading(text, ctx) {
  const original = String(text || "").trim();
  if (!original) return original;

  const stepMatch = original.match(/^(Step\s*\d+|[0-9]+\.)\s*[:.]?\s*(.*)$/i);
  if (stepMatch) {
    return `${stepMatch[1]}: ${ctx.nextStepTitle()}`;
  }
  // A heading that already reads as a generic section label ("Ingredients", "The verdict")
  // stays as-is; one that names the template's own sample subject gets re-pointed at the topic.
  if (/\[|\bproduct name\b|\bcollection name\b/i.test(original)) {
    return ctx.title;
  }
  return original;
}

/** Rebuilds a Tiptap doc with generated paragraphs, preserving any colour marks it carried. */
function rewriteRichText(content, ctx) {
  if (!content || typeof content !== "object" || !Array.isArray(content.content)) return content;
  return {
    ...content,
    content: content.content.map((node) => {
      if (node.type !== "paragraph") return node;
      const marks = node.content?.[0]?.marks;
      const text = ctx.nextParagraph();
      return {
        type: "paragraph",
        content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
      };
    }),
  };
}

/**
 * The local generator. Deterministic for a given brief, so the same input always produces the
 * same article - which makes the wizard testable without a model in the loop.
 */
function localGenerator({ topic, detail }, explicitTitle, requirements = emptyRequirements()) {
  // The merchant already typed a real title in the previous step - it's a far better anchor for
  // the Hero heading and the generic paragraphs below than a guess parsed out of the brief, and
  // it can't come out looking like a raw instruction the way the brief's first line sometimes did.
  const subject = String(explicitTitle || "").trim() || topic || "your topic";
  const detailPool = detail.length ? detail : [];
  let paragraphIndex = 0;
  let stepIndex = 0;

  const paragraphs = [
    `${sentenceCase(subject)} is worth getting right, and most guides skip the part that actually matters. This section covers what to do, in the order that works.`,
    `Start with the basics. ${sentenceCase(subject)} rewards preparation more than technique - get the setup right and the rest follows without much fuss.`,
    `The most common mistake is rushing this stage. Give it the time it needs and the difference shows immediately in the result.`,
    `Once you have the fundamentals down, small adjustments make a large difference. Change one thing at a time so you can tell what actually helped.`,
    `Keep what works and drop what doesn't. There's no single correct approach to ${subject} - only the one that fits how you actually work.`,
    `If you take one thing from this: consistency beats intensity. A repeatable routine will outperform an occasional perfect attempt every time.`,
  ];

  const stepTitles = [
    "Get everything ready",
    "Start slow and check as you go",
    "Adjust to taste",
    "Finish and rest",
    "Store it properly",
    "Review what worked",
  ];

  const base = {
    title: sentenceCase(subject),
    subtitle: `A practical guide to ${subject.toLowerCase()}, written to be edited.`,
    nextParagraph: () => {
      // Merchant-supplied detail lines are used first - they're the closest thing to their
      // own voice in the brief - then the generated pool, cycling if the template is long.
      if (paragraphIndex < detailPool.length) return detailPool[paragraphIndex++];
      const p = paragraphs[(paragraphIndex - detailPool.length) % paragraphs.length];
      paragraphIndex += 1;
      return p;
    },
    nextStepTitle: () => stepTitles[stepIndex++ % stepTitles.length],
  };

  return attachContentAccessors(base, {}, { topic, detail }, explicitTitle, requirements);
}

const STEP_HEADING_RE = /^(Step\s*\d+|[0-9]+\.)\s*[:.]?\s*(.*)$/i;
const PLACEHOLDER_HEADING_RE = /\[|\bproduct name\b|\bcollection name\b/i;

function emptyRequirements() {
  return {
    manifest: [],
    paragraphSlots: [],
    stepCount: 0,
    tableSlots: [],
    calloutSlots: [],
    faqSlots: [],
    buttonSlots: [],
    imageAltSlots: [],
    tocSlots: [],
    collectionHeadingSlots: [],
    productTitleSlots: [],
    heroCtaSlots: [],
    videoCaptionSlots: [],
  };
}

function padRow(row, cols) {
  return Array.from({ length: cols }, (_, i) => String(row?.[i] ?? "").trim());
}

function normalizeTable(tableData, hasHeader, slot) {
  const rows = (Array.isArray(tableData) ? tableData : [])
    .filter((r) => Array.isArray(r) && r.some((c) => String(c || "").trim()))
    .map((r) => r.map((c) => String(c ?? "").trim()));
  if (!rows.length) return null;
  const cols = Math.max(Number(slot?.cols) || 0, ...rows.map((r) => r.length), 1);
  const padded = rows.map((r) => padRow(r, cols));
  return { rows: padded.length, cols, tableData: padded, hasHeader: Boolean(hasHeader) };
}

function parseAiTable(raw, slot) {
  if (!raw) return null;
  if (Array.isArray(raw.tableData)) {
    return normalizeTable(raw.tableData, raw.hasHeader ?? slot.hasHeader, slot);
  }
  if (Array.isArray(raw.headers) || Array.isArray(raw.rows)) {
    const headers = Array.isArray(raw.headers) ? raw.headers : [];
    const body = Array.isArray(raw.rows) ? raw.rows : [];
    const data = slot.hasHeader !== false && headers.length ? [headers, ...body] : body;
    return normalizeTable(data, slot.hasHeader !== false, slot);
  }
  if (Array.isArray(raw) && Array.isArray(raw[0])) {
    return normalizeTable(raw, slot.hasHeader !== false, slot);
  }
  return null;
}

/** Fallback table that at least drops the template's sample subject (cookies, etc.). */
function localTableForSlot(slot, subject, detail) {
  const sample = Array.isArray(slot.sample) ? slot.sample : [];
  const hasHeader = slot.hasHeader !== false;
  const cols = Math.max(Number(slot.cols) || 0, sample[0]?.length || 0, 2);
  const header = hasHeader && sample[0] ? padRow(sample[0], cols) : padRow(
    cols === 2 ? ["Item", "Details"] : Array.from({ length: cols }, (_, i) => `Column ${i + 1}`),
    cols
  );

  const compact = (Array.isArray(detail) ? detail : []).filter((line) => line.split(/\s+/).length <= 16);
  let body;
  if (compact.length >= 2) {
    body = compact.slice(0, 16).map((line) => {
      if (cols === 2) {
        const split = line.split(/\s+[–—-]\s+|\t/);
        if (split.length >= 2) return padRow(split, 2);
        const m = line.match(/^(\S+(?:\s+\S+){0,2})\s+(.+)$/);
        return m ? padRow([m[1], m[2]], 2) : padRow([line, ""], 2);
      }
      return padRow([line], cols);
    });
  } else {
    const count = Math.min(8, Math.max(3, (sample.length - (hasHeader ? 1 : 0)) || 4));
    body = Array.from({ length: count }, (_, i) =>
      padRow(cols === 2 ? [`${i + 1}`, `${sentenceCase(subject)} — add your item`] : [`${sentenceCase(subject)} — row ${i + 1}`], cols)
    );
  }

  const tableData = hasHeader ? [header, ...body] : body;
  return { rows: tableData.length, cols, tableData, hasHeader };
}

function parseAiCallout(raw, slot, ctx) {
  const title = String(raw?.title || "").trim() || slot.sampleTitle || "Tip";
  const body = String(raw?.body || "").trim() || ctx.nextParagraph();
  const emoji = String(raw?.emoji || "").trim();
  return {
    title,
    body,
    emoji: emoji && emoji.length <= 4 ? emoji : slot.sampleEmoji || "💡",
  };
}

function parseAiFaq(raw, slot, ctx) {
  const title = String(raw?.title || "").trim() || slot.sampleTitle || "FAQs";
  const incoming = Array.isArray(raw?.items) ? raw.items : [];
  const items = incoming
    .filter((it) => it && String(it.question || "").trim() && String(it.answer || "").trim())
    .slice(0, 8)
    .map((it, i) => ({
      id: slot.sampleItems[i]?.id || `faq_${i + 1}`,
      question: String(it.question).trim(),
      answer: String(it.answer).trim(),
    }));
  if (items.length) return { title, items };
  return {
    title,
    items: (slot.sampleItems || []).map((item, i) => ({
      ...item,
      question: rewriteHeading(item.question, ctx) || item.question,
      answer: ctx.nextParagraph(),
      id: item.id || `faq_${i + 1}`,
    })),
  };
}

/**
 * Adds table/callout/FAQ/button/alt accessors. Groq fills `ai` arrays in walk order; missing
 * items fall back to a local rewrite so a truncated JSON response still replaces sample copy.
 */
function attachContentAccessors(base, ai, { detail }, explicitTitle, requirements) {
  const subject = base.title || String(explicitTitle || "").trim() || "your topic";
  const req = requirements || emptyRequirements();
  let tableI = 0;
  let calloutI = 0;
  let faqI = 0;
  let buttonI = 0;
  let altI = 0;
  let tocI = 0;
  let collectionI = 0;
  let productI = 0;
  let heroCtaI = 0;
  let captionI = 0;

  const takeStr = (list, i, fallback) => {
    const v = Array.isArray(list) ? String(list[i] || "").trim() : "";
    return v || fallback;
  };

  return {
    ...base,
    nextTable: () => {
      const slot = req.tableSlots[tableI];
      const parsed = parseAiTable(ai.tables?.[tableI], slot || {});
      tableI += 1;
      if (parsed) return parsed;
      return slot ? localTableForSlot(slot, subject, detail) : null;
    },
    nextCallout: () => {
      const slot = req.calloutSlots[calloutI];
      const raw = ai.callouts?.[calloutI];
      calloutI += 1;
      if (!slot) return null;
      return parseAiCallout(raw, slot, base);
    },
    nextFaq: () => {
      const slot = req.faqSlots[faqI];
      const raw = ai.faqs?.[faqI];
      faqI += 1;
      if (!slot) return null;
      return parseAiFaq(raw, slot, base);
    },
    nextButton: () => {
      const slot = req.buttonSlots[buttonI];
      const text = takeStr(ai.buttons, buttonI, "");
      buttonI += 1;
      if (text) return text;
      return slot?.sample ? String(slot.sample) : "Learn more";
    },
    nextImageAlt: () => {
      const slot = req.imageAltSlots[altI];
      const text = takeStr(ai.image_alts, altI, "");
      altI += 1;
      if (text) return text;
      return slot?.sample ? `Photo for ${subject}` : `Photo for ${subject}`;
    },
    nextTocTitle: () => {
      const text = takeStr(ai.toc_titles, tocI, "");
      tocI += 1;
      return text || "In this article";
    },
    nextCollectionHeading: () => {
      const text = takeStr(ai.collection_headings, collectionI, "");
      collectionI += 1;
      return text || `Shop ${subject}`;
    },
    nextProductTitle: () => {
      const slot = req.productTitleSlots[productI];
      const text = takeStr(ai.product_titles, productI, "");
      productI += 1;
      return text || slot?.sample || "";
    },
    nextHeroCta: () => {
      const text = takeStr(ai.hero_ctas, heroCtaI, "");
      heroCtaI += 1;
      return text || "Learn more";
    },
    nextVideoCaption: () => {
      const text = takeStr(ai.video_captions, captionI, "");
      captionI += 1;
      return text || "";
    },
  };
}

/** Flattens a Tiptap doc's paragraph text - used only to give the model a hint of a slot's role. */
function plainTextFromDoc(content) {
  if (!content || !Array.isArray(content.content)) return "";
  return content.content
    .map((node) => (Array.isArray(node.content) ? node.content.map((n) => n.text || "").join("") : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Walks the template ahead of generation to collect every content-bearing slot. `adaptTreeToTopic`
 * walks the identical tree in the identical order and pulls one item per slot in sequence — so
 * this list's order is a contract with that walk, not just a count.
 */
function collectContentRequirements(blocks) {
  const req = emptyRequirements();

  const walk = (list, inheritedHeading) => {
    let heading = inheritedHeading;
    (Array.isArray(list) ? list : []).forEach((block) => {
      if (!block || typeof block !== "object" || !ALLOWED_BLOCK_TYPES.has(block.type)) return;
      const settings = block.settings || {};

      if (block.type === "Heading" && settings.text) {
        const text = String(settings.text).trim();
        if (settings.level === 1) {
          // Gets replaced with the real article title regardless - the template's own sample
          // subject isn't a useful "this section is about X" hint for the siblings that follow it.
        } else if (STEP_HEADING_RE.test(text)) req.stepCount += 1;
        else if (!PLACEHOLDER_HEADING_RE.test(text)) heading = text;
      } else if (block.type === "HeroSection" && settings.showCta) {
        req.heroCtaSlots.push({ heading, sample: settings.ctaText || "Shop Now" });
      } else if (block.type === "RichText" && settings.content?.content) {
        const paraCount = settings.content.content.filter((n) => n.type === "paragraph").length;
        const hint = plainTextFromDoc(settings.content).slice(0, 240);
        for (let i = 0; i < paraCount; i += 1) req.paragraphSlots.push({ heading, hint, kind: "body" });
      } else if (block.type === "Callout") {
        req.calloutSlots.push({
          heading,
          sampleTitle: settings.title || "Tip",
          sampleBody: settings.body || "",
          sampleEmoji: settings.emoji || "💡",
        });
      } else if (block.type === "FaqBlock") {
        req.faqSlots.push({
          heading,
          sampleTitle: settings.title || "FAQs",
          sampleItems: Array.isArray(settings.items) ? settings.items : [],
        });
      } else if (block.type === "Table" && Array.isArray(settings.tableData) && settings.tableData.length) {
        req.tableSlots.push({
          heading,
          hasHeader: settings.hasHeader !== false,
          cols: Number(settings.cols) || settings.tableData[0]?.length || 2,
          sample: settings.tableData,
        });
      } else if (block.type === "ButtonBlock") {
        req.buttonSlots.push({ heading, sample: settings.text || "Click Here", kind: "button" });
      } else if (block.type === "BuyButton") {
        req.buttonSlots.push({ heading, sample: settings.buttonText || "Add to Cart", kind: "buy" });
      } else if (block.type === "Image") {
        req.imageAltSlots.push({ heading, sample: settings.alt || settings.caption || "" });
      } else if (block.type === "TableOfContents") {
        req.tocSlots.push({ heading, sample: settings.title || "Table of Contents" });
      } else if (block.type === "Collection") {
        req.collectionHeadingSlots.push({ heading, sample: settings.heading || "" });
      } else if (block.type === "ProductGrid" || block.type === "ProductSlider") {
        req.productTitleSlots.push({ heading, sample: settings.title || "" });
      } else if (block.type === "ProductCard") {
        req.productTitleSlots.push({ heading, sample: settings.title || "" });
      } else if (block.type === "VideoEmbed") {
        req.videoCaptionSlots.push({ heading, sample: settings.caption || "" });
      }

      walk(block.children, block.type === "Section" ? "" : heading);
    });
  };

  walk(blocks, "");
  req.manifest = buildTemplateManifest(blocks);
  return req;
}

/** Groq's 429 body names the wait itself, e.g. "...try again in 11.9775s". Falls back to 2s. */
function parseRetryAfterSeconds(body) {
  const m = String(body || "").match(/try again in\s+([\d.]+)s/i);
  const s = m ? parseFloat(m[1]) : NaN;
  return Number.isFinite(s) && s > 0 ? Math.min(s, 15) : 2;
}

// Groq's free tier caps both "tokens per minute" (TPM) and "tokens per day" (TPD) - the message
// names which one. A TPM limit clears in seconds, worth the one retry below. A TPD limit clears
// in however many minutes are left until Groq's daily reset - no amount of waiting inside one
// request gets there, so retrying it would just make the merchant wait ~15s for a call that was
// always going to fail, then fall back anyway. This tells them apart so only the first gets retried.
const isDailyLimit = (body) => /tokens per day|\(TPD\)/i.test(String(body || ""));

/**
 * POSTs one chat-completion request to Groq's OpenAI-compatible API and returns the raw JSON
 * string. Retries once on a per-minute 429: free-tier Groq's per-minute token budget is tight
 * enough that this is routine, not exceptional (it fired repeatedly just testing this file), and
 * it always names its own cooldown - waiting that out once turns a fully working generation that
 * happened to land badly into a fallback-to-filler for a merchant, which was previously the only
 * outcome. A daily-limit 429, or anything other than a 429, still fails immediately - retrying
 * either won't fix it within this request.
 */
async function callGroq(messages, attempt = 0) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4500,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429 && attempt === 0 && !isDailyLimit(body)) {
      const waitSeconds = parseRetryAfterSeconds(body);
      await new Promise((r) => setTimeout(r, waitSeconds * 1000));
      return callGroq(messages, attempt + 1);
    }
    const reason = res.status === 429 && isDailyLimit(body) ? "AI service's daily generation limit" : `AI service error (${res.status})`;
    throw new Error(`${reason}: ${body.slice(0, 300) || res.statusText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI service returned an empty response. Please try again.");
  return content;
}

/**
 * Real generation: one Groq call with a COMPACT template manifest (content/media/commerce
 * blocks + slim settings). The full BLOCK_VOCABULARY blew Groq's free-tier 8k TPM limit
 * (413 Request too large) — we use BLOCK_VOCABULARY_COMPACT and truncate sample tables.
 * Returns blockUpdates for adaptTreeToTopic, plus slot-array fallbacks for gaps.
 */
function blockUpdatesToMap(updates) {
  const map = {};
  for (const u of Array.isArray(updates) ? updates : []) {
    if (u?.id) map[String(u.id)] = u;
  }
  return map;
}

async function generateWithGroq({ topic, detail, text }, explicitTitle, requirements, productNames = []) {
  const subject = String(explicitTitle || "").trim() || topic || "your topic";
  const briefText = String(text || "").slice(0, 3500);
  // Compact the already-built full manifest (same b_N ids as adaptTreeToTopic walk).
  let promptManifest = requirements.manifest || [];
  if (promptManifest.length) {
    const PRIORITY = new Set([
      "Heading", "RichText", "Table", "Callout", "FaqBlock", "TableOfContents",
      "HeroSection", "Image", "ButtonBlock", "BuyButton", "ProductGrid", "ProductSlider",
      "Collection", "ProductCard", "VideoEmbed",
    ]);
    promptManifest = promptManifest.map((entry) => {
      if (!PRIORITY.has(entry.type)) {
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

  const system = [
    "Adapt a Shopify blog template to the merchant's article. You know every Layout/Content/Media/Commerce block.",
    "Return JSON with subtitle + block_updates[{id, settings}] for every content-bearing block.",
    "The template's own sample content - its FAQ questions, table rows, paragraph counts - shows you the",
    "SHAPE of each block, not a target to match. Rewrite the actual words, not just the answers underneath",
    "them, and use more or fewer of any repeatable item (paragraphs, FAQ entries, table rows) than the",
    "sample has whenever this specific topic calls for it - don't reproduce the template's exact counts.",
    "Aim for roughly 700-1200 words of body copy across the whole article, unless this specific topic",
    "genuinely needs more or less - a short topic should stay short; don't pad it to hit a number.",
    "Never state a specific number, price, policy or timeframe (a return window, shipping cost, warranty",
    "length, discount, ingredient quantity) that the merchant's brief didn't give you - answer generally",
    "instead of inventing a plausible-sounding figure, especially in FAQ answers and table cells.",
    "Tables MUST get full new tableData (never keep sample cookie/recipe rows).",
    "RichText: settings.paragraphs as string[]. Never invent image URLs. No markdown.",
    productNames.length
      ? `Products linked to this article: ${productNames.join(", ")}. Mention them by name where it reads ` +
        "naturally (an intro, a CTA, a closing line) - never invent a price, size, or spec for them beyond the name."
      : "No products are linked to this article - don't invent a product to reference.",
    BLOCK_VOCABULARY_COMPACT,
  ].join("\n");

  const user = [
    `Title: ${subject}`,
    `Brief:\n"""\n${briefText || "(write generically about the title)"}\n"""`,
    `Manifest (${promptManifest.length} blocks):`,
    JSON.stringify(promptManifest),
    "Respond JSON only:",
    JSON.stringify({
      subtitle: "max 22 words",
      metaTitle: "SEO title tag, max 60 characters",
      metaDescription: "SEO meta description, 150-160 characters, written to earn a click",
      block_updates: [
        { id: "b_N", settings: { paragraphs: ["..."], tableData: [["Amount", "Ingredient"], ["400 g", "Paneer"]], text: "...", title: "...", items: [{ question: "...", answer: "..." }] } },
      ],
    }),
  ].join("\n");

  const raw = await callGroq([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);

  let response;
  try {
    response = JSON.parse(raw);
  } catch {
    throw new Error("AI service returned output that wasn't valid JSON. Please try again.");
  }

  const blockUpdates = blockUpdatesToMap(response.block_updates);
  const subtitle =
    String(response.subtitle || "").trim() ||
    `A practical guide to ${subject.toLowerCase()}, written to be edited.`;
  const metaTitle = String(response.metaTitle || "").trim().slice(0, 70) || null;
  const metaDescription = String(response.metaDescription || "").trim().slice(0, 320) || null;

  const paragraphs = Array.isArray(response.paragraphs)
    ? response.paragraphs.map((p) => String(p || "").trim()).filter(Boolean)
    : [];
  const steps = Array.isArray(response.steps)
    ? response.steps.map((s) => String(s || "").trim()).filter(Boolean)
    : [];

  const fallback = localGenerator({ topic, detail }, explicitTitle, requirements);
  let paragraphCursor = 0;
  let stepCursor = 0;

  const base = {
    title: sentenceCase(subject),
    subtitle,
    metaTitle,
    metaDescription,
    blockUpdates,
    nextParagraph: () =>
      paragraphCursor < paragraphs.length ? paragraphs[paragraphCursor++] : fallback.nextParagraph(),
    nextStepTitle: () => (stepCursor < steps.length ? steps[stepCursor++] : fallback.nextStepTitle()),
  };

  return attachContentAccessors(
    base,
    {
      tables: Array.isArray(response.tables) ? response.tables : [],
      callouts: Array.isArray(response.callouts) ? response.callouts : [],
      faqs: Array.isArray(response.faqs) ? response.faqs : [],
      buttons: Array.isArray(response.buttons) ? response.buttons : [],
      image_alts: Array.isArray(response.image_alts) ? response.image_alts : [],
      toc_titles: Array.isArray(response.toc_titles) ? response.toc_titles : [],
      collection_headings: Array.isArray(response.collection_headings) ? response.collection_headings : [],
      product_titles: Array.isArray(response.product_titles) ? response.product_titles : [],
      hero_ctas: Array.isArray(response.hero_ctas) ? response.hero_ctas : [],
      video_captions: Array.isArray(response.video_captions) ? response.video_captions : [],
    },
    { topic, detail },
    explicitTitle,
    requirements
  );
}

/**
 * Binds the merchant's chosen products into the template's product blocks, replacing the sample
 * catalogue. Products come from /api/posts/shopify/products/by-ids, so each already carries the
 * real first-variant id - without that an "Add to cart" renders but can't actually add.
 *
 * Blocks are filled in tree order and the list cycles if the template has more slots than the
 * merchant picked, so a 3-up grid never renders with two empty cards.
 */
function applyProducts(blocks, products) {
  if (!Array.isArray(products) || products.length === 0) return blocks;

  const normalized = products.map((p) => ({
    title: p.title,
    handle: p.handle,
    price: p.price != null ? String(p.price) : undefined,
    currency: p.currency || "USD",
    image: p.image || p.featuredImage?.url || undefined,
    featuredImage: p.image ? { url: p.image } : p.featuredImage,
    variantId: p.variantId || undefined,
    shopifyProductId: p.id || p.shopifyProductId || undefined,
    description: p.description || undefined,
  }));

  let cursor = 0;
  const take = (n) => Array.from({ length: n }, () => normalized[cursor++ % normalized.length]);

  const walk = (block) => {
    const settings = { ...(block.settings || {}) };

    if (block.type === "BuyButton") {
      settings.product = take(1)[0];
    } else if (block.type === "ProductGrid" || block.type === "ProductSlider") {
      const count = Math.max(1, (settings.manualProducts || []).length || Number(settings.columns) || 3);
      settings.manualProducts = take(count);
    } else if (block.type === "Collection") {
      const count = Math.max(1, (settings.manualProducts || []).length || 3);
      settings.manualProducts = take(count);
    }

    return {
      ...block,
      settings,
      children: Array.isArray(block.children) ? block.children.map(walk) : [],
    };
  };

  return blocks.map(walk);
}

/**
 * Overrides the template's own palette with the merchant's two colours.
 *
 * Only recolours what the template itself painted - a section that had no background stays
 * unpainted, a heading that was default-dark stays default-dark. Repainting everything would
 * turn a restrained layout into a solid slab of one colour, and the theme-agnostic rule against
 * restyling chrome applies just as much to our own templates.
 */
function applyColors(blocks, { primaryColor, backgroundColor }) {
  const primary = primaryColor && /^#[0-9a-f]{3,8}$/i.test(primaryColor) ? primaryColor : null;
  const background = backgroundColor && /^#[0-9a-f]{3,8}$/i.test(backgroundColor) ? backgroundColor : null;
  if (!primary && !background) return blocks;

  const isWhite = (c) => {
    if (!c || typeof c !== "string") return false;
    const clean = c.trim().toLowerCase();
    return clean === "#fff" || clean === "#ffffff" || clean === "white" || clean === "#ffffffff";
  };

  const isPainted = (c) => {
    if (!c || typeof c !== "string") return false;
    const clean = c.trim().toLowerCase();
    return clean !== "transparent" && clean !== "rgba(0, 0, 0, 0)" && clean !== "rgba(0,0,0,0)" && !isWhite(c);
  };

  const walk = (block) => {
    const settings = { ...(block.settings || {}) };

    if (primary) {
      if (block.type === "Heading" && settings.color && !isWhite(settings.color)) {
        settings.color = primary;
      }
      if (block.type === "ButtonBlock" && settings.backgroundColor) settings.backgroundColor = primary;
      if ((block.type === "BuyButton" || block.type === "ProductGrid" || block.type === "Collection") && settings.buttonColor) {
        settings.buttonColor = primary;
      }
      if (block.type === "HeroSection" && settings.ctaColor) settings.ctaColor = primary;
      if (block.type === "Callout" && settings.borderColor) settings.borderColor = primary;
      if (block.type === "FaqBlock" && settings.accentColor) settings.accentColor = primary;
      if (block.type === "TableOfContents" && settings.style === "panel" && settings.backgroundColor) {
        settings.backgroundColor = primary;
      }
    }

    if (background && block.type === "Section" && isPainted(settings.backgroundColor)) {
      settings.backgroundColor = background;
    }

    return {
      ...block,
      settings,
      children: Array.isArray(block.children) ? block.children.map(walk) : [],
    };
  };

  return blocks.map(walk);
}

/**
 * The starting layout used when the merchant picks "Blank template" and still asks for AI
 * generation. There's no template block tree to adapt in that case, so this hand-builds one
 * modest, structurally complete article - hero, intro, a couple of body sections each with an
 * image slot, a callout, an FAQ, and a closing CTA - for the exact same pipeline
 * (collectContentRequirements -> generateWithGroq/localGenerator -> adaptTreeToTopic) to fill in
 * exactly like it fills in a real template's slots.
 *
 * Image blocks point at PLACEHOLDER_IMAGE_SRC rather than a real photo: an empty `src` renders
 * nothing at all on the published post (compileBlocksToHtml's `if (!src) return ""`), which
 * leaves no visible sign an image belongs there once the merchant is looking at the live article
 * instead of the editor canvas. A drawn "add your image here" placeholder is visible everywhere -
 * canvas, preview and the live post alike - without being an invented photo the way a real
 * generated image would be; it's the same kind of affordance the canvas's own empty-Image
 * upload box already gives, just one that survives all the way to publish.
 *
 * `withProducts` appends one more section with a product grid only when the merchant actually
 * linked products in the wizard - a blank article with an unbound product grid would render an
 * empty grid for everyone who didn't.
 */
const PLACEHOLDER_IMAGE_SRC =
  "data:image/svg+xml," +
  encodeURIComponent(
    "<svg width='800' height='450' viewBox='0 0 800 450' xmlns='http://www.w3.org/2000/svg'>" +
      "<rect width='800' height='450' fill='#F1F2F3'/>" +
      "<rect x='2' y='2' width='796' height='446' fill='none' stroke='#C9CCCF' stroke-width='3' stroke-dasharray='10 8'/>" +
      "<g transform='translate(400,175)' fill='none' stroke='#8C9196' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'>" +
      "<rect x='-70' y='-52' width='140' height='104' rx='12'/>" +
      "<circle cx='-32' cy='-20' r='14'/>" +
      "<path d='M-70 34 L-24 -6 L12 24 L40 -12 L70 34'/>" +
      "</g>" +
      "<text x='400' y='285' font-family='Helvetica, Arial, sans-serif' font-size='30' font-weight='600' fill='#6D7175' text-anchor='middle'>Add your image here</text>" +
      "</svg>"
  );

function buildBlankScaffold({ withProducts } = {}) {
  const accent = "#303030";
  const tint = "#f4f4f3";
  const richDoc = (paragraphCount) => ({
    type: "doc",
    content: Array.from({ length: paragraphCount }, () => ({ type: "paragraph" })),
  });
  const section = (settings, children) => ({ type: "Section", settings: settings || {}, children });
  const heading = (text, level = 2) => ({ type: "Heading", settings: { text, level }, children: [] });
  const rich = (paragraphCount) => ({ type: "RichText", settings: { content: richDoc(paragraphCount) }, children: [] });
  const image = () => ({
    type: "Image",
    settings: { alt: "Placeholder - replace with your own image", src: PLACEHOLDER_IMAGE_SRC },
    children: [],
  });

  const blocks = [
    {
      type: "HeroSection",
      settings: {
        heading: "Untitled article",
        subheading: "A short summary of what this article covers.",
        showCta: false,
        overlayColor: "#000000",
        overlayOpacity: 0.25,
        minHeight: "320px",
      },
      children: [],
    },
    section({ paddingTop: "28px", paddingBottom: "12px" }, [
      {
        type: "TableOfContents",
        settings: {
          style: "panel",
          title: "In this article",
          listStyle: "numbered",
          textColor: "#ffffff",
          titleColor: "#ffffff",
          backgroundColor: accent,
          borderRadius: 10,
          padding: "18px 22px",
        },
        children: [],
      },
    ]),
    section({ paddingTop: "8px", paddingBottom: "16px" }, [heading("Introduction", 2), rich(2)]),
    section({ paddingTop: "8px", paddingBottom: "16px" }, [heading("Why it matters", 2), rich(2), image()]),
    section({ paddingTop: "8px", paddingBottom: "16px" }, [heading("What to know", 2), rich(2), image()]),
    section({ paddingTop: "8px", paddingBottom: "16px" }, [
      {
        type: "Callout",
        // adaptTreeToTopic only rewrites a Callout when settings.body is already truthy - an
        // empty string here would skip generation entirely and leave the callout blank.
        settings: { backgroundColor: tint, borderColor: accent, type: "tip", title: "Tip", body: "placeholder", emoji: "💡" },
        children: [],
      },
    ]),
    section({ paddingTop: "8px", paddingBottom: "16px" }, [
      heading("Frequently asked questions", 2),
      {
        type: "FaqBlock",
        settings: {
          title: "FAQs",
          accentColor: accent,
          borderColor: tint,
          // Generic-but-real questions, not "Question one" placeholders - the model is only
          // asked to write the answer (see generateWithGroq's prompt), so the question itself
          // has to already read naturally regardless of topic.
          items: [
            { id: "faq_1", question: "What should I know before I start?", answer: "placeholder" },
            { id: "faq_2", question: "Where can I find more guidance?", answer: "placeholder" },
          ],
        },
        children: [],
      },
    ]),
  ];

  if (withProducts) {
    blocks.push(
      section({ paddingTop: "8px", paddingBottom: "16px" }, [
        heading("Shop featured products", 2),
        { type: "ProductGrid", settings: { columns: 3, showPrice: true, showButton: true, buttonColor: accent, manualProducts: [] }, children: [] },
      ])
    );
  }

  blocks.push(
    section({ paddingTop: "8px", paddingBottom: "24px" }, [
      heading("Ready to get started?", 2),
      rich(1),
      { type: "ButtonBlock", settings: { text: "Learn more", backgroundColor: accent, url: "#" }, children: [] },
    ])
  );

  return blocks;
}

// The content-unit vocabulary the model picks from for a blank-template article. Kept flat and
// simple (not our real nested block AST, and not real Tiptap JSON) so the model's job is choosing
// *which* units to use, in what order and how many - not reproducing our internal schema exactly,
// which risked malformed trees. buildTreeFromUnits() below turns this into real blocks: it groups
// runs of units into Sections (a new Section starts at each heading), merges consecutive
// paragraphs into one RichText, and applies the same "never invent an image/product" rules as
// everywhere else in this file regardless of what the model asked for.
const CONTENT_UNIT_TYPES = ["heading", "paragraph", "image", "callout", "table", "faq", "divider", "button", "columns", "video"];

/** Only a real YouTube/Vimeo link is trusted - the model is told never to invent one, but this
 *  is the actual enforcement, same as every other "never invent" rule in this file. */
const VIDEO_URL_RE = /^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/)/i;

/** Mixes a hex color toward white by `amount` (0-1) - used to derive a light tint from whatever
 *  accent color the model picks, the same way blogTemplates.js derives each template's palette. */
function tintOf(hex, amount = 0.92) {
  const clean = String(hex || "").replace("#", "");
  const h = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return "#f4f4f3";
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

/**
 * The blank-template path when a real model is available. Earlier versions of this still forced
 * every article through a fixed Hero -> intro -> two body sections -> FAQ -> CTA skeleton and
 * only let the model vary the wording inside it, which was the actual complaint: two different
 * topics still "followed the same layout." This instead hands the model the full palette of
 * content block types and their settings and lets it choose the shape itself - how many sections,
 * which block types, in what order, whether a table or an FAQ or neither suits this specific
 * topic - the same way a person would decide how to lay out this particular article.
 *
 * Falls back to buildBlankScaffold + the slot-filling pipeline (see generateArticleBlocks) on
 * any failure - a worse-but-working draft beats none at all.
 */
async function generateBlankArticleWithGroq({ text }, explicitTitle, { withProducts, productNames = [] } = {}) {
  const subject = String(explicitTitle || "").trim() || "your topic";
  // generateWithGroq (the template path) caps its brief at 3500 chars before it ever reaches
  // Groq - this path sent the whole thing uncapped, so a merchant who used the rich text editor
  // for a genuinely long brief (it allows up to ~30k chars) could blow the request past Groq's
  // TPM ceiling and silently degrade to the filler fallback for a reason that had nothing to do
  // with content quality.
  const briefText = String(text || "").slice(0, 3500);

  const system =
    "You are laying out, writing and styling a Shopify blog article from scratch - there is no " +
    "template to fill in, so you decide which content blocks this specific article needs, in what " +
    "order, how many of each, and how the hero banner and accent color look. Two different topics " +
    "should end up genuinely different in every respect: a recipe might want a table of ingredients, " +
    "a warm terracotta accent and no FAQ; a product roundup might want several images, a bold accent " +
    "and no table; a technical explainer might want two callouts, a cool blue accent and a short FAQ. " +
    "Never default to the same block sequence, hero styling, or color for every article - decide " +
    "fresh each time, based only on what this specific topic and mood call for. Write substantive, " +
    "complete paragraphs, not thin filler - a merchant reading this should feel like it actually " +
    "covers the topic. If the title or brief names a count - \"7 best X\", \"10 ways to Y\", \"5 " +
    "things to know about Z\" - the article must actually be scannable as that list: give EACH item " +
    "its own heading using that item's real name (not 3-4 broad category headings each covering " +
    "several items lumped into one paragraph) so a reader can find item #4 by scanning headings or " +
    "the table of contents, and the list of headings should visibly account for the full count named " +
    "in the title. A visual list like this - poses, recipes, products, outfits, tools - should have " +
    "an image after most items, not just one for the whole article. Aim for roughly 700-1200 words " +
    "of body copy across the whole article, unless this specific topic genuinely needs more or less - " +
    "a short topic should stay short, don't pad it to hit a number. Use only facts, products and " +
    "claims the merchant actually gave you in their brief - never invent prices, ingredients, " +
    "certifications, health claims or reviews, and never state a specific number, policy or timeframe " +
    "(a return window, shipping cost, warranty length) the brief didn't give you, especially in an FAQ " +
    "answer - answer generally instead of inventing a plausible-sounding figure. Write plain " +
    "prose with no markdown formatting (no asterisks, no bullet characters, no heading markup) - the " +
    "output is inserted directly into already-styled blocks. " +
    (productNames.length
      ? `Products linked to this article: ${productNames.join(", ")}. Mention them by name where it reads ` +
        "naturally (an intro, a closing line, a callout) - never invent a price, size or spec for them " +
        "beyond the name. "
      : "No products are linked to this article - don't invent a product to reference. ") +
    "Respond with ONLY a single JSON object, no commentary before or after it.\n\n" +
    BLOCK_VOCABULARY_COMPACT;

  const paletteDoc = {
    accentColor:
      "a hex color like \"#b5482a\" that fits this topic's mood and category (warm tones for food/home, " +
      "cool tones for tech/wellness, bold tones for fashion/fitness, etc.) - choose deliberately, never " +
      "default to black or gray",
    hero:
      "{ heading, subheading, showCta, ctaText } or null - a banner at the very top; skip it (null) " +
      "only if this topic genuinely doesn't want one. showCta/ctaText are optional - include a short " +
      "call-to-action button in the hero when it fits, omit it when it doesn't",
    blocks:
      "an array of 8-18 content units, each one of the shapes below, in the order they should appear",
    unit_shapes: {
      heading: '{ "type": "heading", "text": "string" } - starts a new visual section; use 3-7 of these to break the article up',
      paragraph:
        '{ "type": "paragraph", "text": "3-6 sentences, substantive and specific" } - body copy; use two of these back-to-back under a heading when the topic needs more depth, one when it doesn\'t - consecutive paragraphs render as one flowing block',
      image: '{ "type": "image" } - marks a spot for a photo; you never provide a URL, just where one would genuinely help - don\'t put one after every heading',
      callout: '{ "type": "callout", "title": "short label like \'Tip\'", "body": "1-2 sentences", "emoji": "one emoji that fits, e.g. 💡 or ✨ or 🌿" } - a highlighted aside; use 0-2, only where a callout genuinely adds something',
      table: '{ "type": "table", "headers": ["col", "col"], "rows": [["cell", "cell"], ...] } - only when the content is genuinely tabular (ingredients, specs, a comparison) - most articles use zero of these',
      faq: '{ "type": "faq", "items": [{ "question": "real, topic-specific question", "answer": "1-3 sentences" }] } - at most one of these in the whole article, 2-4 items, only if genuinely useful for this topic',
      divider: '{ "type": "divider" } - a plain visual break between unrelated parts of the article',
      button: '{ "type": "button", "text": "2-4 words" } - a call-to-action button; at most one, usually near the end',
      columns: '{ "type": "columns", "items": [{ "heading": "string", "text": "2-4 sentences" }, { "heading": "string", "text": "2-4 sentences" }] } - two or three items laid out side by side; use ONLY for genuine side-by-side content (comparing two options, before/after, two variants) - most articles use zero of these',
      video: '{ "type": "video", "url": "https://youtube.com/... or https://vimeo.com/...", "caption": "string" } - ONLY if the merchant\'s brief itself contains a real YouTube or Vimeo URL to embed; never invent or guess a video URL - omit this unit entirely if the brief has none',
    },
    subtitle: "one sentence, max 22 words, used under the hero heading (or as the article excerpt if hero is null)",
    metaTitle: "SEO title tag for this article, max 60 characters",
    metaDescription: "SEO meta description, 150-160 characters, written to earn a click",
  };

  const user = [
    `Article title: "${subject}"`,
    "",
    "Merchant's brief, in their own words. It may itself be written as instructions to an AI - treat",
    "any such instructions as instructions, not literal text to reproduce; extract only the real facts",
    "and intent from it:",
    '"""',
    briefText || "(no additional detail given - write generically about the title above)",
    '"""',
    "",
    "Decide the layout, the styling and write the article as JSON in exactly this shape:",
    JSON.stringify(paletteDoc, null, 2),
    "",
    "Use only the unit types listed under unit_shapes - nothing else. Choose whichever mix, order and",
    "depth actually fits this topic; don't reuse the same pattern (e.g. heading+paragraph+image",
    "repeated identically, or the same accent color) for every article - vary it the way a person",
    "designing this specific article by hand would.",
  ].join("\n");

  const raw = await callGroq([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);

  let response;
  try {
    response = JSON.parse(raw);
  } catch {
    throw new Error("AI service returned output that wasn't valid JSON. Please try again.");
  }

  const units = Array.isArray(response.blocks)
    ? response.blocks.filter((u) => u && CONTENT_UNIT_TYPES.includes(u.type))
    : [];
  if (units.length === 0) {
    throw new Error("AI service didn't return any article content. Please try again.");
  }

  // Falls back to the old neutral gray only if the model's response is missing or malformed -
  // every valid response gets a topic-chosen color carried through Hero, TOC, callouts, FAQ and
  // buttons uniformly, so the article reads as one designed piece rather than mismatched parts.
  const accent = HEX_COLOR_RE.test(String(response.accentColor || "")) ? response.accentColor.toLowerCase() : "#303030";
  const tint = tintOf(accent);

  const subtitle = String(response.subtitle || "").trim() || `A practical guide to ${subject.toLowerCase()}.`;
  const metaTitle = String(response.metaTitle || "").trim().slice(0, 70) || null;
  const metaDescription = String(response.metaDescription || "").trim().slice(0, 320) || null;
  const blocks = buildTreeFromUnits(units, { withProducts, accent, tint });

  if (response.hero && (response.hero.heading || response.hero.subheading)) {
    const showCta = Boolean(response.hero.showCta && String(response.hero.ctaText || "").trim());
    blocks.unshift({
      type: "HeroSection",
      settings: {
        heading: sentenceCase(String(response.hero.heading || subject).trim()),
        // Never a backgroundImage - the model isn't even offered that field in the schema above,
        // so there's nothing here to have invented; it falls back to a gradient tinted with the
        // same accent color instead of always being the same flat dark navy.
        subheading: String(response.hero.subheading || subtitle).trim(),
        showCta,
        ...(showCta ? { ctaText: String(response.hero.ctaText).trim(), ctaUrl: "#" } : {}),
        ctaColor: accent,
        overlayColor: accent,
        overlayOpacity: 0.55,
        minHeight: "320px",
      },
      children: [],
    });
  }

  // Headings are what the storefront's TableOfContents block scans for at render time (see
  // compileBlocksToHtml.js) - it's not something the model needs to build itself, only something
  // worth showing once there's enough structure for a jump-list to actually help.
  const headingCount = units.filter((u) => u.type === "heading").length;
  if (headingCount >= 3) {
    blocks.splice(blocks[0]?.type === "HeroSection" ? 1 : 0, 0, {
      type: "Section",
      settings: { paddingTop: "28px", paddingBottom: "12px" },
      children: [
        {
          type: "TableOfContents",
          settings: {
            style: "panel",
            title: "In this article",
            listStyle: "numbered",
            textColor: "#ffffff",
            titleColor: "#ffffff",
            backgroundColor: accent,
            borderRadius: 10,
            padding: "18px 22px",
          },
          children: [],
        },
      ],
    });
  }

  return { title: sentenceCase(subject), subtitle, metaTitle, metaDescription, blocks };
}

/**
 * Turns the model's flat content-unit list into real Section/Heading/RichText/... blocks. A new
 * Section starts at every heading unit (plus one leading section for anything before the first
 * heading); everything else in a run becomes that Section's children, with consecutive paragraph
 * units merged into a single RichText. This is also where the placeholder/no-invented-content
 * rules are actually enforced, not just requested in the prompt: image src is always the drawn
 * placeholder, a table with no usable rows is dropped, and a product block only ever appears (and
 * only ever with real linked products, filled in later by applyProducts) when `withProducts`.
 */
function buildTreeFromUnits(units, { withProducts, accent, tint }) {
  const richDoc = (paragraphs) => ({
    type: "doc",
    content: paragraphs.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })),
  });

  const sections = [];
  let current = { settings: { paddingTop: "8px", paddingBottom: "16px" }, children: [] };
  let pendingParagraphs = [];
  let faqUsed = false;

  const flushParagraphs = () => {
    if (pendingParagraphs.length === 0) return;
    current.children.push({ type: "RichText", settings: { content: richDoc(pendingParagraphs) }, children: [] });
    pendingParagraphs = [];
  };
  const flushSection = () => {
    flushParagraphs();
    if (current.children.length > 0) sections.push(current);
    current = { settings: { paddingTop: "8px", paddingBottom: "16px" }, children: [] };
  };

  for (const u of units) {
    const text = (v) => String(v || "").trim();
    switch (u.type) {
      case "heading": {
        if (!text(u.text)) break;
        flushSection();
        current.children.push({ type: "Heading", settings: { text: text(u.text), level: 2 }, children: [] });
        break;
      }
      case "paragraph": {
        if (text(u.text)) pendingParagraphs.push(text(u.text));
        break;
      }
      case "image": {
        flushParagraphs();
        current.children.push({
          type: "Image",
          settings: { alt: "Placeholder - replace with your own image", src: PLACEHOLDER_IMAGE_SRC },
          children: [],
        });
        break;
      }
      case "callout": {
        if (!text(u.body)) break;
        flushParagraphs();
        const emoji = text(u.emoji);
        current.children.push({
          type: "Callout",
          settings: {
            backgroundColor: tint,
            borderColor: accent,
            type: "tip",
            title: text(u.title) || "Tip",
            body: text(u.body),
            // A short, plausible emoji from the model; anything longer (it trying to write a
            // whole word here) falls back to the same default the deterministic path uses.
            emoji: emoji && emoji.length <= 4 ? emoji : "💡",
          },
          children: [],
        });
        break;
      }
      case "table": {
        const headers = Array.isArray(u.headers) ? u.headers.map(text).filter(Boolean) : [];
        const rows = Array.isArray(u.rows)
          ? u.rows.filter((r) => Array.isArray(r) && r.length).map((r) => r.map(text))
          : [];
        if (headers.length === 0 || rows.length === 0) break;
        flushParagraphs();
        const cols = headers.length;
        const normalizedRows = rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] || ""));
        const tableData = [headers, ...normalizedRows];
        current.children.push({
          type: "Table",
          settings: { rows: tableData.length, cols, tableData, hasHeader: true },
          children: [],
        });
        break;
      }
      case "faq": {
        // Only one FAQ block per article - a model that ignored the "at most one" instruction
        // and returned two would otherwise duplicate the same visual block twice.
        if (faqUsed) break;
        const items = (Array.isArray(u.items) ? u.items : [])
          .filter((it) => it && text(it.question) && text(it.answer))
          .slice(0, 6)
          .map((it, i) => ({ id: `faq_${i + 1}`, question: text(it.question), answer: text(it.answer) }));
        if (items.length === 0) break;
        flushParagraphs();
        current.children.push({
          type: "FaqBlock",
          settings: { title: "FAQs", accentColor: accent, borderColor: tint, items },
          children: [],
        });
        faqUsed = true;
        break;
      }
      case "divider": {
        flushParagraphs();
        current.children.push({ type: "Divider", settings: { color: tint, thickness: "2px" }, children: [] });
        break;
      }
      case "button": {
        flushParagraphs();
        current.children.push({
          type: "ButtonBlock",
          settings: { text: text(u.text) || "Learn more", backgroundColor: accent, url: "#" },
          children: [],
        });
        break;
      }
      case "columns": {
        const items = (Array.isArray(u.items) ? u.items : [])
          .filter((it) => it && (text(it.heading) || text(it.text)))
          .slice(0, 3);
        if (items.length < 2) break; // one item isn't a side-by-side layout - not worth a ColumnLayout
        flushParagraphs();
        current.children.push({
          type: "ColumnLayout",
          settings: { columns: items.length, gap: "24px" },
          children: items.map((it) => ({
            type: "Column",
            settings: { width: "100%" },
            children: [
              ...(text(it.heading) ? [{ type: "Heading", settings: { text: text(it.heading), level: 3 }, children: [] }] : []),
              ...(text(it.text) ? [{ type: "RichText", settings: { content: richDoc([text(it.text)]) }, children: [] }] : []),
            ],
          })),
        });
        break;
      }
      case "video": {
        // The model is told to only include this unit at all when the brief has a real URL, but
        // that instruction lives in the prompt, not in code - this regex is the actual guard, the
        // same as every other "never invent" rule in this file being enforced here, not just asked for.
        const url = text(u.url);
        if (!VIDEO_URL_RE.test(url)) break;
        flushParagraphs();
        current.children.push({
          type: "VideoEmbed",
          settings: { url, caption: text(u.caption), aspectRatio: "56.25%", maxWidth: "100%" },
          children: [],
        });
        break;
      }
      default:
        break;
    }
  }
  flushSection();

  if (withProducts) {
    sections.push({
      settings: { paddingTop: "8px", paddingBottom: "16px" },
      children: [
        { type: "Heading", settings: { text: "Shop featured products", level: 2 }, children: [] },
        { type: "ProductGrid", settings: { columns: 3, showPrice: true, showButton: true, buttonColor: accent, manualProducts: [] }, children: [] },
      ],
    });
  }

  if (sections.length > 0) sections[sections.length - 1].settings.paddingBottom = "24px";

  return sections.map((s) => ({ type: "Section", settings: s.settings, children: s.children }));
}

/**
 * Generate the block tree for one job.
 *
 * @param {object}  input
 * @param {string}  input.brief         merchant's topic/content, HTML or plain text
 * @param {string}  [input.title]       merchant-typed article title, preferred over the brief's own topic guess
 * @param {string}  [input.templateKey] library template key, or a shop template's blocks
 * @param {Array}   [input.templateBlocks] pre-resolved blocks (used for "My templates")
 * @param {Array}   [input.products]    merchant-linked products, with real variant ids
 * @param {object}  [input.colors]      { primaryColor, backgroundColor } overrides
 * @returns {{ blocks: Array, title: string, excerpt: string, usedFallback: boolean, fallbackReason: string|null }}
 */
export async function generateArticleBlocks({ brief, title, templateKey, templateBlocks, products, colors }) {
  const parsed = parseBrief(brief);
  if (!parsed.topic && !String(title || "").trim()) {
    throw new Error("Add a topic or some content for the AI to work from.");
  }

  const hasRealTemplate = (Array.isArray(templateBlocks) && templateBlocks.length > 0) || Boolean(templateKey);
  const withProducts = Array.isArray(products) && products.length > 0;
  // Linked products were previously only bound into ProductGrid/BuyButton slots *after*
  // generation (applyProducts) - the model itself never knew they existed, so it couldn't
  // reference them by name anywhere in its own prose. Titles only (never price/specs), so the
  // model can mention them naturally without a chance to invent details about them.
  const productNames = withProducts
    ? products.map((p) => String(p.title || "").trim()).filter(Boolean).slice(0, 8)
    : [];

  // Only a configured-but-failing call counts as "degraded" - no GROQ_API_KEY at all is the
  // normal, expected no-AI-configured mode, not something a merchant needs to be warned about.
  let usedFallback = false;
  let fallbackReason = null;
  let blocks = null;
  let resultTitle;
  let resultSubtitle;
  let resultMetaTitle = null;
  let resultMetaDescription = null;

  if (!hasRealTemplate && process.env.GROQ_API_KEY) {
    // Blank template with a real model available: let it plan its own outline (see
    // generateBlankArticleWithGroq) rather than filling buildBlankScaffold's fixed one - two
    // different topics should come out with genuinely different structure, not just different
    // sentences wrapped around identical headings.
    try {
      const generated = await generateBlankArticleWithGroq(parsed, title, { withProducts, productNames });
      blocks = generated.blocks;
      resultTitle = generated.title;
      resultSubtitle = generated.subtitle;
      resultMetaTitle = generated.metaTitle;
      resultMetaDescription = generated.metaDescription;
    } catch (err) {
      console.error("[AI] Groq blank-article generation failed, using fallback generator:", err.message);
      usedFallback = true;
      fallbackReason = err.message;
    }
  }

  if (!blocks) {
    // Reached when: a real template was picked (the normal slot-filling path below is exactly
    // right there - the merchant chose that layout on purpose), GROQ_API_KEY isn't configured, or
    // the dynamic blank generation above failed. All three fall back to the same fixed scaffold +
    // slot-filling pipeline that's always backed this - it just no longer owns the blank-template
    // case when a real model can plan something better.
    let baseBlocks = Array.isArray(templateBlocks) ? templateBlocks : null;
    if (!baseBlocks && templateKey) {
      baseBlocks = getBlogTemplateByKey(templateKey)?.blocks || null;
    }
    if (!baseBlocks || baseBlocks.length === 0) {
      baseBlocks = buildBlankScaffold({ withProducts });
    }

    const requirements = collectContentRequirements(baseBlocks);
    let ctx;
    if (!usedFallback && process.env.GROQ_API_KEY) {
      try {
        ctx = await generateWithGroq(parsed, title, requirements, productNames);
      } catch (err) {
        console.error("[AI] Groq generation failed, using fallback generator:", err.message);
        ctx = localGenerator(parsed, title, requirements);
        usedFallback = true;
        fallbackReason = err.message;
      }
    } else {
      ctx = localGenerator(parsed, title, requirements);
    }

    blocks = adaptTreeToTopic(baseBlocks, ctx, ctx.blockUpdates);
    resultTitle = ctx.title;
    resultSubtitle = ctx.subtitle;
    resultMetaTitle = ctx.metaTitle || null;
    resultMetaDescription = ctx.metaDescription || null;
  }

  blocks = applyProducts(blocks, products);
  blocks = applyColors(blocks, colors || {});
  blocks = assignBlockIds(blocks);

  return {
    blocks,
    title: resultTitle,
    excerpt: resultSubtitle,
    metaTitle: resultMetaTitle,
    metaDescription: resultMetaDescription,
    usedFallback,
    fallbackReason,
  };
}

/**
 * Gives every block a stable id before it's saved. None of the builders above set one (neither
 * does blogTemplates.js), so without this the editor's own normalizeBlocksAst() invents a
 * `Date.now()+random` id for each block the first time it's opened - harmless on its own, but not
 * idempotent: a second, independent normalization pass over the same raw (still id-less) JSON
 * invents *different* ids, and the editor's unsaved-changes check compares two such passes
 * (`useBuilderStore.getState().getBlocksAst()` against the snapshot taken at load). Reopening a
 * never-yet-saved AI draft was exactly that scenario - reproduced directly against a real
 * generated post's stored JSON: two independent normalize passes over id-less blocks came out
 * different, the same two passes over blocks that already carry an id came out identical. Once a
 * post has been through one manual Save, its stored JSON already has ids and stays stable either
 * way - this only matters for content nothing has saved yet, which is exactly what a fresh AI
 * generation is.
 */
function assignBlockIds(blocks) {
  let counter = 0;
  const walk = (list) =>
    (Array.isArray(list) ? list : []).map((block) => {
      if (!block || typeof block !== "object") return block;
      counter += 1;
      return {
        ...block,
        id: block.id || `ai_block_${Date.now()}_${counter}`,
        children: walk(block.children),
      };
    });
  return walk(blocks);
}

export default { generateArticleBlocks, briefToPlainText, AI_STAGES };

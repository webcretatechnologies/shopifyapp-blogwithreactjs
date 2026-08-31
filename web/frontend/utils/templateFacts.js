/**
 * Reads a template's block tree and describes it in merchant language.
 *
 * The gallery used to show a name and a sentence, so two templates that build very
 * different articles ("4 numbered steps + a product grid" vs. "a comparison table and
 * a verdict") looked interchangeable. These facts come from the same tree the editor
 * applies, so they stay true for merchant-saved templates too — nothing to maintain
 * by hand when a template changes.
 */

const walk = (blocks, visit) => {
  (Array.isArray(blocks) ? blocks : []).forEach((block) => {
    if (!block || typeof block !== "object") return;
    visit(block);
    walk(block.children, visit);
  });
};

const richTextWords = (content) => {
  let words = 0;
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "text" && typeof node.text === "string") {
      words += node.text.trim().split(/\s+/).filter(Boolean).length;
    }
    (node.content || []).forEach(visit);
  };
  if (typeof content === "string") {
    words += content.replace(/<[^>]*>/g, " ").trim().split(/\s+/).filter(Boolean).length;
  } else {
    visit(content);
  }
  return words;
};

const isStepHeading = (text) => /^(step\s*\d|\d+[.)]\s)/i.test(String(text || "").trim());

export function getTemplateFacts(blocks) {
  const facts = {
    hero: false,
    toc: false,
    sections: 0,
    headings: 0,
    steps: 0,
    images: 0,
    productBlocks: 0,
    products: 0,
    faqs: 0,
    tables: 0,
    callouts: 0,
    columns: 0,
    richText: 0,
    buttons: 0,
    videos: 0,
    embeds: 0,
    blocks: 0,
    words: 0,
  };

  walk(blocks, (block) => {
    const s = block.settings || {};
    // Layout scaffolding isn't content the merchant edits, so it doesn't count towards "blocks".
    if (!["Section", "Column", "ColumnLayout", "Spacer", "Divider"].includes(block.type)) {
      facts.blocks += 1;
    }
    switch (block.type) {
      case "HeroSection":
        facts.hero = true;
        facts.words += richTextWords(s.heading) + richTextWords(s.subheading);
        break;
      case "TableOfContents":
        facts.toc = true;
        break;
      case "Section":
        facts.sections += 1;
        break;
      case "ColumnLayout":
        facts.columns += 1;
        break;
      case "Heading":
        facts.headings += 1;
        if (isStepHeading(s.text)) facts.steps += 1;
        facts.words += richTextWords(s.text);
        break;
      case "RichText":
        facts.richText += 1;
        facts.words += richTextWords(s.content);
        break;
      case "Image":
        facts.images += 1;
        break;
      // An empty product list means two different things, so it can't take one fallback:
      // a hand-picked block with nothing in it renders nothing (0 slots), while a block
      // bound to a search or collection fills itself at render time and is worth about a
      // row. Counting the estimate in both cases inflated the chip on saved templates
      // whose product blocks were emptied out.
      case "ProductGrid":
      case "ProductSlider": {
        facts.productBlocks += 1;
        const picked = (s.manualProducts || []).length;
        const dynamic = Boolean(s.searchQuery || s.collectionHandle);
        facts.products += picked || (dynamic ? Number(s.columns) || 3 : 0);
        break;
      }
      case "Collection": {
        facts.productBlocks += 1;
        const picked = (s.manualProducts || []).length;
        facts.products += picked || (s.collectionHandle ? Number(s.columns) || 3 : 0);
        break;
      }
      case "BuyButton":
      case "ProductCard":
        facts.productBlocks += 1;
        facts.products += 1;
        break;
      case "ButtonBlock":
        facts.buttons += 1;
        break;
      case "VideoEmbed":
        facts.videos += 1;
        break;
      case "Html":
        facts.embeds += 1;
        break;
      case "FaqBlock":
        facts.faqs += (s.items || []).length;
        break;
      case "Table":
        facts.tables += 1;
        break;
      case "Callout":
        facts.callouts += 1;
        facts.words += richTextWords(s.body);
        break;
      default:
        break;
    }
  });

  return facts;
}

/**
 * Short chips for a gallery card — ordered by how much they tell a merchant apart.
 * Keep the list tight: 3 on a card, up to 5 in a wider layout.
 */
export function getTemplateChips(blocks) {
  const f = getTemplateFacts(blocks);
  const chips = [];
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  if (f.steps >= 2) chips.push(`${f.steps} numbered steps`);
  if (f.tables) chips.push(f.tables > 1 ? `${f.tables} comparison tables` : "Comparison table");
  if (f.faqs) chips.push(plural(f.faqs, "FAQ", "FAQs"));
  if (f.products) chips.push(f.products === 1 ? "1 product block" : `${f.products} product slots`);
  if (f.hero) chips.push("Hero banner");
  if (f.toc) chips.push("Table of contents");
  if (f.columns) chips.push(f.columns > 1 ? `${f.columns} split layouts` : "Split layout");
  if (f.images) chips.push(plural(f.images, "image slot", "image slots"));
  if (f.videos) chips.push(plural(f.videos, "video", "videos"));
  if (f.callouts) chips.push(plural(f.callouts, "callout", "callouts"));
  if (f.buttons) chips.push(plural(f.buttons, "button", "buttons"));
  // Text last: it's in nearly every template, so it's the least distinguishing — but a template
  // built from a TOC, an FAQ and two paragraphs would otherwise say nothing about the paragraphs.
  if (f.richText) chips.push(plural(f.richText, "text block", "text blocks"));
  if (f.embeds) chips.push(plural(f.embeds, "custom embed", "custom embeds"));
  return chips;
}

/**
 * "8 sections to fill in" — the scale of the article the merchant is starting from.
 * Deliberately not a reading time: the copy in a template is placeholder, so minutes
 * would describe the sample text rather than the article the merchant ends up with.
 */
export function getTemplateScale(blocks) {
  const f = getTemplateFacts(blocks);
  const sections = f.sections || f.headings;
  if (sections) return `${sections} section${sections === 1 ? "" : "s"} to fill in`;
  // A template saved straight out of the editor often has no Section wrappers and no headings —
  // it used to report nothing at all. Fall back to the content blocks it does have.
  if (f.blocks) return `${f.blocks} block${f.blocks === 1 ? "" : "s"} to edit`;
  return "";
}

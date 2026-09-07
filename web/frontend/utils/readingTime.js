/**
 * Reading-time helpers for the article editor (mirrors web/src/utils/readingTime.js).
 *
 * Live storefront minutes used to count every token in compiled HTML (TOC links,
 * product titles, Add to Cart, script bodies). The editor only counted typed
 * block copy — so the same post could show "~2 min" here and "4 min" on the blog.
 *
 * Both sides now strip the same non-prose chrome before counting.
 */

export const WORDS_PER_MINUTE = 200;

const NON_PROSE_SELECTORS = [
  "script",
  "style",
  "noscript",
  ".sp-toc-block",
  ".sp-toc-details",
  ".blogger-product-grid",
  ".builder-product-grid",
  ".builder-product-slider",
  ".builder-product-card",
  ".shopify-blog-product-slider",
  '[data-type="TableOfContents"]',
  '[data-type="ProductGrid"]',
  '[data-type="ProductSlider"]',
  '[data-type="Collection"]',
  '[data-type="ProductCard"]',
  '[data-type="BuyButton"]',
].join(", ");

/** Word count from HTML after removing TOC / product chrome / scripts. */
export function countReadableWordsFromHtml(html) {
  if (!html || typeof html !== "string") return 0;

  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll(NON_PROSE_SELECTORS).forEach((el) => el.remove());
    const text = (doc.body?.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
  }

  // SSR / tests without DOMParser — same exclusions via regex approximations.
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<details[^>]*class="[^"]*sp-toc[^"]*"[\s\S]*?<\/details>/gi, " ")
    .replace(/<div[^>]*class="[^"]*sp-toc[^"]*"[\s\S]*?<\/div>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

/** Minutes to read at WORDS_PER_MINUTE. Returns 0 when there is no text. */
export function estimateReadingMinutes(wordCount, wpm = WORDS_PER_MINUTE) {
  if (!wordCount || wordCount < 1) return 0;
  return Math.max(1, Math.round(wordCount / wpm));
}

/** Convenience: HTML → minutes (0 if empty). */
export function estimateReadingMinutesFromHtml(html, wpm = WORDS_PER_MINUTE) {
  return estimateReadingMinutes(countReadableWordsFromHtml(html), wpm);
}

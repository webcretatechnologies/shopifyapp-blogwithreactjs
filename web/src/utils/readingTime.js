/**
 * Reading-time helpers for storefront compile (mirrored in the editor).
 *
 * The live byline used to strip tags from the full compiled HTML and count every
 * leftover token. That inflated minutes vs the editor because published markup
 * also contains:
 *   - Table of Contents links (headings counted a second time)
 *   - Product titles, prices, and "Add to Cart" labels
 *   - <script>/<style> bodies left behind by a naive tag strip
 *
 * We count only article prose — the same idea as the editor's countContentWords().
 */

import * as cheerio from "cheerio";

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
  const $ = cheerio.load(html);
  $(NON_PROSE_SELECTORS).remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
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

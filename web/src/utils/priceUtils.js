/**
 * priceUtils.js (Server-side)
 * Shared currency formatting for backend HTML generation.
 *
 * Uses Intl.NumberFormat (Node.js 14+ has built-in full-icu) to format
 * prices with the correct currency symbol. Falls back to "$X.XX".
 */

/**
 * Format a price amount with the given currency code.
 *
 * @param {number|string} amount             - The numeric price value
 * @param {string}        [currency]         - ISO currency code (USD, EUR, GBP, etc.)
 * @param {Object}        [options]
 * @param {boolean}       [options.stripSymbol] - If true, returns just the number
 * @returns {string} Formatted price like "$19.99" or "€14,50"
 */
export function formatPrice(amount, currency, { stripSymbol = false } = {}) {
  if (amount == null || amount === "") return "";

  const numericAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(numericAmount)) return "";

  if (!currency) {
    const formatted = numericAmount.toFixed(2);
    return stripSymbol ? formatted : `$${formatted}`;
  }

  try {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const formatted = formatter.format(numericAmount);
    return stripSymbol ? formatted.replace(/[^\d.,\-]/g, "") : formatted;
  } catch {
    const formatted = numericAmount.toFixed(2);
    return stripSymbol ? formatted : `${currency.toUpperCase()} ${formatted}`;
  }
}

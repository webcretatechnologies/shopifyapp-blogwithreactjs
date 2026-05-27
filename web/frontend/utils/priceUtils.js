/**
 * priceUtils.js
 * Shared currency formatting for the frontend.
 *
 * Uses Intl.NumberFormat to format prices according to the product's
 * currency code (e.g. USD, EUR, GBP). Falls back to "$X.XX" for
 * unknown/missing currencies.
 */

/**
 * Format a price amount with the given currency code.
 *
 * @param {number|string} amount        - The numeric price value
 * @param {string}        [currency]    - ISO currency code (USD, EUR, GBP, etc.)
 * @param {Object}        [options]
 * @param {boolean}       [options.stripSymbol] - If true, returns just the number
 *                                                 without currency symbol (for inline use)
 * @returns {string} Formatted price like "$19.99" or "€14,50"
 */
export function formatPrice(amount, currency, { stripSymbol = false } = {}) {
  if (amount == null || amount === "") return "";

  const numericAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(numericAmount)) return "";

  // If no currency provided, fall back to simple "$X.XX"
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
    // Fallback for unsupported currency codes
    const formatted = numericAmount.toFixed(2);
    return stripSymbol ? formatted : `${currency.toUpperCase()} ${formatted}`;
  }
}

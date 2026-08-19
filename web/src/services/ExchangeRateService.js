// Converts order amounts in any currency to USD so revenue can be safely summed across shops
// that bill in different currencies (previously PostAnalytic.revenue just added raw numbers
// together regardless of currency — a EUR order and an INR order counted as the same "1 unit").
//
// Uses open.er-api.com's free, no-API-key endpoint (rates update ~once/day). Rates are cached
// in-memory for CACHE_TTL_MS and reused across requests; a failed fetch falls back to the last
// successfully cached rates (or, if nothing has ever loaded, treats the amount as already-USD
// rather than throwing — a missing FX rate must never block order/conversion tracking).
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const RATES_URL = "https://open.er-api.com/v6/latest/USD";

let cachedRates = null; // { USD: 1, EUR: 0.92, INR: 83.1, ... } — units of currency per 1 USD
let cachedAt = 0;
let inFlightFetch = null;

async function fetchRates() {
  const res = await fetch(RATES_URL);
  if (!res.ok) throw new Error(`Exchange rate API returned ${res.status}`);
  const data = await res.json();
  if (data.result !== "success" || !data.rates) throw new Error("Exchange rate API returned an unexpected shape");
  return data.rates;
}

async function getRates() {
  const now = Date.now();
  if (cachedRates && now - cachedAt < CACHE_TTL_MS) return cachedRates;
  if (inFlightFetch) return inFlightFetch;

  inFlightFetch = fetchRates()
    .then((rates) => {
      cachedRates = rates;
      cachedAt = Date.now();
      return rates;
    })
    .catch((err) => {
      console.error("[ExchangeRateService] Failed to fetch live rates:", err.message);
      return cachedRates; // stale-but-known rates beat none; null if we've never had any
    })
    .finally(() => {
      inFlightFetch = null;
    });

  return inFlightFetch;
}

/** Converts `amount` (in `currency`) to USD. Falls back to treating the amount as already-USD
 * when the currency is unknown/missing or no rate data is available — silently degrading rather
 * than losing the revenue figure entirely. */
export async function convertToUsd(amount, currency) {
  const value = Number(amount) || 0;
  const code = (currency || "USD").toUpperCase();
  if (code === "USD") return value;

  const rates = await getRates();
  const rate = rates?.[code];
  if (!rate) {
    console.warn(`[ExchangeRateService] No rate for ${code}; treating ${value} as USD.`);
    return value;
  }
  return value / rate;
}

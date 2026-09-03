/**
 * AnalyticsTrackingService
 * Shared logic for tracking views, events, and aggregating analytics data.
 * Used by the public tracking routes to avoid duplication.
 */
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import geoip from "geoip-lite";
import { convertToUsd } from "./ExchangeRateService.js";

const prisma = new PrismaClient();

// ─── Known bot/crawler user-agent patterns ────────────────────────────────
const BOT_PATTERNS = [
  "bot", "crawler", "spider", "scraper", "curl", "wget", "go-http-client",
  "python-requests", "python-urllib", "java/", "libwww", "httpclient",
  "nutch", "phpcrawl", "msnbot", "slurp", "yandex", "baiduspider",
  "facebookexternalhit", "facebookcatalog", "twitterbot", "rogerbot",
  "linkedinbot", "embedly", "quora link preview", "showyoubot",
  "outbrain", "pinterest", "slack", "vkshare", "w3c_validator",
  "redditbot", "applebot", "whatsapp", "flipboard", "tumblr",
  "bitlybot", "semrush", "ahrefsbot", "dotbot", "majestic",
  "googlebot", "bingbot", "duckduckbot", "slurp", "yandexbot",
  "uptimerobot", "pingdom", "newrelic", "datadog",
];

// ─── Known social/referrer patterns ────────────────────────────────────────
const SOURCE_PATTERNS = [
  { pattern: /google\./, name: "google" },
  { pattern: /facebook\.|fb\.me|meta\./, name: "facebook" },
  { pattern: /twitter\.|x\.com/, name: "twitter" },
  { pattern: /linkedin\./, name: "linkedin" },
  { pattern: /instagram\./, name: "instagram" },
  { pattern: /pinterest\./, name: "pinterest" },
  { pattern: /youtube\./, name: "youtube" },
  { pattern: /reddit\./, name: "reddit" },
  { pattern: /bing\.|yahoo\.|duckduckgo\.|baidu\./i, name: "search" },
  { pattern: /mail\.|outlook\./, name: "email" },
  { pattern: /t\.co|bit\.ly|buff\.ly|tinyurl/i, name: "social" },
];

// ─── Public Methods ───────────────────────────────────────────────────────

/**
 * Check if a user agent belongs to a bot/crawler.
 */
export function isBot(ua) {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return BOT_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Detect device type from user agent string.
 * Returns { desktop: 0|1, mobile: 0|1, tablet: 0|1 }
 */
export function detectDevice(ua) {
  const lower = (ua || "").toLowerCase();
  let desktop = 0, mobile = 0, tablet = 0;
  if (/tablet|ipad|playbook|silk|android(?!.*mobile)/i.test(lower)) {
    tablet = 1;
  } else if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile|wpdesktop/i.test(lower)) {
    mobile = 1;
  } else {
    desktop = 1;
  }
  return { desktop, mobile, tablet };
}

/**
 * Detect traffic source from referer header and shop domain.
 */
export function detectSource(referer, shopDomain = "") {
  if (!referer) return "direct";
  try {
    const refUrl = new URL(referer);
    const hostname = refUrl.hostname.toLowerCase();

    // Internal / same-shop traffic
    if (shopDomain && (hostname === shopDomain || hostname.endsWith("." + shopDomain) || hostname.includes(shopDomain))) {
      return "internal";
    }

    for (const { pattern, name } of SOURCE_PATTERNS) {
      if (pattern.test(hostname)) return name;
    }

    return "other";
  } catch {
    return "other";
  }
}

/**
 * Resolve the visitor's country, in order of accuracy:
 *  1. Cloudflare's `CF-IPCountry` header — only trustworthy for requests that hit our domain
 *     directly (the tracking pixel), since Cloudflare derives it from the TCP connection's real
 *     source IP. Must NOT be used for Shopify App Proxy requests: those arrive from Shopify's
 *     servers, so Cloudflare would report Shopify's data-center location instead of the visitor's.
 *  2. Offline GeoIP lookup (geoip-lite) on the real client IP — used for App Proxy traffic, and
 *     as a fallback everywhere else (e.g. local dev without Cloudflare in front).
 *  3. Accept-Language header guess — last resort when the IP isn't geolocatable (private/local IP).
 */
export function detectCountry(acceptLang, cfCountry = "", ip = "") {
  const cf = (cfCountry || "").toUpperCase();
  if (cf && cf !== "XX" && cf !== "T1") return cf;

  if (ip) {
    try {
      const geo = geoip.lookup(ip);
      if (geo?.country) return geo.country;
    } catch {
      // ignore malformed/unlookupable IPs, fall through to Accept-Language
    }
  }

  if (!acceptLang) return "";
  const match = acceptLang.match(/^[a-z]{2}[-_]([a-z]{2})\b/i);
  return match ? match[1].toUpperCase() : "";
}

/**
 * Generate a stable visitor hash from IP + user agent.
 */
export function hashVisitor(ip, ua) {
  const raw = `${ip || ""}|${(ua || "").substring(0, 60)}`;
  return crypto.createHash("sha256").update(raw).digest("hex").substring(0, 16);
}

/**
 * Resolve "today" as a UTC-midnight Date matching the shop's local calendar day, so daily
 * buckets (stored/compared as @db.Date) line up with the merchant's own timezone instead of
 * the server process's — a merchant far from the server would otherwise see views attributed
 * to the wrong day, worst near midnight/DST boundaries. Falls back to UTC when a shop has no
 * timezone set.
 */
export function getShopLocalDateUtc(timezone) {
  if (!timezone) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    return new Date(Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day)));
  } catch {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
}

/**
 * Validate an event's optional value/currency before it reaches trackEvent — bounds a forged
 * `value` from inflating reported revenue, and restricts `currency` to a real ISO 4217 shape.
 * Shared by both public event-ingest surfaces (tracking.js's /track/event, proxy.js's
 * /api/proxy/event) so the same rule applies everywhere revenue can be reported.
 */
export function validateEventValue(value, currency) {
  if (value != null) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
      return "Invalid value";
    }
  }
  if (currency != null && !/^[A-Z]{3}$/.test(String(currency).toUpperCase())) {
    return "Invalid currency";
  }
  return null;
}

/**
 * Generate a short tracking key for a post.
 * Uses a random 8-character hex string.
 */
export function generateTrackingKey() {
  return crypto.randomBytes(4).toString("hex");
}

/**
 * Ensure a post has a tracking key. Returns the key.
 */
export async function ensureTrackingKey(postId) {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, trackingKey: true },
  });
  if (!post) return null;
  if (post.trackingKey) return post.trackingKey;

  const key = generateTrackingKey();
  await prisma.post.update({
    where: { id: postId },
    data: { trackingKey: key },
  });
  return key;
}

/**
 * Resolve a post ID from a tracking key.
 */
export async function resolveTrackingKey(key) {
  const post = await prisma.post.findUnique({
    where: { trackingKey: key },
    select: { id: true, shopId: true },
  });
  return post || null;
}

/**
 * Track a view for a post.
 * Increments daily PostAnalytic counters.
 */
export async function trackView({
  postId,
  shopDomain = "",
  shopTimezone = "",
  userAgent = "",
  referer = "",
  acceptLang = "",
  cfCountry = "",
  ip = "",
  visitorHash = "",
}) {
  const today = getShopLocalDateUtc(shopTimezone);

  const device = detectDevice(userAgent);
  const source = detectSource(referer, shopDomain);
  const country = detectCountry(acceptLang, cfCountry, ip);

  // Deduplicate unique visitors via a persistent table (AnalyticsVisitor), not an in-process
  // Map — a Map resets on every restart/deploy and isn't shared across horizontally-scaled
  // instances, silently inflating "unique visitors". Insert-and-catch-P2002 is the same
  // race-safe pattern used below for PostAnalytic itself.
  const visitorId = visitorHash || hashVisitor(ip, userAgent);
  let isNewVisitor = true;
  try {
    await prisma.analyticsVisitor.create({
      data: { postId, date: today, visitorHash: visitorId },
    });
  } catch (err) {
    if (err.code === "P2002") {
      isNewVisitor = false;
    } else {
      throw err;
    }
  }

  // Atomic write: find → create → catch(P2002 race) → update
  // Prisma's upsert generates a fresh INSERT on every retry under MySQL concurrency,
  // causing P2002 to repeat indefinitely. This pattern is race-condition safe.
  let analytic = await prisma.postAnalytic.findUnique({
    where: { postId_date: { postId, date: today } },
  });

  if (analytic) {
    analytic = await prisma.postAnalytic.update({
      where: { id: analytic.id },
      data: {
        views: { increment: 1 },
        ...(isNewVisitor ? { uniqueVisitors: { increment: 1 } } : {}),
        deviceDesktop: { increment: device.desktop },
        deviceMobile: { increment: device.mobile },
        deviceTablet: { increment: device.tablet },
      },
    });
  } else {
    try {
      analytic = await prisma.postAnalytic.create({
        data: {
          postId,
          date: today,
          views: 1,
          uniqueVisitors: isNewVisitor ? 1 : 0,
          deviceDesktop: device.desktop,
          deviceMobile: device.mobile,
          deviceTablet: device.tablet,
        },
      });
    } catch (createError) {
      if (createError.code === "P2002") {
        // Race condition: a concurrent request created the row between our findUnique and create — update it now
        console.warn("[Proxy] View create race condition (P2002) — falling through to update");
        analytic = await prisma.postAnalytic.update({
          where: { postId_date: { postId, date: today } },
          data: {
            views: { increment: 1 },
            ...(isNewVisitor ? { uniqueVisitors: { increment: 1 } } : {}),
            deviceDesktop: { increment: device.desktop },
            deviceMobile: { increment: device.mobile },
            deviceTablet: { increment: device.tablet },
          },
        });
      } else {
        throw createError;
      }
    }
  }

  // Update sources JSON
  const currentSources = parseJsonField(analytic.sources);
  currentSources[source] = (currentSources[source] || 0) + 1;

  // Update countries JSON
  const updateData = { sources: currentSources };
  if (country) {
    const currentCountries = parseJsonField(analytic.countries);
    currentCountries[country] = (currentCountries[country] || 0) + 1;
    updateData.countries = currentCountries;
  }

  await prisma.postAnalytic.update({
    where: { id: analytic.id },
    data: updateData,
  });

  return { success: true, isNewVisitor };
}

/**
 * Track a custom event (add_to_cart, checkout, conversion) for a post.
 */
export async function trackEvent({
  postId,
  eventType,
  shopTimezone = "",
  userAgent = "",
  referer = "",
  ip = "",
  productId = null,
  variantId = null,
  value = null,
  currency = null,
}) {
  const today = getShopLocalDateUtc(shopTimezone);

  const validEvents = ["add_to_cart", "checkout", "conversion", "cta_click", "product_click"];
  if (!validEvents.includes(eventType)) {
    return { success: false, error: `Unknown event type: ${eventType}` };
  }

  // Determine the field to increment
  const fieldMap = {
    add_to_cart: "addToCart",
    checkout: "checkouts",
    conversion: "conversions",
  };

  const incrementField = fieldMap[eventType];
  const rawValue = eventType === "conversion" && value != null ? parseFloat(value) || 0 : 0;
  // Converted once per event, before either the create or update branch below, so a concurrent
  // P2002 retry doesn't re-fetch a rate or double-convert the same order.
  const usdValue = eventType === "conversion" && value != null ? await convertToUsd(rawValue, currency) : 0;

  // Atomic write: find → create → catch(P2002 race) → update
  let analytic = await prisma.postAnalytic.findUnique({
    where: { postId_date: { postId, date: today } },
  });

  if (analytic) {
    analytic = await prisma.postAnalytic.update({
      where: { id: analytic.id },
      data: {
        ...(incrementField ? { [incrementField]: { increment: 1 } } : {}),
        ...(eventType === "conversion" && value != null
          ? { revenue: { increment: rawValue }, revenueUsd: { increment: usdValue }, lastCurrency: (currency || "USD").toUpperCase() }
          : {}),
      },
    });
  } else {
    try {
      analytic = await prisma.postAnalytic.create({
        data: {
          postId,
          date: today,
          ...(incrementField ? { [incrementField]: 1 } : {}),
          ...(eventType === "conversion" && value != null
            ? { revenue: rawValue, revenueUsd: usdValue, lastCurrency: (currency || "USD").toUpperCase() }
            : {}),
        },
      });
    } catch (createError) {
      if (createError.code === "P2002") {
        // Race condition: a concurrent request created the row — update it now
        console.warn("[Proxy] Event create race condition (P2002) — falling through to update");
        analytic = await prisma.postAnalytic.update({
          where: { postId_date: { postId, date: today } },
          data: {
            ...(incrementField ? { [incrementField]: { increment: 1 } } : {}),
            ...(eventType === "conversion" && value != null
              ? { revenue: { increment: rawValue }, revenueUsd: { increment: usdValue }, lastCurrency: (currency || "USD").toUpperCase() }
              : {}),
          },
        });
      } else {
        throw createError;
      }
    }
  }

  // NOTE: this used to also write an `${eventType}_${source}` key (e.g. "checkout_direct")
  // into the same `sources` JSON field trackView() uses for pure referrer tracking (google,
  // direct, internal, ...). The Traffic Sources widget aggregates every key in `sources`
  // indiscriminately, so those event-tagged entries were showing up as if they were referrer
  // sources ("add_to_cart_other", "checkout_direct" appearing next to "Internal" in the UI) —
  // and nothing in the frontend ever consumed them as their own breakdown, so they served no
  // purpose beyond corrupting that widget. Removed rather than given a separate field, since
  // there's no current use case asking "which referrer converts best" — this event's referer
  // is still available via `referer` above if that's wanted later.
  //
  // This also removes a second bug: the two writes (counter increment above, sources update
  // below) were non-atomic separate DB calls — if anything interrupted between them (a server
  // restart mid-request, a race), the funnel counter and the sources total could silently drift
  // apart, exactly what surfaced as a mismatch (checkouts=2 vs checkout_direct=3) in production.

  return { success: true };
}

// Upper bound on any single query's span — a pathological custom range (or a malformed request)
// shouldn't be able to force a zero-fill loop / DB scan across tens of thousands of days.
const MAX_RANGE_DAYS = 366;

/**
 * Normalizes either the legacy `days` count (a plain number — dashboard.jsx's simpler selector
 * still uses this, unchanged) or an explicit `{ from, to }` date range (ISO date strings — the
 * Analytics page's calendar/preset picker) into a single internal shape:
 *   - since: inclusive lower bound (UTC midnight of the first included day)
 *   - until: EXCLUSIVE upper bound (UTC midnight of the day AFTER the last included day)
 *   - spanDays: number of calendar days covered (until - since, in days)
 * Falls back to the 30-day default on any invalid input rather than throwing — a bad query param
 * should degrade gracefully, not 500.
 */
export function resolveRange(rangeOrDays) {
  if (rangeOrDays && typeof rangeOrDays === "object" && rangeOrDays.from && rangeOrDays.to) {
    const fromDate = new Date(`${rangeOrDays.from}T00:00:00.000Z`);
    const toDate = new Date(`${rangeOrDays.to}T00:00:00.000Z`);
    if (!isNaN(fromDate) && !isNaN(toDate) && fromDate <= toDate) {
      const rawSpanDays = Math.round((toDate - fromDate) / (24 * 60 * 60 * 1000)) + 1; // inclusive of both ends
      const spanDays = Math.min(rawSpanDays, MAX_RANGE_DAYS);
      const until = new Date(fromDate.getTime() + spanDays * 24 * 60 * 60 * 1000);
      return { since: fromDate, until, spanDays };
    }
    // Invalid range — fall through to the 30-day default below.
  }
  const days = Math.min(Math.max(Number(rangeOrDays) || 30, 1), MAX_RANGE_DAYS);
  // Preserves the exact pre-existing days-based behavior: since anchored to "now" (not midnight),
  // spanDays = days+1 so the zero-fill loop produces the same days+1 entries it always has.
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const spanDays = days + 1;
  const until = new Date(since.getTime() + spanDays * 24 * 60 * 60 * 1000);
  return { since, until, spanDays };
}

/**
 * Shared aggregation core for both getShopAnalytics (all of a shop's posts) and
 * getPostAnalytics (one post) — identical daily zero-fill, device/source/country totals,
 * funnel, rates, and trend logic; only the `postWhere` filter (and whether top-posts ranking
 * runs, which only makes sense shop-wide) differs between the two call sites.
 */
// Exported for Super Admin's platform-wide analytics (superAdminAnalytics.js), which calls this
// with postWhere = {} (no shopId filter) to get the exact same aggregation shape across every
// shop at once — no shop-specific assumption is baked into this function beyond postWhere itself.
export async function buildAnalyticsPayload(postWhere, range) {
  const { since, until, spanDays } = range;
  // Immediately-preceding window of equal length, used to compute period-over-period trends
  // and the comparison-overlay series.
  const previousSince = new Date(since.getTime() - spanDays * 24 * 60 * 60 * 1000);

  const [recentAnalytics, allAnalytics, previousAnalytics] = await Promise.all([
    // Recent analytics (selected range)
    prisma.postAnalytic.findMany({
      where: { ...postWhere, date: { gte: since, lt: until } },
      orderBy: { date: "asc" },
    }),
    // Aggregates for device/source/country (selected range)
    prisma.postAnalytic.findMany({
      where: { ...postWhere, date: { gte: since, lt: until } },
      select: {
        uniqueVisitors: true,
        deviceDesktop: true,
        deviceMobile: true,
        deviceTablet: true,
        views: true,
        addToCart: true,
        checkouts: true,
        conversions: true,
        revenue: true,
        revenueUsd: true,
        sources: true,
        countries: true,
      },
    }),
    // Same-length prior window, for trend comparison + the comparison-overlay series
    prisma.postAnalytic.findMany({
      where: { ...postWhere, date: { gte: previousSince, lt: since } },
      select: { date: true, views: true, addToCart: true, conversions: true, revenue: true, revenueUsd: true },
    }),
  ]);

  // ── Aggregate daily time series ──────────────────────────────────
  // Zero-fill every calendar day in the window, not just days that have a PostAnalytic row —
  // a sparse series (e.g. only 3 real data points across a 30-day window) renders a smoothed
  // line chart that visually implies a trend between distant points that doesn't exist.
  // `revenue` stays each row's raw (possibly mixed-currency) amount, unchanged behavior for
  // existing per-shop callers. `revenueUsd` is the currency-safe figure — cross-shop callers
  // (Platform Analytics) must sum this one, never `revenue`, since shops can bill in different
  // currencies.
  const zeroDay = () => ({ views: 0, uniqueVisitors: 0, addToCart: 0, checkouts: 0, conversions: 0, revenue: 0, revenueUsd: 0 });

  const dailyMap = {};
  // Fixed iteration count (spanDays) rather than comparing against a live `new Date()` on each
  // loop check — the latter is nondeterministic (can silently gain an extra bucket if the wall
  // clock ticks past a day boundary mid-loop) and, critically, must produce exactly the same
  // length as previousDaily below for the chart overlay to align point-for-point.
  for (let i = 0; i < spanDays; i++) {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    dailyMap[d.toISOString().split("T")[0]] = zeroDay();
  }
  recentAnalytics.forEach((a) => {
    const dateKey = a.date.toISOString().split("T")[0];
    if (!dailyMap[dateKey]) dailyMap[dateKey] = zeroDay();
    dailyMap[dateKey].views += a.views || 0;
    dailyMap[dateKey].uniqueVisitors += a.uniqueVisitors || 0;
    dailyMap[dateKey].addToCart += a.addToCart || 0;
    dailyMap[dateKey].checkouts += a.checkouts || 0;
    dailyMap[dateKey].conversions += a.conversions || 0;
    dailyMap[dateKey].revenue += a.revenue || 0;
    dailyMap[dateKey].revenueUsd += a.revenueUsd || 0;
  });
  const daily = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, ...d }));

  // Previous-period daily series, zero-filled the same way but indexed by day OFFSET rather
  // than calendar date — the comparison overlay compares "day N of this period" against
  // "day N of last period" positionally, not by matching real dates.
  const prevDailyMap = {};
  for (let i = 0; i < spanDays; i++) {
    const d = new Date(previousSince);
    d.setUTCDate(d.getUTCDate() + i);
    prevDailyMap[d.toISOString().split("T")[0]] = zeroDay();
  }
  previousAnalytics.forEach((a) => {
    const dateKey = a.date.toISOString().split("T")[0];
    if (!prevDailyMap[dateKey]) prevDailyMap[dateKey] = zeroDay();
    prevDailyMap[dateKey].views += a.views || 0;
    prevDailyMap[dateKey].addToCart += a.addToCart || 0;
    prevDailyMap[dateKey].conversions += a.conversions || 0;
    prevDailyMap[dateKey].revenue += a.revenue || 0;
    prevDailyMap[dateKey].revenueUsd += a.revenueUsd || 0;
  });
  const previousDaily = Object.entries(prevDailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, ...d }));

  // ── Aggregate all-time totals ─────────────────────────────────────
  const totals = {
    totalViews: 0,
    totalUniqueVisitors: 0,
    totalAddToCart: 0,
    totalCheckouts: 0,
    totalConversions: 0,
    totalRevenue: 0,
    totalRevenueUsd: 0,
    deviceDesktop: 0,
    deviceMobile: 0,
    deviceTablet: 0,
    totalSources: {},
    totalCountries: {},
  };

  allAnalytics.forEach((a) => {
    totals.totalViews += a.views || 0;
    totals.totalUniqueVisitors += a.uniqueVisitors || 0;
    totals.totalAddToCart += a.addToCart || 0;
    totals.totalCheckouts += a.checkouts || 0;
    totals.totalConversions += a.conversions || 0;
    totals.totalRevenue += a.revenue || 0;
    totals.totalRevenueUsd += a.revenueUsd || 0;
    totals.deviceDesktop += a.deviceDesktop || 0;
    totals.deviceMobile += a.deviceMobile || 0;
    totals.deviceTablet += a.deviceTablet || 0;

    try {
      const srcs = parseJsonField(a.sources);
      for (const [key, val] of Object.entries(srcs)) {
        totals.totalSources[key] = (totals.totalSources[key] || 0) + val;
      }
    } catch { /* ignore */ }

    try {
      const cntrs = parseJsonField(a.countries);
      for (const [key, val] of Object.entries(cntrs)) {
        totals.totalCountries[key] = (totals.totalCountries[key] || 0) + val;
      }
    } catch { /* ignore */ }
  });

  // ── Sort sources and countries ────────────────────────────────────
  const sortedSources = Object.entries(totals.totalSources)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }));

  const sortedCountries = Object.entries(totals.totalCountries)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([code, count]) => ({ code, count }));

  // ── Build funnel ──────────────────────────────────────────────────
  const totalViews = totals.totalViews;
  const totalAddToCart = totals.totalAddToCart;
  const totalCheckouts = totals.totalCheckouts;
  const totalConversions = totals.totalConversions;

  const funnel = [
    { stage: "Views", count: totalViews },
    { stage: "Add to Cart", count: totalAddToCart },
    { stage: "Checkout", count: totalCheckouts },
    { stage: "Conversions", count: totalConversions },
  ];

  // ── Rates ─────────────────────────────────────────────────────────
  const addToCartRate = totalViews > 0 ? ((totalAddToCart / totalViews) * 100).toFixed(2) : "0.00";
  const checkoutRate = totalViews > 0 ? ((totalCheckouts / totalViews) * 100).toFixed(2) : "0.00";
  const conversionRate = totalViews > 0 ? ((totalConversions / totalViews) * 100).toFixed(2) : "0.00";

  // ── Period-over-period trends ──────────────────────────────────────
  const prevTotals = previousAnalytics.reduce(
    (acc, a) => {
      acc.views += a.views || 0;
      acc.conversions += a.conversions || 0;
      acc.revenue += a.revenue || 0;
      return acc;
    },
    { views: 0, conversions: 0, revenue: 0 }
  );
  const prevConversionRate = prevTotals.views > 0 ? (prevTotals.conversions / prevTotals.views) * 100 : 0;
  const currentConversionRate = parseFloat(conversionRate);

  // Only report a trend when both windows have data — a % change against an
  // empty baseline (or from zero activity) reads as noise on the dashboard.
  const pctChange = (current, previous) => {
    if (current <= 0 || previous <= 0) return null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
  };

  const trends = {
    views: pctChange(totalViews, prevTotals.views),
    revenue: pctChange(totals.totalRevenue, prevTotals.revenue),
    conversionRate: pctChange(currentConversionRate, prevConversionRate),
  };

  return {
    stats: {
      totalViews,
      totalUniqueVisitors: totals.totalUniqueVisitors,
      totalAddToCart,
      totalCheckouts,
      totalConversions,
      totalRevenue: totals.totalRevenue,
      totalRevenueUsd: totals.totalRevenueUsd,
      addToCartRate,
      checkoutRate,
      conversionRate,
    },
    daily,
    previousDaily,
    deviceBreakdown: {
      desktop: totals.deviceDesktop,
      mobile: totals.deviceMobile,
      tablet: totals.deviceTablet,
    },
    topSources: sortedSources,
    topCountries: sortedCountries,
    funnel,
    trends,
    days: spanDays,
    from: since.toISOString().split("T")[0],
    to: new Date(until.getTime() - 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  };
}

/**
 * Get comprehensive analytics for a shop, aggregated across all posts.
 * `rangeOrDays` is either a plain number of days (legacy — dashboard.jsx) or an explicit
 * `{ from, to }` ISO date range (the Analytics page's calendar/preset picker).
 */
export async function getShopAnalytics(shopId, rangeOrDays = 30) {
  const range = resolveRange(rangeOrDays);
  const { since, until } = range;

  const [totalPosts, published, drafts, payload, topPostsGrouped] = await Promise.all([
    prisma.post.count({ where: { shopId } }),
    prisma.post.count({ where: { shopId, status: "published" } }),
    prisma.post.count({ where: { shopId, status: "draft" } }),
    buildAnalyticsPayload({ post: { shopId } }, range),
    // Top posts by views (selected range)
    prisma.postAnalytic.groupBy({
      by: ["postId"],
      where: { post: { shopId }, date: { gte: since, lt: until } },
      _sum: { views: true, addToCart: true, checkouts: true, conversions: true, revenue: true },
      orderBy: { _sum: { views: "desc" } },
      take: 10,
    }),
  ]);

  // ── Enrich top posts ──────────────────────────────────────────────
  const topPostIds = topPostsGrouped.map((t) => t.postId);
  const topPostDetails = await prisma.post.findMany({
    where: { id: { in: topPostIds }, shopId },
    select: { id: true, title: true, slug: true, featuredImage: true, status: true },
  });

  const topPosts = topPostsGrouped.map((t) => {
    const detail = topPostDetails.find((p) => p.id === t.postId) || {};
    const sum = t._sum;
    const views = sum.views || 0;
    return {
      id: t.postId,
      title: detail.title || "Unknown",
      slug: detail.slug || "",
      featuredImage: detail.featuredImage || null,
      status: detail.status,
      views,
      uniqueVisitors: sum.uniqueVisitors || 0,
      addToCart: sum.addToCart || 0,
      checkouts: sum.checkouts || 0,
      conversions: sum.conversions || 0,
      revenue: sum.revenue || 0,
      addToCartRate: views > 0 ? ((sum.addToCart || 0) / views * 100).toFixed(2) : "0.00",
      conversionRate: views > 0 ? ((sum.conversions || 0) / views * 100).toFixed(2) : "0.00",
    };
  });

  return {
    ...payload,
    stats: { totalPosts, published, drafts, ...payload.stats },
    topPosts,
  };
}

/**
 * Get analytics for a single post — same shape as getShopAnalytics minus totalPosts/
 * published/drafts/topPosts (shop-wide-only concepts). Caller (the /:id/analytics route) is
 * responsible for verifying the post belongs to shopId before calling this.
 */
export async function getPostAnalytics(postId, shopId, rangeOrDays = 30) {
  return buildAnalyticsPayload({ postId, post: { shopId } }, resolveRange(rangeOrDays));
}

// ─── Featured-product extraction (blog-driven purchase attribution) ────────

const PRODUCT_ID_KEYS = ["shopifyProductId", "productId"];

function numericIdFromAny(raw) {
  if (raw == null) return null;
  const match = String(raw).match(/\d+$/);
  return match ? match[0] : null;
}

/**
 * Walks a post's contentJson looking for ProductSlider/ProductGrid/ProductCard/BuyButton blocks
 * and returns the numeric Shopify product IDs and variant IDs of every product actually featured
 * in the post — i.e. what "this purchase specifically came from the blog post" should mean, not
 * just "happened within some time window of viewing it".
 *
 * Collection blocks are deliberately NOT included — they fetch their product list LIVE from
 * Shopify on every render (see EditorContentCompiler.renderCollection), so there's no fixed set
 * of products to check without an extra live API call per event. A purchase driven purely by a
 * live Collection block therefore won't be product-matched; this is a known, accepted gap rather
 * than an oversight.
 */
export function extractFeaturedProductRefs(contentJson) {
  const productIds = new Set();
  const variantIds = new Set();

  const visitProductList = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach((p) => {
      for (const key of PRODUCT_ID_KEYS) {
        const pid = numericIdFromAny(p?.[key]);
        if (pid) productIds.add(pid);
      }
      const vid = numericIdFromAny(p?.variantId);
      if (vid) variantIds.add(vid);
    });
  };

  const walk = (blocks) => {
    if (!Array.isArray(blocks)) return;
    blocks.forEach((b) => {
      if (!b || typeof b !== "object") return;
      const s = b.settings || {};
      if (["ProductSlider", "ProductGrid", "ProductCard"].includes(b.type)) {
        visitProductList(s.manualProducts);
        // ProductCard stores a single product directly on settings, not in a manualProducts array.
        if (b.type === "ProductCard") visitProductList([s]);
      } else if (b.type === "BuyButton") {
        visitProductList([s.product || s]);
      }
      if (Array.isArray(b.children)) walk(b.children);
    });
  };

  walk(contentJson);
  return { productIds: [...productIds], variantIds: [...variantIds] };
}

// ─── Helper ──────────────────────────────────────────────────────────────

function parseJsonField(field) {
  if (!field) return {};
  if (field instanceof Buffer) {
    try { return JSON.parse(field.toString()); } catch { return {}; }
  }
  if (typeof field === "string") {
    try { return JSON.parse(field); } catch { return {}; }
  }
  if (typeof field === "object") return field;
  return {};
}

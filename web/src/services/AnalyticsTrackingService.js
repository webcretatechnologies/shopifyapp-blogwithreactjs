/**
 * AnalyticsTrackingService
 * Shared logic for tracking views, events, and aggregating analytics data.
 * Used by the public tracking routes to avoid duplication.
 */
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

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
 * Extract country code from Accept-Language header (rough estimation).
 */
export function detectCountry(acceptLang) {
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
  userAgent = "",
  referer = "",
  acceptLang = "",
  ip = "",
  visitorHash = "",
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const device = detectDevice(userAgent);
  const source = detectSource(referer, shopDomain);
  const country = detectCountry(acceptLang);

  // Deduplicate unique visitors in-memory (per process)
  const dateStr = today.toISOString().split("T")[0];
  const dedupKey = `${postId}:${dateStr}:${visitorHash}`;
  const isNewVisitor = !global.__trackedVisitors?.has(dedupKey);
  if (!global.__trackedVisitors) global.__trackedVisitors = new Map();
  if (global.__trackedVisitors.size > 50000) global.__trackedVisitors = new Map();
  global.__trackedVisitors.set(dedupKey, Date.now());

  // Upsert daily analytic record
  const analytic = await prisma.postAnalytic.upsert({
    where: { postId_date: { postId, date: today } },
    update: {
      views: { increment: 1 },
      ...(isNewVisitor ? { uniqueVisitors: { increment: 1 } } : {}),
      deviceDesktop: { increment: device.desktop },
      deviceMobile: { increment: device.mobile },
      deviceTablet: { increment: device.tablet },
    },
    create: {
      postId,
      date: today,
      views: 1,
      uniqueVisitors: 1,
      deviceDesktop: device.desktop,
      deviceMobile: device.mobile,
      deviceTablet: device.tablet,
    },
  });

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
  userAgent = "",
  referer = "",
  ip = "",
  productId = null,
  variantId = null,
  value = null,
  currency = null,
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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

  // Upsert daily analytic record (create if doesn't exist for this post/date)
  const analytic = await prisma.postAnalytic.upsert({
    where: { postId_date: { postId, date: today } },
    update: {
      ...(incrementField ? { [incrementField]: { increment: 1 } } : {}),
      ...(eventType === "conversion" && value != null ? { revenue: { increment: parseFloat(value) || 0 } } : {}),
    },
    create: {
      postId,
      date: today,
      ...(incrementField ? { [incrementField]: 1 } : {}),
      ...(eventType === "conversion" && value != null ? { revenue: parseFloat(value) || 0 } : {}),
    },
  });

  // Update sources JSON with event context
  const source = detectSource(referer);
  const currentSources = parseJsonField(analytic.sources);
  currentSources[`${eventType}_${source}`] = (currentSources[`${eventType}_${source}`] || 0) + 1;

  await prisma.postAnalytic.update({
    where: { id: analytic.id },
    data: { sources: currentSources },
  });

  return { success: true };
}

/**
 * Get comprehensive analytics for a shop, aggregated across all posts.
 */
export async function getShopAnalytics(shopId, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [totalPosts, published, drafts, recentAnalytics, topPostsGrouped, allAnalytics] = await Promise.all([
    prisma.post.count({ where: { shopId } }),
    prisma.post.count({ where: { shopId, status: "published" } }),
    prisma.post.count({ where: { shopId, status: "draft" } }),
    // Recent analytics (last N days)
    prisma.postAnalytic.findMany({
      where: {
        post: { shopId },
        date: { gte: since },
      },
      orderBy: { date: "asc" },
      include: { post: { select: { title: true, slug: true, featuredImage: true } } },
    }),
    // Top posts by total views (all time)
    prisma.postAnalytic.groupBy({
      by: ["postId"],
      where: { post: { shopId } },
      _sum: { views: true, addToCart: true, checkouts: true, conversions: true, revenue: true },
      orderBy: { _sum: { views: "desc" } },
      take: 10,
    }),
    // All-time aggregates for device/source/country
    prisma.postAnalytic.findMany({
      where: { post: { shopId } },
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
        sources: true,
        countries: true,
      },
    }),
  ]);

  // ── Aggregate daily time series ──────────────────────────────────
  const dailyMap = {};
  const dailyBreakdown = {};

  recentAnalytics.forEach((a) => {
    const dateKey = a.date.toISOString().split("T")[0];
    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = { views: 0, uniqueVisitors: 0, addToCart: 0, checkouts: 0, conversions: 0, revenue: 0 };
    }
    dailyMap[dateKey].views += a.views || 0;
    dailyMap[dateKey].uniqueVisitors += a.uniqueVisitors || 0;
    dailyMap[dateKey].addToCart += a.addToCart || 0;
    dailyMap[dateKey].checkouts += a.checkouts || 0;
    dailyMap[dateKey].conversions += a.conversions || 0;
    dailyMap[dateKey].revenue += a.revenue || 0;
  });

  const daily = Object.entries(dailyMap)
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

  return {
    stats: {
      totalPosts,
      published,
      drafts,
      totalViews,
      totalUniqueVisitors: totals.totalUniqueVisitors,
      totalAddToCart,
      totalCheckouts,
      totalConversions,
      totalRevenue: totals.totalRevenue,
      addToCartRate,
      checkoutRate,
      conversionRate,
    },
    daily,
    topPosts,
    deviceBreakdown: {
      desktop: totals.deviceDesktop,
      mobile: totals.deviceMobile,
      tablet: totals.deviceTablet,
    },
    topSources: sortedSources,
    topCountries: sortedCountries,
    funnel,
  };
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

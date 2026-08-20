import express from "express";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import {
  isBot,
  trackView,
  trackEvent,
  hashVisitor,
  validateEventValue,
  extractFeaturedProductRefs,
} from "../services/AnalyticsTrackingService.js";

const router = express.Router();
const prisma = new PrismaClient();

// Same soft in-memory abuse guard as tracking.js's /track/event, keyed by (ip, postId) since
// this proxy path is authenticated by Shopify's App Proxy signature rather than a tracking key.
const EVENT_RATE_LIMIT = 20;
const EVENT_RATE_WINDOW_MS = 60 * 1000;
const eventRateMap = new Map();
function isRateLimited(ip, key) {
  const rateKey = `${ip}:${key}`;
  const now = Date.now();
  const entry = eventRateMap.get(rateKey);
  if (!entry || now - entry.windowStart > EVENT_RATE_WINDOW_MS) {
    eventRateMap.set(rateKey, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > EVENT_RATE_LIMIT;
}

// Middleware to verify Shopify App Proxy Signature
function verifyProxySignature(req, res, next) {
  const { signature, ...queryVars } = req.query;
  
  if (!signature) {
    return res.status(401).send("Missing signature");
  }

  // Sort query parameters alphabetically by key
  const sortedQuery = Object.keys(queryVars)
    .sort()
    .map((key) => {
      const value = queryVars[key];
      return `${key}=${Array.isArray(value) ? value.join(",") : value}`;
    })
    .join("");

  const apiSecret = process.env.SHOPIFY_API_SECRET;
  const computedSignature = crypto
    .createHmac("sha256", apiSecret)
    .update(sortedQuery)
    .digest("hex");

  if (computedSignature !== signature) {
    return res.status(401).send("Invalid signature");
  }

  // Inject shop into req
  req.shopDomain = req.query.shop;
  next();
}

// ─── Resolve Shopify Article ID to Internal Post ID ───────────────────────
async function resolvePostIdByShopifyId(shopifyArticleId) {
  const sa = await prisma.shopifyArticle.findFirst({
    where: { shopifyArticleId: String(shopifyArticleId) },
    select: { postId: true }
  });
  return sa ? sa.postId : null;
}

// ─── POST /api/proxy/resolve — Resolve a Shopify article to its internal post ─────────────
// Non-counting: used by the theme app-embed tracker to attribute funnel events (add_to_cart/
// checkout/conversion) to a post WITHOUT also incrementing a view — that's the article-embedded
// pixel's job (ArticleSyncService.js). Both mechanisms used to independently call trackView() for
// the same real page load, double-counting every view when a merchant had the app embed enabled.
router.post("/resolve", express.json(), verifyProxySignature, async (req, res) => {
  try {
    const { shopifyArticleId } = req.body;
    if (!shopifyArticleId) return res.status(400).json({ error: "Missing article ID" });

    const postId = await resolvePostIdByShopifyId(shopifyArticleId);
    if (!postId) return res.status(404).json({ error: "Post not synced" });

    // Product/variant IDs actually featured in this post — lets tracker.js (and the
    // ORDERS_CREATE/CHECKOUTS_CREATE webhooks server-side) restrict attribution to purchases that
    // genuinely involve something shown in the post, not just "happened while the time-window
    // attribution was still active". See extractFeaturedProductRefs's own docblock for the one
    // known gap (live Collection blocks aren't included).
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { contentJson: true } });
    const { productIds, variantIds } = extractFeaturedProductRefs(post?.contentJson);

    res.json({ success: true, postId, productIds, variantIds });
  } catch (err) {
    console.error("[Proxy] Resolve error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /api/proxy/view — Track Page Views ──────────────────────────────
// Kept for backward compatibility with any already-cached copy of the theme extension's
// tracker.js asset; the current tracker.js no longer calls this (see /resolve above).
router.post("/view", express.json(), verifyProxySignature, async (req, res) => {
  try {
    const { shopifyArticleId, userAgent, referer, visitorHash } = req.body;

    if (!shopifyArticleId) return res.status(400).json({ error: "Missing article ID" });

    const postId = await resolvePostIdByShopifyId(shopifyArticleId);
    if (!postId) return res.status(404).json({ error: "Post not synced" });

    const ua = userAgent || req.headers["user-agent"] || "";
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    const acceptLang = req.headers["accept-language"] || "";

    if (isBot(ua)) return res.json({ success: true, bot: true });

    const shop = await prisma.shop.findUnique({ where: { domain: req.shopDomain }, select: { timezone: true } });

    await trackView({
      postId,
      shopDomain: req.shopDomain,
      shopTimezone: shop?.timezone || "",
      userAgent: ua,
      referer,
      acceptLang,
      ip,
      visitorHash
    });

    res.json({ success: true, postId });
  } catch (err) {
    console.error("[Proxy] View tracking error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /api/proxy/event — Track Funnel Events ──────────────────────────
router.post("/event", express.json(), verifyProxySignature, async (req, res) => {
  try {
    const { postId: rawPostId, eventType, productId, value, currency } = req.body;
    const postId = parseInt(rawPostId, 10);

    if (!postId || isNaN(postId) || !eventType) {
      return res.status(400).json({ error: "Missing or invalid required fields" });
    }

    const ua = req.headers["user-agent"] || "";
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    const referer = req.headers["referer"] || req.headers["referrer"] || "";

    if (isRateLimited(ip, postId)) {
      return res.status(429).json({ error: "Too many events" });
    }

    const valueError = validateEventValue(value, currency);
    if (valueError) {
      return res.status(400).json({ error: valueError });
    }

    const post = await prisma.post.findUnique({ where: { id: postId }, select: { shopId: true } });
    const shop = post ? await prisma.shop.findUnique({ where: { id: post.shopId }, select: { timezone: true } }) : null;

    await trackEvent({
      postId,
      eventType,
      shopTimezone: shop?.timezone || "",
      userAgent: ua,
      referer,
      ip,
      productId: productId ? parseInt(productId, 10) : null,
      value,
      currency
    });

    res.json({ success: true });
  } catch (err) {
    console.error("[Proxy] Event tracking error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;

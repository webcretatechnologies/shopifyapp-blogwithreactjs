import express from "express";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import {
  isBot,
  trackView,
  trackEvent,
  hashVisitor,
} from "../services/AnalyticsTrackingService.js";

const router = express.Router();
const prisma = new PrismaClient();

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

// ─── POST /api/proxy/view — Track Page Views ──────────────────────────────
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

    await trackView({
      postId,
      shopDomain: req.shopDomain,
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
    const { postId, eventType, productId, value, currency } = req.body;
    
    if (!postId || !eventType) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const ua = req.headers["user-agent"] || "";
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    const referer = req.headers["referer"] || req.headers["referrer"] || "";

    await trackEvent({
      postId,
      eventType,
      userAgent: ua,
      referer,
      ip,
      productId,
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

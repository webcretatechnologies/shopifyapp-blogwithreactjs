/**
 * Tracking Routes (PUBLIC — no session auth required)
 *
 * These endpoints are accessed from Shopify storefronts (cross-domain).
 * They must be mounted BEFORE any Shopify session validation middleware.
 *
 * Endpoints:
 *   GET  /track/view.gif   —  1x1 transparent pixel for counting views
 *   POST /track/event      —  Rich event tracking (add_to_cart, checkout, conversion)
 *   GET  /track/event.gif  —  Image-based fallback for events
 *   GET  /track/pixel.gif  —  Legacy pixel alias
 */
import express from "express";
import { PrismaClient } from "@prisma/client";
import {
  isBot,
  trackView,
  trackEvent,
  resolveTrackingKey,
  hashVisitor,
  detectDevice,
  detectSource,
  detectCountry,
} from "../services/AnalyticsTrackingService.js";

const router = express.Router();

// ─── 1x1 transparent GIF (base64-encoded) ────────────────────────────────
const TRANSPARENT_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// ─── CORS headers (allow all origins) ────────────────────────────────────
function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

// ─── No-cache headers ────────────────────────────────────────────────────
function setNoCacheHeaders(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

// ─── Shared tracking handler ─────────────────────────────────────────────
async function handleViewTracking(req, res) {
  setCorsHeaders(res);
  setNoCacheHeaders(res);

  const key = req.query.k || req.query.key || "";
  const shop = req.query.shop || "";
  const ref = req.query.ref || req.headers["referer"] || req.headers["referrer"] || "";
  const sid = req.query.sid || "";

  const ua = req.headers["user-agent"] || "";
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const acceptLang = req.headers["accept-language"] || "";

  // Bot detection — don't count
  if (isBot(ua)) {
    return sendPixel(res);
  }

  // Resolve post from tracking key
  if (key) {
    const post = await resolveTrackingKey(key);
    if (post) {
      const visitorHash = sid || hashVisitor(ip, ua);
      await trackView({
        postId: post.id,
        shopDomain: shop || "",
        userAgent: ua,
        referer: ref,
        acceptLang,
        ip,
        visitorHash,
      });
    }
  }

  sendPixel(res);
}

function sendPixel(res) {
  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Content-Length", String(TRANSPARENT_PIXEL.length));
  res.status(200).end(TRANSPARENT_PIXEL);
}

// ─── OPTIONS (CORS preflight) ────────────────────────────────────────────
router.options("/view.gif", (req, res) => {
  setCorsHeaders(res);
  res.status(204).end();
});

router.options("/event", (req, res) => {
  setCorsHeaders(res);
  res.status(204).end();
});

router.options("/event.gif", (req, res) => {
  setCorsHeaders(res);
  res.status(204).end();
});

// ─── GET /track/view.gif — View tracking pixel ───────────────────────────
router.get("/view.gif", async (req, res) => {
  try {
    await handleViewTracking(req, res);
  } catch (err) {
    console.error("[Tracking] view.gif error:", err);
    sendPixel(res);
  }
});

// ─── GET /track/pixel.gif — Legacy alias ─────────────────────────────────
router.get("/pixel.gif", async (req, res) => {
  try {
    await handleViewTracking(req, res);
  } catch (err) {
    console.error("[Tracking] pixel.gif error:", err);
    sendPixel(res);
  }
});

// ─── POST /track/event — Rich event tracking ────────────────────────────
router.post("/event", express.json(), async (req, res) => {
  setCorsHeaders(res);

  try {
    const {
      k,            // tracking key
      event,        // event type
      productId,    // optional
      variantId,    // optional
      value,        // optional (for conversions)
      currency,     // optional
      shop,         // optional shop domain
      ref,          // optional referer
      sid,          // optional session id
    } = req.body;

    const ua = req.headers["user-agent"] || "";
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    const referer = ref || req.headers["referer"] || req.headers["referrer"] || "";

    // Resolve post from tracking key
    if (!k) {
      return res.status(400).json({ error: "Missing tracking key (k)" });
    }

    const validEvents = ["add_to_cart", "checkout", "conversion", "cta_click", "product_click"];
    if (!event || !validEvents.includes(event)) {
      return res.status(400).json({ error: `Invalid event type. Must be one of: ${validEvents.join(", ")}` });
    }

    const post = await resolveTrackingKey(k);
    if (!post) {
      return res.status(404).json({ error: "Post not found for tracking key" });
    }

    await trackEvent({
      postId: post.id,
      eventType: event,
      userAgent: ua,
      referer,
      ip,
      productId: productId || null,
      variantId: variantId || null,
      value: value || null,
      currency: currency || null,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("[Tracking] event error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── GET /track/event.gif — Image-based event tracking fallback ──────────
router.get("/event.gif", async (req, res) => {
  setCorsHeaders(res);
  setNoCacheHeaders(res);

  try {
    const key = req.query.k || "";
    const eventType = req.query.event || "";
    const productId = req.query.pid || null;
    const variantId = req.query.vid || null;
    const value = req.query.val || null;
    const shop = req.query.shop || "";
    const ref = req.query.ref || req.headers["referer"] || "";

    const ua = req.headers["user-agent"] || "";
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();

    if (key && eventType) {
      const post = await resolveTrackingKey(key);
      if (post && !isBot(ua)) {
        await trackEvent({
          postId: post.id,
          eventType,
          userAgent: ua,
          referer: ref,
          ip,
          productId,
          variantId,
          value: value || null,
          currency: null,
        });
      }
    }
  } catch (err) {
    console.error("[Tracking] event.gif error:", err);
  }

  sendPixel(res);
});

export default router;

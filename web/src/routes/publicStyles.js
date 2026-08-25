/**
 * Public Styles Route (PUBLIC — no session auth required)
 *
 * Serves the shop's Blog Article Layout width as a plain CSS file, so every article's compiled
 * HTML can link to ONE always-current stylesheet instead of having that value baked in
 * statically at sync time. This is what makes changing the layout setting apply to every post
 * instantly, including posts that are never re-synced.
 *
 * Deliberately scoped to layout width, brand color CSS variables (for sidebar accents), and
 * byline visibility — font is NOT served here; it is baked in at each article's own sync time
 * (see EditorContentCompiler.generateGlobalCss's docblock).
 *
 * Accessed cross-domain from Shopify storefronts, so it must be mounted BEFORE any Shopify
 * session validation middleware — same placement/requirement as tracking.js.
 *
 *   GET /styles.css?shop=<shop-domain>
 */
import express from "express";
import { prisma } from "../../shopify.js";
import { EditorContentCompiler } from "../services/EditorContentCompiler.js";

const router = express.Router();

// ─── Abuse guard ──────────────────────────────────────────────────────────
// Public endpoint backed by a DB read — short in-process cache bounds how often that happens
// per shop, independent of the browser's own Cache-Control behavior below.
const CACHE_TTL_MS = 15 * 1000;
const cssCache = new Map(); // shopDomain -> { css, expiresAt }

router.get("/", async (req, res) => {
  res.setHeader("Content-Type", "text/css; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=15");

  const shopDomain = String(req.query.shop || "").trim();
  if (!shopDomain) {
    res.status(400).send("/* missing ?shop= parameter */");
    return;
  }

  const cached = cssCache.get(shopDomain);
  if (cached && cached.expiresAt > Date.now()) {
    res.send(cached.css);
    return;
  }

  try {
    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
      include: { settings: true },
    });

    let settings = {};
    if (shop?.settings) {
      settings = shop.settings.reduce((acc, setting) => {
        let val = setting.value;
        if (val === "true") val = true;
        else if (val === "false") val = false;
        acc[setting.key] = val;
        return acc;
      }, {});
    }

    const { listingLayoutForPlan } = await import("../services/ListingLayoutMetafield.js");
    settings.blogListingLayout = listingLayoutForPlan(shop?.planKey, settings.blogListingLayout);
    const css = EditorContentCompiler.generateLayoutCss(settings, { important: true });
    cssCache.set(shopDomain, { css, expiresAt: Date.now() + CACHE_TTL_MS });
    res.send(css);
  } catch (err) {
    console.error("GET /styles.css error:", err);
    res.status(500).send("/* error generating styles */");
  }
});

export default router;

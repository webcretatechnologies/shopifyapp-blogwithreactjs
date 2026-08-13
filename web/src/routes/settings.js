import express from "express";
import shopify, { prisma } from "../../shopify.js";
import ThemeStyleService from "../services/ThemeStyleService.js";

const router = express.Router();

// /sitemap-index.xml is served by THIS app's own server (see src/routes/sitemapIndex.js), not by
// the shop's storefront domain — same reasoning/pattern as EditorContentCompiler.js's APP_URL.
const APP_URL = process.env.HOST || process.env.APP_URL || `https://${process.env.SHOPIFY_APP_HOST || "localhost:3000"}`;

// GET /api/settings/meta-robots-status was removed — superseded by the consolidated
// GET /api/shop/setup-status (src/services/ThemeEmbedStatusService.js), which reads the same
// theme asset once for both the analytics-tracker and meta-robots embeds instead of each having
// its own separate round trip.

// GET /api/settings/theme-style-tokens — real colors/font read from the shop's main theme,
// for the Settings page's "Sync from theme" action. Read-only, never writes anything.
router.get("/theme-style-tokens", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const tokens = await ThemeStyleService.fetchThemeStyleTokens(shopify, session);
    res.json(tokens);
  } catch (err) {
    console.error("GET /api/settings/theme-style-tokens error:", err);
    res.status(500).json({ error: "Couldn't read colors from your theme. Please try again." });
  }
});

// GET /api/settings/sitemap-status — powers the Settings > Sitemap & Indexing tab's post table.
router.get("/sitemap-status", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session || !session.shop) return res.status(401).json({ error: "Unauthorized" });

    const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
    if (!shop) return res.status(404).json({ error: "Shop not found" });

    const posts = await prisma.post.findMany({
      where: { shopId: shop.id, status: "published" },
      select: {
        id: true,
        title: true,
        metaRobotsNoindex: true,
        excludeFromSitemap: true,
        metaDescription: true,
        shopifyArticle: { select: { syncedAt: true, shopifyArticleId: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    res.json({
      shopDomain: shop.domain,
      sitemapUrl: `${APP_URL}/sitemap-index.xml?shop=${encodeURIComponent(shop.domain)}`,
      posts: posts.map((p) => ({
        id: p.id,
        title: p.title,
        inSitemap: !p.metaRobotsNoindex && !p.excludeFromSitemap,
        noindex: p.metaRobotsNoindex,
        hasMetaDescription: !!(p.metaDescription && p.metaDescription.trim()),
        synced: !!p.shopifyArticle?.shopifyArticleId,
        syncedAt: p.shopifyArticle?.syncedAt || null,
      })),
    });
  } catch (error) {
    console.error("GET /api/settings/sitemap-status error:", error);
    res.status(500).json({ error: "Failed to fetch sitemap status" });
  }
});

// Get all settings for the shop
router.get("/", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session || !session.shop) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const shop = await prisma.shop.findUnique({
      where: { domain: session.shop },
      include: { settings: true },
    });

    if (!shop) {
      return res.status(404).json({ error: "Shop not found" });
    }

    // Convert settings array [{ key: 'primaryColor', value: '#008060' }] to object { primaryColor: '#008060' }
    // Parse booleans correctly for frontend Polaris components
    const settingsObject = shop.settings.reduce((acc, setting) => {
      let val = setting.value;
      if (val === "true") val = true;
      else if (val === "false") val = false;
      acc[setting.key] = val;
      return acc;
    }, {});

    res.json({ settings: settingsObject });
  } catch (error) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// Update settings
router.post("/", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session || !session.shop) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const shop = await prisma.shop.findUnique({
      where: { domain: session.shop },
    });

    if (!shop) {
      return res.status(404).json({ error: "Shop not found" });
    }

    const supportedKeys = [
      "primaryColor",
      "secondaryColor",
      "textColor",
      "buttonRadius",
      "blogLayout",
      "showReadingTime",
      "showAuthor",
      "showPublishedDate",
      "showRelatedPosts",
      "relatedPostsCount",
      "defaultAuthor",
      "customHeaderCode",
      "customFooterCode"
    ];

    // Upsert all modified setting parameters
    for (const key of supportedKeys) {
      if (req.body[key] !== undefined) {
        const valStr = String(req.body[key]);
        await prisma.shopSetting.upsert({
          where: {
            shopId_key: {
              shopId: shop.id,
              key,
            },
          },
          update: { value: valStr },
          create: {
            shopId: shop.id,
            key,
            value: valStr,
          },
        });
      }
    }

    // Branding/layout/toggle settings and custom header/footer code are applied
    // per-article at publish time (see EditorContentCompiler.compileForStorefront),
    // not written into the merchant's theme — apps aren't permitted to make direct
    // theme code changes (Shopify App Store requirement 5.1.1).
    res.json({ success: true });
  } catch (error) {
    console.error("Error saving settings:", error);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

export default router;

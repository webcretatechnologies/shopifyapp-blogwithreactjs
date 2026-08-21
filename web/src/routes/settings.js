import express from "express";
import shopify, { prisma } from "../../shopify.js";
import ThemeStyleService from "../services/ThemeStyleService.js";
import { isFeatureEnabled } from "../services/PlanFeatureService.js";
import { ArticleSyncService } from "../services/ArticleSyncService.js";

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

    const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
    if (!isFeatureEnabled(shop?.planKey, "theme_style_sync")) {
      return res.status(403).json({ error: "Syncing colors from your theme is available on Starter and above. Please upgrade to use this feature." });
    }

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
      "blogLayoutCustomWidth",
      "showReadingTime",
      "showAuthor",
      "showPublishedDate",
      "showRelatedPosts",
      "relatedPostsCount",
      "relatedPostsLayout",
      "relatedPostsSourceMode",
      "blogSidebarEnabled",
      "blogSidebarPosition",
      "blogSidebarWidth",
      "blogSidebarWidgets",
      "defaultAuthor",
      "customHeaderCode",
      "customFooterCode",
      "showPoweredByBadge"
    ];

    const RELATED_LAYOUTS = new Set(["grid", "list", "slider"]);
    const RELATED_MODES = new Set(["smart", "category", "random", "manual"]);
    const SIDEBAR_POSITIONS = new Set(["right", "left"]);

    const customCodeAllowed = isFeatureEnabled(shop.planKey, "custom_code_injection");
    // remove_branding (Starter+) is what lets a shop remove the "Powered by" badge at all — a
    // Free shop's preference here would be inert anyway (ArticleSyncService.js's badge-injection
    // logic always shows the badge when the shop isn't entitled, regardless of this setting), but
    // skipping the save keeps the same defense-in-depth posture as the custom code fields above
    // rather than leaving a stray, never-consulted value sitting in the DB.
    const removeBrandingAllowed = isFeatureEnabled(shop.planKey, "remove_branding");

    // Validate custom width BEFORE any upserts. Checking inside the loop let earlier keys
    // (colors, radius, blogLayout) commit, then 422 — UI stayed dirty while DB/CSS already
    // changed, and blogLayout could become "custom" with no valid stored width.
    if (String(req.body.blogLayout ?? "") === "custom") {
      const n = parseInt(String(req.body.blogLayoutCustomWidth ?? ""), 10);
      if (!Number.isFinite(n) || n < 320 || n > 2400) {
        return res.status(422).json({
          error: "Custom width must be a whole number between 320 and 2400 pixels.",
        });
      }
    }

    if (req.body.relatedPostsLayout !== undefined) {
      const layout = String(req.body.relatedPostsLayout).toLowerCase();
      if (!RELATED_LAYOUTS.has(layout)) {
        return res.status(422).json({ error: "Related posts layout must be grid, list, or slider." });
      }
      req.body.relatedPostsLayout = layout;
    }

    if (req.body.relatedPostsSourceMode !== undefined) {
      const mode = String(req.body.relatedPostsSourceMode).toLowerCase();
      if (!RELATED_MODES.has(mode)) {
        return res.status(422).json({ error: "Related posts source must be smart, category, random, or manual." });
      }
      req.body.relatedPostsSourceMode = mode;
    }

    if (req.body.relatedPostsCount !== undefined) {
      const n = parseInt(String(req.body.relatedPostsCount), 10);
      if (![2, 3, 4, 6, 8, 12].includes(n)) {
        return res.status(422).json({ error: "Related posts count must be 2, 3, 4, 6, 8, or 12." });
      }
    }

    if (req.body.blogSidebarPosition !== undefined) {
      const pos = String(req.body.blogSidebarPosition).toLowerCase();
      if (!SIDEBAR_POSITIONS.has(pos)) {
        return res.status(422).json({ error: "Sidebar position must be left or right." });
      }
      req.body.blogSidebarPosition = pos;
    }

    if (req.body.blogSidebarWidth !== undefined) {
      const w = parseInt(String(req.body.blogSidebarWidth), 10);
      if (!Number.isFinite(w) || w < 240 || w > 420) {
        return res.status(422).json({ error: "Sidebar width must be between 240 and 420 pixels." });
      }
      req.body.blogSidebarWidth = String(w);
    }

    const sidebarAllowed = isFeatureEnabled(shop.planKey, "blog_sidebar");

    // Upsert all modified setting parameters
    for (const key of supportedKeys) {
      // Custom header/footer code injection is Pro-only — silently skip the save rather than
      // reject the whole settings form, same posture as the SEO field sanitization in posts.js.
      if ((key === "customHeaderCode" || key === "customFooterCode") && !customCodeAllowed) continue;
      if (key === "showPoweredByBadge" && !removeBrandingAllowed) continue;
      if (
        (key === "blogSidebarEnabled" ||
          key === "blogSidebarPosition" ||
          key === "blogSidebarWidth" ||
          key === "blogSidebarWidgets") &&
        !sidebarAllowed
      ) {
        continue;
      }
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

/**
 * Re-push published (linked) posts so the sidebar layout shell exists in body_html.
 * Live widget content still updates without this; the aside placeholder itself needs a sync.
 */
router.post("/apply-sidebar-layout", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session?.shop) return res.status(401).json({ error: "Unauthorized" });

    const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
    if (!shop) return res.status(404).json({ error: "Shop not found" });
    if (!isFeatureEnabled(shop.planKey, "blog_sidebar")) {
      return res.status(403).json({ error: "Blog sidebar is available on Starter and above." });
    }

    const linkedPosts = await prisma.post.findMany({
      where: {
        shopId: shop.id,
        status: "published",
        shopifyArticle: { is: { shopifyBlogId: { not: null }, shopifyArticleId: { not: null } } },
      },
      select: { id: true, title: true },
    });

    let updated = 0;
    const errors = [];
    for (const post of linkedPosts) {
      try {
        await ArticleSyncService.pushPostToShopify(post.id, { publishMode: true });
        updated += 1;
      } catch (err) {
        errors.push({ postId: post.id, title: post.title, error: err.message });
      }
    }

    res.json({ success: true, updated, total: linkedPosts.length, errors });
  } catch (error) {
    console.error("POST /api/settings/apply-sidebar-layout error:", error);
    res.status(500).json({ error: "Failed to apply sidebar layout" });
  }
});

export default router;

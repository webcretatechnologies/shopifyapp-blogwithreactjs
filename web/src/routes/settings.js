import express from "express";
import { prisma } from "../../shopify.js";

const router = express.Router();

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
      "fontFamily",
      "blogLayout",
      "language",
      "showToc",
      "tocPosition",
      "showReadingTime",
      "showAuthor",
      "showPublishedDate",
      "showRelatedPosts",
      "relatedPostsCount",
      "blogPostsPerPage",
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

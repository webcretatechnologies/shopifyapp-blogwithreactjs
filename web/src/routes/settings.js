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
    const settingsObject = shop.settings.reduce((acc, setting) => {
      acc[setting.key] = setting.value;
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

    const { primaryColor, language } = req.body;

    const shop = await prisma.shop.findUnique({
      where: { domain: session.shop },
    });

    if (!shop) {
      return res.status(404).json({ error: "Shop not found" });
    }

    // Upsert each setting
    if (primaryColor !== undefined) {
      await prisma.shopSetting.upsert({
        where: {
          shopId_key: {
            shopId: shop.id,
            key: "primaryColor",
          },
        },
        update: { value: primaryColor },
        create: {
          shopId: shop.id,
          key: "primaryColor",
          value: primaryColor,
        },
      });
    }

    if (language !== undefined) {
      await prisma.shopSetting.upsert({
        where: {
          shopId_key: {
            shopId: shop.id,
            key: "language",
          },
        },
        update: { value: language },
        create: {
          shopId: shop.id,
          key: "language",
          value: language,
        },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error saving settings:", error);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

export default router;

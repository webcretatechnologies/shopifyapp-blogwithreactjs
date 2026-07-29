import express from "express";
import { PrismaClient } from "@prisma/client";

const router = express.Router();
const prisma = new PrismaClient();

async function getShopFromSession(res) {
  const session = res.locals.shopify?.session;
  if (!session?.shop) return null;
  return await prisma.shop.findUnique({ where: { domain: session.shop } });
}

// GET /api/patterns
// Fetch all reusable patterns for the authenticated shop
router.get("/", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const patterns = await prisma.template.findMany({
      where: {
        source: "pattern",
        shopId: shop.id,
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ patterns });
  } catch (err) {
    console.error("GET /api/patterns error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/patterns
// Save a block (or tree of blocks) as a reusable pattern
router.post("/", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const { name, description, blocks } = req.body;
    if (!name || !blocks) {
      return res.status(400).json({ error: "name and blocks are required" });
    }

    const key = `pattern-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const pattern = await prisma.template.create({
      data: {
        key,
        name,
        description: description || null,
        blocks,
        source: "pattern",
        shopId: shop.id,
        isActive: true,
      },
    });

    res.json({ success: true, pattern });
  } catch (err) {
    console.error("POST /api/patterns error:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/patterns/:id
// Delete a pattern owned by the authenticated shop
router.delete("/:id", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid pattern ID" });

    const existing = await prisma.template.findFirst({
      where: { id, shopId: shop.id, source: "pattern" },
    });
    if (!existing) return res.status(404).json({ error: "Pattern not found" });

    await prisma.template.delete({ where: { id } });

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/patterns error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

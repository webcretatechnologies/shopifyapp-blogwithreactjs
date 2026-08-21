/**
 * Categories CRUD — shop-scoped. Required for category-wise related posts and the
 * sidebar Categories widget.
 */
import express from "express";
import { prisma } from "../../shopify.js";

const router = express.Router();

function slugify(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "category";
}

async function getShop(req, res) {
  const session = res.locals.shopify?.session;
  if (!session?.shop) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  if (!shop) {
    res.status(404).json({ error: "Shop not found" });
    return null;
  }
  return shop;
}

router.get("/", async (req, res) => {
  try {
    const shop = await getShop(req, res);
    if (!shop) return;

    const categories = await prisma.category.findMany({
      where: { shopId: shop.id },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            posts: { where: { status: "published" } },
          },
        },
      },
    });

    res.json({
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        postCount: c._count.posts,
      })),
    });
  } catch (err) {
    console.error("GET /api/categories error:", err);
    res.status(500).json({ error: "Failed to list categories" });
  }
});

router.post("/", async (req, res) => {
  try {
    const shop = await getShop(req, res);
    if (!shop) return;

    const name = String(req.body.name || "").trim();
    if (!name) return res.status(422).json({ error: "Name is required" });

    let slug = slugify(req.body.slug || name);
    const existing = await prisma.category.findUnique({
      where: { shopId_slug: { shopId: shop.id, slug } },
    });
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const category = await prisma.category.create({
      data: { shopId: shop.id, name, slug },
    });
    res.status(201).json({ category });
  } catch (err) {
    console.error("POST /api/categories error:", err);
    res.status(500).json({ error: "Failed to create category" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const shop = await getShop(req, res);
    if (!shop) return;

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

    const existing = await prisma.category.findFirst({ where: { id, shopId: shop.id } });
    if (!existing) return res.status(404).json({ error: "Category not found" });

    const name = req.body.name !== undefined ? String(req.body.name).trim() : existing.name;
    if (!name) return res.status(422).json({ error: "Name is required" });

    // Keep the existing slug on rename unless the merchant explicitly sends a new slug.
    // Storefront Categories widget links use /blogs/.../tagged/{slug} (and ArticleSyncService
    // pushes the slug as a Shopify article tag) — regenerating from the name would break those.
    let slug = existing.slug;
    if (req.body.slug !== undefined) {
      const requested = String(req.body.slug || "").trim();
      slug = slugify(requested || name);
      const clash = await prisma.category.findFirst({
        where: { shopId: shop.id, slug, id: { not: id } },
      });
      if (clash) slug = `${slug}-${id}`;
    }

    const category = await prisma.category.update({
      where: { id },
      data: { name, slug },
    });
    res.json({ category });
  } catch (err) {
    console.error("PUT /api/categories error:", err);
    res.status(500).json({ error: "Failed to update category" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const shop = await getShop(req, res);
    if (!shop) return;

    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

    const existing = await prisma.category.findFirst({ where: { id, shopId: shop.id } });
    if (!existing) return res.status(404).json({ error: "Category not found" });

    await prisma.post.updateMany({
      where: { shopId: shop.id, categoryId: id },
      data: { categoryId: null },
    });
    await prisma.category.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/categories error:", err);
    res.status(500).json({ error: "Failed to delete category" });
  }
});

export default router;

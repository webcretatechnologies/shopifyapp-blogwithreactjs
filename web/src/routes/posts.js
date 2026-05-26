/**
 * Posts (Articles) API Routes
 * Mirrors Laravel's ArticleController functionality
 */
import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import BlockRenderer from "../services/BlockRenderer.js";
import shopify from "../../shopify.js";
import {
  getFeaturesForPlan,
  getArticleLimit,
  maxSectionsForPlan,
  isFeatureEnabled,
} from "../services/PlanFeatureService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();
const prisma = new PrismaClient();

// ─── Multer (file uploads) ─────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: path.join(__dirname, "../../public/uploads"),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Helper: get shop from session ────────────────────────────────────────────
async function getShopFromSession(res) {
  const session = res.locals.shopify?.session;
  if (!session) return null;
  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  return shop;
}

// ─── GET /api/posts — List all posts for shop ─────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const { status, search, page = 1, per_page = 20 } = req.query;
    const take = parseInt(per_page);
    const skip = (parseInt(page) - 1) * take;

    const where = {
      shopId: shop.id,
      ...(status && { status }),
      ...(search && {
        title: { contains: search },
      }),
    };

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          category: true,
          tags: { include: { tag: true } },
          shopifyArticle: true,
        },
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      prisma.post.count({ where }),
    ]);

    res.json({
      posts: posts.map(serializePost),
      total,
      page: parseInt(page),
      per_page: take,
      last_page: Math.ceil(total / take),
    });
  } catch (err) {
    console.error("GET /api/posts error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/:id — Get single post ─────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const post = await prisma.post.findFirst({
      where: { id: parseInt(req.params.id), shopId: shop.id },
      include: {
        category: true,
        tags: { include: { tag: true } },
        products: { include: { product: true }, orderBy: { position: "asc" } },
        shopifyArticle: true,
        blocks: { orderBy: { orderIndex: "asc" } },
      },
    });

    if (!post) return res.status(404).json({ error: "Post not found" });

    const features = getFeaturesForPlan(shop.planKey);
    res.json({ post: serializePost(post), features });
  } catch (err) {
    console.error("GET /api/posts/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts — Create post ────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    // Plan check: article limit
    const limit = getArticleLimit(shop.planKey);
    if (limit !== null) {
      const count = await prisma.post.count({ where: { shopId: shop.id } });
      if (count >= limit) {
        return res.status(403).json({
          error: `You've reached your plan limit of ${limit} articles. Please upgrade to add more.`,
        });
      }
    }

    const {
      title,
      slug,
      status = "draft",
      author,
      vendor,
      excerpt,
      featuredImage,
      contentJson,
      customCss,
      customJs,
      productSliderPosition = "none",
      categoryId,
      tags = [],
      blogId,
      editorMode = "wysiwyg",
      metaTitle,
      metaDescription,
      canonicalUrl,
      ogTitle,
      ogDescription,
      ogImage,
    } = req.body;

    if (!title) return res.status(422).json({ error: "Title is required" });

    // Render HTML from blocks
    const blocks = Array.isArray(contentJson) ? contentJson : [];
    const contentHtml = BlockRenderer.render(blocks, shop.domain, {
      product_slider_position: productSliderPosition,
    });

    const post = await prisma.post.create({
      data: {
        shopId: shop.id,
        title,
        slug: slug || generateSlug(title),
        status,
        author: author || null,
        vendor: vendor || null,
        excerpt: excerpt || null,
        featuredImage: featuredImage || null,
        contentJson: blocks,
        contentHtml,
        customCss: customCss || null,
        customJs: customJs || null,
        productSliderPosition,
        categoryId: categoryId ? parseInt(categoryId) : null,
        editorMode,
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
        canonicalUrl: canonicalUrl || null,
        ogTitle: ogTitle || null,
        ogDescription: ogDescription || null,
        ogImage: ogImage || null,
      },
    });

    // Sync tags
    if (tags.length) {
      await syncTags(shop.id, post.id, tags);
    }

    // Create ShopifyArticle record if blogId provided
    if (blogId) {
      await prisma.shopifyArticle.create({
        data: {
          postId: post.id,
          shopifyBlogId: String(blogId),
          status: "draft",
        },
      });
    }

    const postCount = await prisma.post.count({ where: { shopId: shop.id } });
    const isFirstPost = postCount === 1;

    res.status(201).json({ post: { id: post.id }, success: true, isFirstPost });
  } catch (err) {
    console.error("POST /api/posts error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/posts/:id — Update post ────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const post = await prisma.post.findFirst({
      where: { id: parseInt(req.params.id), shopId: shop.id },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const {
      title,
      slug,
      status,
      author,
      vendor,
      excerpt,
      featuredImage,
      contentJson,
      customCss,
      customJs,
      productSliderPosition,
      productSliderSource,
      productSliderConfig,
      categoryId,
      tags,
      publishedAt,
      editorMode,
      metaTitle,
      metaDescription,
      canonicalUrl,
      ogTitle,
      ogDescription,
      ogImage,
    } = req.body;

    // Check section limit
    const sectionLimit = maxSectionsForPlan(shop.planKey);
    const blocks = contentJson !== undefined ? (Array.isArray(contentJson) ? contentJson : []) : post.contentJson || [];
    if (sectionLimit !== null && blocks.length > sectionLimit) {
      return res.status(403).json({
        error: `Your plan allows a maximum of ${sectionLimit} sections per article.`,
      });
    }

    const contentHtml = BlockRenderer.render(blocks, shop.domain, {
      product_slider_position: productSliderPosition || post.productSliderPosition,
    });

    const updated = await prisma.post.update({
      where: { id: post.id },
      data: {
        ...(title && { title }),
        ...(slug && { slug }),
        ...(status && { status }),
        author: author !== undefined ? author : post.author,
        vendor: vendor !== undefined ? vendor : post.vendor,
        excerpt: excerpt !== undefined ? excerpt : post.excerpt,
        featuredImage: featuredImage !== undefined ? featuredImage : post.featuredImage,
        contentJson: blocks,
        contentHtml,
        customCss: customCss !== undefined ? customCss : post.customCss,
        customJs: customJs !== undefined ? customJs : post.customJs,
        ...(productSliderPosition && { productSliderPosition }),
        ...(productSliderSource && { productSliderSource }),
        ...(productSliderConfig && { productSliderConfig }),
        ...(categoryId !== undefined && { categoryId: categoryId ? parseInt(categoryId) : null }),
        ...(publishedAt && { publishedAt: new Date(publishedAt) }),
        ...(editorMode && { editorMode }),
        metaTitle: metaTitle !== undefined ? metaTitle : post.metaTitle,
        metaDescription: metaDescription !== undefined ? metaDescription : post.metaDescription,
        canonicalUrl: canonicalUrl !== undefined ? canonicalUrl : post.canonicalUrl,
        ogTitle: ogTitle !== undefined ? ogTitle : post.ogTitle,
        ogDescription: ogDescription !== undefined ? ogDescription : post.ogDescription,
        ogImage: ogImage !== undefined ? ogImage : post.ogImage,
        updatedAt: new Date(),
      },
    });

    if (Array.isArray(tags)) {
      await syncTags(shop.id, post.id, tags);
    }

    res.json({ post: { id: updated.id }, success: true });
  } catch (err) {
    console.error("PUT /api/posts/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/posts/:id ─────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    const shop = await getShopFromSession(res);
    if (!shop || !session) return res.status(401).json({ error: "Unauthorized" });

    const post = await prisma.post.findFirst({
      where: { id: parseInt(req.params.id), shopId: shop.id },
      include: { shopifyArticle: true },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const { deleteFromShopify } = req.query;

    if (deleteFromShopify === "true" && post.shopifyArticle?.shopifyArticleId && post.shopifyArticle?.shopifyBlogId) {
      try {
        const client = new shopify.api.clients.Rest({ session });
        await client.delete({
          path: `blogs/${post.shopifyArticle.shopifyBlogId}/articles/${post.shopifyArticle.shopifyArticleId}`,
        });
      } catch (shopifyErr) {
        console.error("Failed to delete from Shopify:", shopifyErr);
        // Continue to delete locally even if Shopify delete fails (or maybe it was already deleted on Shopify)
      }
    }

    await prisma.post.delete({ where: { id: post.id } });
    res.status(204).send();
  } catch (err) {
    console.error("DELETE /api/posts/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/:id/publish — Publish to Shopify ─────────────────────────
router.post("/:id/publish", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    const shop = await getShopFromSession(res);
    if (!shop || !session) return res.status(401).json({ error: "Unauthorized" });

    const post = await prisma.post.findFirst({
      where: { id: parseInt(req.params.id), shopId: shop.id },
      include: {
        shopifyArticle: true,
        tags: { include: { tag: true } },
        products: { include: { product: true } },
      },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const { blogId } = req.body;
    const targetBlogId = blogId || post.shopifyArticle?.shopifyBlogId;
    if (!targetBlogId) {
      return res.status(422).json({ error: "No Shopify blog selected. Please select a blog first." });
    }

    // Build Shopify article payload
    const tagNames = post.tags.map((pt) => pt.tag.name).join(",");
    const payload = {
      article: {
        title: post.title,
        author: post.author || "Admin",
        body_html: post.contentHtml || "",
        tags: tagNames,
        published: true,
        image: post.featuredImage ? { src: post.featuredImage } : undefined,
      },
    };

    // Call Shopify REST API
    const client = new shopify.api.clients.Rest({ session });
    let result;
    if (post.shopifyArticle?.shopifyArticleId) {
      result = await client.put({
        path: `blogs/${targetBlogId}/articles/${post.shopifyArticle.shopifyArticleId}`,
        data: payload,
        type: "application/json",
      });
    } else {
      result = await client.post({
        path: `blogs/${targetBlogId}/articles`,
        data: payload,
        type: "application/json",
      });
    }

    const articleId = result.body?.article?.id;
    if (!articleId) throw new Error("Shopify did not return an article ID");

    await Promise.all([
      prisma.shopifyArticle.upsert({
        where: { postId: post.id },
        create: {
          postId: post.id,
          shopifyArticleId: String(articleId),
          shopifyBlogId: String(targetBlogId),
          status: "published",
          syncedAt: new Date(),
        },
        update: {
          shopifyArticleId: String(articleId),
          shopifyBlogId: String(targetBlogId),
          status: "published",
          syncedAt: new Date(),
        },
      }),
      prisma.post.update({
        where: { id: post.id },
        data: { status: "published", publishedAt: new Date() },
      }),
    ]);

    res.json({ success: true, shopify_article_id: articleId });
  } catch (err) {
    console.error("POST /api/posts/:id/publish error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/:id/unpublish — Unpublish from Shopify ───────────────────
router.post("/:id/unpublish", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    const shop = await getShopFromSession(res);
    if (!shop || !session) return res.status(401).json({ error: "Unauthorized" });

    const post = await prisma.post.findFirst({
      where: { id: parseInt(req.params.id), shopId: shop.id },
      include: { shopifyArticle: true },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });

    if (!post.shopifyArticle || !post.shopifyArticle.shopifyArticleId || !post.shopifyArticle.shopifyBlogId) {
      return res.status(400).json({ error: "Post is not published to Shopify." });
    }

    const client = new shopify.api.clients.Rest({ session });
    
    // Delete the article on Shopify to unpublish it
    await client.delete({
      path: `blogs/${post.shopifyArticle.shopifyBlogId}/articles/${post.shopifyArticle.shopifyArticleId}`,
    });

    await prisma.$transaction([
      prisma.shopifyArticle.update({
        where: { postId: post.id },
        data: {
          status: "draft",
          shopifyArticleId: null, // Clear the ID as it's deleted on Shopify
        },
      }),
      prisma.post.update({
        where: { id: post.id },
        data: { status: "draft" },
      }),
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/posts/:id/unpublish error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/plan/features — Return plan features for UI ───────────────
router.get("/plan/features", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });
    const features = getFeaturesForPlan(shop.planKey);
    res.json({ plan: shop.planKey, features });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/upload — Media upload ────────────────────────────────────
router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url, filename: req.file.filename });
});

// ─── GET /api/posts/shopify/blogs — Fetch Shopify blogs list ─────────────────
router.get("/shopify/blogs", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const client = new shopify.api.clients.Rest({ session });
    const response = await client.get({ path: "blogs" });
    const blogs = response.body?.blogs || [];

    res.json({
      blogs: blogs.map((b) => ({ id: b.id, title: b.title, handle: b.handle })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/shopify/files — Fetch Shopify global files ─────────────────
router.get("/shopify/files", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const client = new shopify.api.clients.Graphql({ session });
    const { after = null, query = "" } = req.query;

    let gqlQuery = "";
    if (query) {
      gqlQuery = `query: "${query.replace(/"/g, '\\"')}",`;
    }

    const result = await client.request(`
      query GetFiles($after: String) {
        files(first: 50, after: $after, sortKey: CREATED_AT, reverse: true, ${gqlQuery}) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              __typename
              ... on MediaImage {
                id
                alt
                image { url width height }
              }
            }
          }
        }
      }
    `, { variables: { after } });

    const filesData = result.data?.files;
    const pageInfo = filesData?.pageInfo || { hasNextPage: false, endCursor: null };
    const edges = filesData?.edges || [];

    const files = edges
      .filter((e) => e.node.__typename === "MediaImage")
      .map((e) => ({
        id: e.node.id,
        url: e.node.image?.url,
        alt: e.node.alt || "",
      }));

    res.json({ files, pageInfo });
  } catch (err) {
    console.error("GET /api/posts/shopify/files error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/shopify/products — Fetch Shopify products ────────────────
router.get("/shopify/products", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const { query = "", limit = "50" } = req.query;
    const client = new shopify.api.clients.Graphql({ session });

    const result = await client.request(`
      query SearchProducts($query: String!, $first: Int!) {
        products(query: $query, first: $first) {
          edges {
            node {
              id
              title
              handle
              status
              featuredImage { url altText }
              priceRangeV2 { minVariantPrice { amount currencyCode } }
              variants(first: 1) {
                edges { node { id availableForSale } }
              }
            }
          }
        }
      }
    `, { variables: { query, first: parseInt(limit) } });

    const products = (result.data?.products?.edges || []).map(({ node }) => ({
      shopifyProductId: node.id,
      title: node.title,
      handle: node.handle,
      image: node.featuredImage?.url || null,
      price: node.priceRangeV2?.minVariantPrice?.amount || null,
      variantId: node.variants?.edges?.[0]?.node?.id || null,
      variantAvailable: node.variants?.edges?.[0]?.node?.availableForSale ?? true,
    }));

    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateSlug(title) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim() +
    "-" +
    Date.now()
  );
}

async function syncTags(shopId, postId, tags) {
  const tagNames = tags.map((t) => (typeof t === "string" ? t.trim() : String(t).trim())).filter(Boolean);

  // Upsert tags
  const tagRecords = await Promise.all(
    tagNames.map((name) =>
      prisma.tag.upsert({
        where: {
          shopId_slug: {
            shopId,
            slug: name.toLowerCase().replace(/\s+/g, "-"),
          },
        },
        create: {
          shopId,
          name,
          slug: name.toLowerCase().replace(/\s+/g, "-"),
        },
        update: {},
      })
    )
  );

  // Remove old PostTag rows and re-insert
  await prisma.postTag.deleteMany({ where: { postId } });
  await prisma.postTag.createMany({
    data: tagRecords.map((tag) => ({ postId, tagId: tag.id })),
    skipDuplicates: true,
  });
}

function serializePost(post) {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    status: post.status,
    author: post.author,
    vendor: post.vendor,
    excerpt: post.excerpt,
    featuredImage: post.featuredImage,
    contentJson: post.contentJson,
    contentHtml: post.contentHtml,
    customCss: post.customCss,
    customJs: post.customJs,
    productSliderPosition: post.productSliderPosition,
    productSliderSource: post.productSliderSource,
    categoryId: post.categoryId,
    category: post.category || null,
    tags: post.tags ? post.tags.map((pt) => pt.tag?.name || pt) : [],
    products: post.products
      ? post.products.map((pp) => ({
          position: pp.position,
          ...pp.product,
        }))
      : [],
    shopifyArticle: post.shopifyArticle || null,
    editorMode: post.editorMode,
    metaTitle: post.metaTitle,
    metaDescription: post.metaDescription,
    canonicalUrl: post.canonicalUrl,
    ogTitle: post.ogTitle,
    ogDescription: post.ogDescription,
    ogImage: post.ogImage,
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

// ─── GET /api/posts/analytics/summary — Dashboard analytics ──────────────────
router.get("/analytics/summary", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const [totalPosts, published, drafts, recentAnalytics, topPosts] = await Promise.all([
      prisma.post.count({ where: { shopId: shop.id } }),
      prisma.post.count({ where: { shopId: shop.id, status: "published" } }),
      prisma.post.count({ where: { shopId: shop.id, status: "draft" } }),
      // 30-day view history aggregated by date
      prisma.postAnalytic.findMany({
        where: {
          post: { shopId: shop.id },
          date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { date: "asc" },
        include: { post: { select: { title: true } } },
      }),
      // Top 5 posts by total views
      prisma.postAnalytic.groupBy({
        by: ["postId"],
        where: { post: { shopId: shop.id } },
        _sum: { views: true },
        orderBy: { _sum: { views: "desc" } },
        take: 5,
      }),
    ]);

    // Aggregate daily views across all posts
    const viewsByDate = {};
    recentAnalytics.forEach((a) => {
      const dateKey = a.date.toISOString().split("T")[0];
      viewsByDate[dateKey] = (viewsByDate[dateKey] || 0) + a.views;
    });
    const dailyViews = Object.entries(viewsByDate).map(([date, views]) => ({ date, views }));
    const totalViews = dailyViews.reduce((s, d) => s + d.views, 0);

    // Enrich top posts with title
    const topPostIds = topPosts.map((t) => t.postId);
    const topPostDetails = await prisma.post.findMany({
      where: { id: { in: topPostIds }, shopId: shop.id },
      select: { id: true, title: true, featuredImage: true, status: true },
    });
    const topPostsEnriched = topPosts.map((t) => {
      const detail = topPostDetails.find((p) => p.id === t.postId) || {};
      return { ...detail, totalViews: t._sum.views || 0 };
    });

    res.json({
      stats: { totalPosts, published, drafts, totalViews },
      dailyViews,
      topPosts: topPostsEnriched,
    });
  } catch (err) {
    console.error("GET /api/posts/analytics/summary error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/:id/view — Track post view ───────────────────────────────
router.post("/:id/view", async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.postAnalytic.upsert({
      where: { postId_date: { postId, date: today } },
      update: { views: { increment: 1 } },
      create: { postId, date: today, views: 1 },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/:id/sync — Force re-sync post to Shopify ────────────────
router.post("/:id/force-sync", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const post = await prisma.post.findFirst({
      where: { id: parseInt(req.params.id), shopId: shop.id },
      include: { shopifyArticle: true },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });
    if (!post.shopifyArticle?.shopifyBlogId) {
      return res.status(400).json({ error: "Post is not linked to a Shopify blog" });
    }

    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "No Shopify session" });

    const client = new shopify.api.clients.Rest({ session });
    const articleData = {
      article: {
        title: post.title,
        body_html: post.contentHtml || "",
        author: post.author || "",
        published: post.status === "published",
        tags: "",
      },
    };

    let articleId = post.shopifyArticle.shopifyArticleId;
    if (articleId) {
      await client.put({
        path: `blogs/${post.shopifyArticle.shopifyBlogId}/articles/${articleId}`,
        data: articleData,
      });
    } else {
      const response = await client.post({
        path: `blogs/${post.shopifyArticle.shopifyBlogId}/articles`,
        data: articleData,
      });
      articleId = response.body?.article?.id;
    }

    await prisma.shopifyArticle.update({
      where: { postId: post.id },
      data: { shopifyArticleId: String(articleId), status: post.status, syncedAt: new Date() },
    });

    res.json({ success: true, syncedAt: new Date() });
  } catch (err) {
    console.error("POST /api/posts/:id/force-sync error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Translations API Routes ───────────────────────────────────────────────
router.get("/:id/translations", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const translations = await prisma.postTranslation.findMany({
      where: { postId: parseInt(req.params.id) },
    });
    res.json({ translations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:id/translations", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const postId = parseInt(req.params.id);
    const { locale, title, excerpt, contentHtml, metaTitle, metaDescription } = req.body;

    if (!locale) return res.status(422).json({ error: "Locale is required" });

    const translation = await prisma.postTranslation.upsert({
      where: { postId_locale: { postId, locale } },
      create: { postId, locale, title, excerpt, contentHtml, metaTitle, metaDescription },
      update: { title, excerpt, contentHtml, metaTitle, metaDescription },
    });

    res.json({ success: true, translation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;


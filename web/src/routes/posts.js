/**
 * Posts (Articles) API Routes
 * Mirrors Laravel's ArticleController functionality
 */
import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import JsonLdService from "../services/JsonLdService.js";
import shopify from "../../shopify.js";
import {
  getFeaturesForPlan,
  getArticleLimit,
  maxSectionsForPlan,
  isFeatureEnabled,
} from "../services/PlanFeatureService.js";
import { EditorContentCompiler } from "../services/EditorContentCompiler.js";
import { ArticleSyncService } from "../services/ArticleSyncService.js";
import { ShopifyArticleParser } from "../services/ShopifyArticleParser.js";
import { getShopAnalytics } from "../services/AnalyticsTrackingService.js";

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

// ─── POST /api/posts/preview — Compile editor content for preview ──────────────
router.post("/preview", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    let client = null;
    if (session) {
      client = new shopify.api.clients.Graphql({ session });
    }
    const { contentHtml } = req.body;
    const compiled = await EditorContentCompiler.compileForStorefront(contentHtml || "", session, client);
    res.json({ contentHtml: compiled });
  } catch (err) {
    console.error("POST /api/posts/preview error:", err);
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
      contentHtml: reqContentHtml,
      customCss,
      customJs,
      productSliderPosition = "none",
      productSliderSource = "recommendations",
      productSliderConfig,
      productSliderProducts = [],
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

    const blocks = Array.isArray(contentJson) ? contentJson : [];
    
    // Compile content html
    const session = res.locals.shopify?.session;
    let client = null;
    if (session) {
      client = new shopify.api.clients.Graphql({ session });
    }
    const finalContentHtml = await EditorContentCompiler.compile(
      reqContentHtml || "",
      session,
      client
    );

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
        contentHtml: finalContentHtml,
        customCss: customCss || null,
        customJs: customJs || null,
        productSliderPosition,
        productSliderSource,
        productSliderConfig: productSliderConfig || null,
        categoryId: categoryId ? parseInt(categoryId) : null,
        editorMode: "wysiwyg",
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

    // Sync products
    if (Array.isArray(productSliderProducts)) {
      await syncProducts(shop.id, post.id, productSliderProducts);
    }

    // Create ShopifyArticle record if blogId provided
    if (blogId) {
      await prisma.shopifyArticle.create({
        data: {
          postId: post.id,
          shopifyBlogId: String(blogId),
          status: "draft",
          syncState: "linked",
          syncMode: "external_html",
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
      contentHtml: reqContentHtml,
      customCss,
      customJs,
      productSliderPosition,
      productSliderSource,
      productSliderConfig,
      productSliderProducts,
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
      blogId,
    } = req.body;

    // Check section limit
    const sectionLimit = maxSectionsForPlan(shop.planKey);
    const blocks = contentJson !== undefined ? (Array.isArray(contentJson) ? contentJson : []) : post.contentJson || [];
    if (sectionLimit !== null && blocks.length > sectionLimit) {
      return res.status(403).json({
        error: `Your plan allows a maximum of ${sectionLimit} sections per article.`,
      });
    }

    const finalEditorMode = "wysiwyg";
    let finalContentHtml = post.contentHtml;
    if (reqContentHtml !== undefined) {
      const session = res.locals.shopify?.session;
      let client = null;
      if (session) {
        client = new shopify.api.clients.Graphql({ session });
      }
      finalContentHtml = await EditorContentCompiler.compile(
        reqContentHtml,
        session,
        client
      );
    }

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
        contentHtml: finalContentHtml,
        customCss: customCss !== undefined ? customCss : post.customCss,
        customJs: customJs !== undefined ? customJs : post.customJs,
        ...(productSliderPosition && { productSliderPosition }),
        ...(productSliderSource && { productSliderSource }),
        ...(productSliderConfig && { productSliderConfig }),
        ...(categoryId !== undefined && { categoryId: categoryId ? parseInt(categoryId) : null }),
        ...(publishedAt && { publishedAt: new Date(publishedAt) }),
        editorMode: "wysiwyg",
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

    if (Array.isArray(productSliderProducts)) {
      await syncProducts(shop.id, post.id, productSliderProducts);
    }

    // Create or update ShopifyArticle relation locally if blogId was provided
    if (blogId) {
      await prisma.shopifyArticle.upsert({
        where: { postId: post.id },
        create: {
          postId: post.id,
          shopifyBlogId: String(blogId),
          status: updated.status || "draft",
          syncState: "linked",
          syncMode: "external_html",
        },
        update: {
          shopifyBlogId: String(blogId),
        },
      });
    }

    // Sync to Shopify using ArticleSyncService if linked to a blog
    const shopifyRecord = await prisma.shopifyArticle.findUnique({ where: { postId: post.id } });
    const targetBlogId = blogId || shopifyRecord?.shopifyBlogId;

    if (targetBlogId && (updated.status === "published" || shopifyRecord?.shopifyArticleId)) {
      try {
        await ArticleSyncService.syncAfterLocalEdit(post.id, {
          publishMode: updated.status === "published",
        });
      } catch (shopifyErr) {
        console.error("Shopify sync failed during PUT:", shopifyErr);
      }
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

    // Ensure the post is linked before push
    if (!post.shopifyArticle) {
      await prisma.shopifyArticle.create({
        data: {
          postId: post.id,
          shopifyBlogId: String(targetBlogId),
          status: "draft",
          syncState: "linked",
          syncMode: "external_html",
        },
      });
    }

    // Use ArticleSyncService to push with publish mode
    const result = await ArticleSyncService.syncAfterLocalEdit(post.id, {
      publishMode: true,
    });

    // Also update local post status to published
    await prisma.post.update({
      where: { id: post.id },
      data: { status: "published", publishedAt: new Date() },
    });

    res.json({ success: true, shopify_article_id: result.articleId, syncedAt: result.syncedAt });
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
    
    // Set published to false to unpublish it
    await client.put({
      path: `blogs/${post.shopifyArticle.shopifyBlogId}/articles/${post.shopifyArticle.shopifyArticleId}`,
      data: {
        article: {
          published: false,
        }
      },
      type: "application/json",
    });

    await prisma.$transaction([
      prisma.shopifyArticle.update({
        where: { postId: post.id },
        data: {
          status: "draft",
          syncState: "in_sync",
          lastSyncDirection: "app_to_shopify",
        },
      }),
      prisma.post.update({
        where: { id: post.id },
        data: { status: "draft" },
      }),
    ]);

    // Log the unpublish event
    await ArticleSyncService.logSyncEvent({
      shopId: shop.id,
      postId: post.id,
      shopifyArticleId: post.shopifyArticle.shopifyArticleId,
      direction: "app_to_shopify",
      eventType: "unpublish",
      status: "applied",
      message: `Unpublished post "${post.title}" from Shopify`,
    });

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
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const shop = await getShopFromSession(res);
    if (shop) {
      const session = res.locals.shopify.session;
      const client = new shopify.api.clients.Graphql({ session });
      
      const stagedQuery = `
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets { url resourceUrl parameters { name value } }
            userErrors { field message }
          }
        }
      `;
      const stagedData = await client.request(stagedQuery, {
        variables: {
          input: [{
            resource: "IMAGE",
            filename: req.file.originalname,
            mimeType: req.file.mimetype,
            fileSize: req.file.size.toString(),
            httpMethod: "POST"
          }]
        }
      });
      
      const target = stagedData.data.stagedUploadsCreate.stagedTargets[0];
      if (target) {
        const formData = new FormData();
        target.parameters.forEach(p => formData.append(p.name, p.value));
        const { Blob } = await import("node:buffer");
        const fs = await import("fs");
        const fileBuffer = fs.readFileSync(req.file.path);
        formData.append("file", new Blob([fileBuffer], { type: req.file.mimetype }), req.file.originalname);
        
        await fetch(target.url, { method: "POST", body: formData });
        
        const createQuery = `
          mutation fileCreate($files: [FileCreateInput!]!) {
            fileCreate(files: $files) {
              files { id ... on MediaImage { image { url } } }
              userErrors { field message }
            }
          }
        `;
        const createData = await client.request(createQuery, {
          variables: {
            files: [{ originalSource: target.resourceUrl, contentType: "IMAGE" }]
          }
        });
        
        let fileObj = createData.data.fileCreate.files[0];
        let finalUrl = fileObj?.image?.url;
        
        // Poll up to 5 times
        let attempts = 0;
        while (!finalUrl && attempts < 5 && fileObj?.id) {
          await new Promise(r => setTimeout(r, 1000));
          const pollQuery = `query { node(id: "${fileObj.id}") { ... on MediaImage { image { url } } } }`;
          const pollData = await client.request(pollQuery);
          finalUrl = pollData.data.node?.image?.url;
          attempts++;
        }
        
        if (finalUrl) {
           const fs = await import("fs");
           fs.unlinkSync(req.file.path); // remove local
           return res.json({ url: finalUrl, filename: req.file.filename });
        }
      }
    }
  } catch (e) {
    console.error("Shopify Direct Upload failed, falling back:", e);
  }

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
      currency: node.priceRangeV2?.minVariantPrice?.currencyCode || "USD",
      variantId: node.variants?.edges?.[0]?.node?.id || null,
      variantAvailable: node.variants?.edges?.[0]?.node?.availableForSale ?? true,
    }));

    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/shopify/store — Fetch store currency ──────────────────────
router.get("/shopify/store", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const client = new shopify.api.clients.Graphql({ session });

    const result = await client.request(`
      query GetShopCurrency {
        shop {
          currencyCode
          currencyFormats {
            moneyFormat
            moneyWithCurrencyFormat
          }
        }
      }
    `);

    const shopData = result.data?.shop;
    res.json({
      currencyCode: shopData?.currencyCode || "USD",
      moneyFormat: shopData?.currencyFormats?.moneyFormat || "${{amount}}",
      moneyWithCurrencyFormat: shopData?.currencyFormats?.moneyWithCurrencyFormat || "${{amount}} USD",
    });
  } catch (err) {
    console.error("GET /api/posts/shopify/store error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/shopify/collections — Fetch Shopify collections ──────────
router.get("/shopify/collections", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const { query = "", limit = "30" } = req.query;
    const client = new shopify.api.clients.Graphql({ session });

    const result = await client.request(`
      query GetCollections($first: Int!, $query: String!) {
        collections(first: $first, query: $query) {
          edges {
            node {
              id
              title
              handle
              image { url altText }
              productsCount { count }
            }
          }
        }
      }
    `, { variables: { first: parseInt(limit), query } });

    const collections = (result.data?.collections?.edges || []).map(({ node }) => ({
      shopifyCollectionId: node.id,
      title: node.title,
      handle: node.handle,
      image: node.image?.url || null,
      productsCount: node.productsCount?.count ?? 0,
    }));

    res.json({ collections });
  } catch (err) {
    console.error("GET /api/posts/shopify/collections error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/shopify/collections/:handle/products — Collection products ─
router.get("/shopify/collections/:handle/products", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "Unauthorized" });

    const { handle } = req.params;
    const { limit = "12" } = req.query;
    const client = new shopify.api.clients.Graphql({ session });

    const result = await client.request(`
      query GetCollectionProducts($handle: String!, $first: Int!) {
        collectionByHandle(handle: $handle) {
          id
          title
          handle
          image { url altText }
          products(first: $first) {
            edges {
              node {
                id
                title
                handle
                featuredImage { url altText }
                priceRangeV2 { minVariantPrice { amount currencyCode } }
                variants(first: 1) {
                  edges { node { id availableForSale } }
                }
              }
            }
          }
        }
      }
    `, { variables: { handle, first: parseInt(limit) } });

    const collection = result.data?.collectionByHandle;
    if (!collection) return res.status(404).json({ error: "Collection not found" });

    const products = (collection.products?.edges || []).map(({ node }) => ({
      shopifyProductId: node.id,
      title: node.title,
      handle: node.handle,
      image: node.featuredImage?.url || null,
      price: node.priceRangeV2?.minVariantPrice?.amount || null,
      currency: node.priceRangeV2?.minVariantPrice?.currencyCode || "USD",
      variantId: node.variants?.edges?.[0]?.node?.id || null,
      variantAvailable: node.variants?.edges?.[0]?.node?.availableForSale ?? true,
    }));

    res.json({
      collection: {
        id: collection.id,
        title: collection.title,
        handle: collection.handle,
        image: collection.image?.url || null,
      },
      products,
    });
  } catch (err) {
    console.error("GET /api/posts/shopify/collections/:handle/products error:", err);
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

async function syncProducts(shopId, postId, products) {
  if (!Array.isArray(products)) return;

  const productData = products.map((p) => {
    const rawId = p.shopifyProductId || p.id;
    const shopifyProductId = rawId ? String(rawId) : "";
    const priceRaw = p.price;
    const priceVal = priceRaw !== null && priceRaw !== undefined ? parseFloat(priceRaw) : null;
    const compareAtPriceRaw = p.compareAtPrice;
    const compareAtPriceVal = compareAtPriceRaw !== null && compareAtPriceRaw !== undefined ? parseFloat(compareAtPriceRaw) : null;

    return {
      shopifyProductId,
      title: String(p.title || ""),
      handle: String(p.handle || ""),
      image: p.image || null,
      price: priceVal,
      compareAtPrice: compareAtPriceVal,
      variantId: p.variantId ? String(p.variantId) : null,
      variantAvailable: p.variantAvailable ?? true,
    };
  }).filter((p) => p.shopifyProductId);

  // Upsert products in the Product table
  const productRecords = await Promise.all(
    productData.map(async (p) => {
      return prisma.product.upsert({
        where: { shopifyProductId: p.shopifyProductId },
        create: {
          shopId,
          shopifyProductId: p.shopifyProductId,
          title: p.title,
          handle: p.handle,
          image: p.image,
          price: p.price,
          compareAtPrice: p.compareAtPrice,
          variantId: p.variantId,
          variantAvailable: p.variantAvailable,
        },
        update: {
          title: p.title,
          handle: p.handle,
          image: p.image,
          price: p.price,
          compareAtPrice: p.compareAtPrice,
          variantId: p.variantId,
          variantAvailable: p.variantAvailable,
        },
      });
    })
  );

  // Remove old PostProduct rows and re-insert with positions
  await prisma.postProduct.deleteMany({ where: { postId } });
  
  if (productRecords.length > 0) {
    await prisma.postProduct.createMany({
      data: productRecords.map((prod, index) => ({
        postId,
        productId: prod.id,
        position: index,
      })),
      skipDuplicates: true,
    });
  }
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

    // Use the shared analytics service for comprehensive data
    const analytics = await getShopAnalytics(shop.id, 30);
    if (!analytics) {
      return res.json({
        stats: { totalPosts: 0, published: 0, drafts: 0, totalViews: 0, totalUniqueVisitors: 0, totalAddToCart: 0, totalCheckouts: 0, totalConversions: 0, totalRevenue: 0, addToCartRate: "0.00", checkoutRate: "0.00", conversionRate: "0.00" },
        daily: [],
        dailyViews: [],
        topPosts: [],
        deviceBreakdown: { desktop: 0, mobile: 0, tablet: 0 },
        topSources: [],
        topCountries: [],
        funnel: [],
      });
    }

    // Keep backward-compatible dailyViews field
    const dailyViews = (analytics.daily || []).map((d) => ({ date: d.date, views: d.views }));

    res.json({
      ...analytics,
      dailyViews,
    });
  } catch (err) {
    console.error("GET /api/posts/analytics/summary error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/:id/view — Track post view with enriched analytics ─────
router.post("/:id/view", async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── Device Type ────────────────────────────────────────────────────────
    const ua = (req.headers["user-agent"] || "").toLowerCase();
    let deviceDesktop = 0, deviceMobile = 0, deviceTablet = 0;
    if (/tablet|ipad|playbook|silk|android(?!.*mobile)/i.test(ua)) {
      deviceTablet = 1;
    } else if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile|wpdesktop/i.test(ua)) {
      deviceMobile = 1;
    } else {
      deviceDesktop = 1;
    }

    // ── Traffic Source ─────────────────────────────────────────────────────
    const referer = req.headers["referer"] || req.headers["referrer"] || "";
    let source = "direct";
    if (referer) {
      try {
        const refUrl = new URL(referer);
        const hostname = refUrl.hostname.toLowerCase();
        if (/google\./.test(hostname)) source = "google";
        else if (/facebook\.|fb\.me|meta\./.test(hostname)) source = "facebook";
        else if (/twitter\.|x\.com/.test(hostname)) source = "twitter";
        else if (/linkedin\./.test(hostname)) source = "linkedin";
        else if (/instagram\./.test(hostname)) source = "instagram";
        else if (/pinterest\./.test(hostname)) source = "pinterest";
        else if (/youtube\./.test(hostname)) source = "youtube";
        else if (/bing\.|yahoo\.|duckduckgo\.|baidu\./i.test(hostname)) source = "search";
        else if (/mail\.|outlook\.|yahoo\.com\/mail/.test(hostname)) source = "email";
        else if (hostname === req.get("host") || hostname.includes(req.get("host") || "")) source = "internal";
        else source = "other";
      } catch {
        source = "other";
      }
    }

    // ── Country (roughly from Accept-Language) ─────────────────────────────
    const acceptLang = req.headers["accept-language"] || "";
    let country = "";
    if (acceptLang) {
      const match = acceptLang.match(/^[a-z]{2}[-_]([a-z]{2})\b/i);
      if (match) country = match[1].toUpperCase();
    }

    // ── Unique Visitor (by IP, with TTL cleanup) ───────────────────────────
    const rawIp = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    const dateStr = today.toISOString().split("T")[0];
    const visitorKey = `${postId}:${dateStr}:${rawIp}`;
    if (!req.app.locals._viewedIps) req.app.locals._viewedIps = new Map();
    if (req.app.locals._viewedIps.size > 100000) {
      const cutoff = Date.now() - 48 * 60 * 60 * 1000;
      for (const [k] of req.app.locals._viewedIps) {
        const [, entryDate] = k.split(":");
        if (entryDate && new Date(entryDate).getTime() < cutoff) {
          req.app.locals._viewedIps.delete(k);
        }
      }
    }
    const ipSeen = req.app.locals._viewedIps.has(visitorKey);
    req.app.locals._viewedIps.set(visitorKey, Date.now());

    // ── Update Analytics ───────────────────────────────────────────────────
    const analytic = await prisma.postAnalytic.upsert({
      where: { postId_date: { postId, date: today } },
      update: {
        views: { increment: 1 },
        ...(!ipSeen ? { uniqueVisitors: { increment: 1 } } : {}),
        deviceDesktop: { increment: deviceDesktop },
        deviceMobile: { increment: deviceMobile },
        deviceTablet: { increment: deviceTablet },
      },
      create: {
        postId,
        date: today,
        views: 1,
        uniqueVisitors: 1,
        deviceDesktop,
        deviceMobile,
        deviceTablet,
      },
    });

    // ── Update sources JSON ────────────────────────────────────────────────
    const currentSources = (analytic.sources || {}) instanceof Buffer
      ? JSON.parse(analytic.sources.toString())
      : (analytic.sources || {});
    const newSources = {
      ...currentSources,
      [source]: (currentSources[source] || 0) + 1,
    };

    // ── Update countries JSON ──────────────────────────────────────────────
    let newCountries = null;
    if (country) {
      const currentCountries = (analytic.countries || {}) instanceof Buffer
        ? JSON.parse(analytic.countries.toString())
        : (analytic.countries || {});
      newCountries = {
        ...currentCountries,
        [country]: (currentCountries[country] || 0) + 1,
      };
    }

    if (analytic.views > 0 || source !== "direct" || country) {
      await prisma.postAnalytic.update({
        where: { id: analytic.id },
        data: {
          sources: newSources,
          ...(newCountries ? { countries: newCountries } : {}),
        },
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("POST /api/posts/:id/view error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/:id/force-sync — Force re-sync post to Shopify ────────────
router.post("/:id/force-sync", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const post = await prisma.post.findFirst({
      where: { id: parseInt(req.params.id), shopId: shop.id },
      include: { shopifyArticle: true, tags: { include: { tag: true } } },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });
    if (!post.shopifyArticle?.shopifyBlogId) {
      return res.status(400).json({ error: "Post is not linked to a Shopify blog" });
    }

    const result = await ArticleSyncService.pushPostToShopify(post.id, {
      publishMode: post.status === "published",
    });

    res.json({ success: true, syncedAt: result.syncedAt });
  } catch (err) {
    console.error("POST /api/posts/:id/force-sync error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/reconcile — Reconcile sync state for all linked posts ────
router.post("/reconcile", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const linkedPosts = await prisma.post.findMany({
      where: {
        shopId: shop.id,
        shopifyArticle: { isNot: null },
      },
      include: { shopifyArticle: true },
      take: 50,
    });

    const results = [];
    for (const post of linkedPosts) {
      try {
        const result = await ArticleSyncService.reconcilePost(post.id);
        results.push({ postId: post.id, title: post.title, status: result.status });
      } catch (err) {
        results.push({ postId: post.id, title: post.title, status: "error", error: err.message });
      }
    }

    res.json({ results });
  } catch (err) {
    console.error("POST /api/posts/reconcile error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/conflicts — List all posts with unresolved conflicts ─────
router.get("/conflicts", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const conflictPosts = await prisma.post.findMany({
      where: {
        shopId: shop.id,
        shopifyArticle: {
          syncState: "conflict",
        },
      },
      include: {
        shopifyArticle: true,
        tags: { include: { tag: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    res.json({ conflicts: conflictPosts.map(serializePost) });
  } catch (err) {
    console.error("GET /api/posts/conflicts error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/:id/conflict-diff — Fetch local vs remote diff ────────────
router.get("/:id/conflict-diff", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const post = await prisma.post.findFirst({
      where: { id: parseInt(req.params.id), shopId: shop.id },
      include: {
        shopifyArticle: true,
        tags: { include: { tag: true } },
      },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });
    if (!post.shopifyArticle) return res.status(404).json({ error: "Post not linked to Shopify" });

    const session = res.locals.shopify?.session;
    if (!session) return res.status(401).json({ error: "No session" });

    const client = new shopify.api.clients.Rest({ session });
    const response = await client.get({
      path: `blogs/${post.shopifyArticle.shopifyBlogId}/articles/${post.shopifyArticle.shopifyArticleId}`,
    });

    const remote = response.body?.article;
    if (!remote) {
      return res.status(404).json({ error: "Article not found on Shopify" });
    }

    const remoteTags = (remote.tags || "").split(",").map(t => t.trim()).filter(Boolean);
    const localTags = (post.tags || []).map(pt => pt.tag?.name).filter(Boolean);

    const diff = {
      title: {
        local: post.title,
        remote: remote.title,
        changed: post.title !== remote.title,
      },
      status: {
        local: post.status,
        remote: remote.published_at ? "published" : "draft",
        changed: (post.status === "published") !== !!remote.published_at,
      },
      author: {
        local: post.author || "",
        remote: remote.author || "",
        changed: (post.author || "") !== (remote.author || ""),
      },
      tags: {
        local: localTags,
        remote: remoteTags,
        changed: JSON.stringify([...localTags].sort()) !== JSON.stringify([...remoteTags].sort()),
      },
      featuredImage: {
        local: post.featuredImage || null,
        remote: remote.image?.src || null,
        changed: (post.featuredImage || null) !== (remote.image?.src || null),
      },
      contentHtml: {
        local: post.contentHtml || "",
        remote: remote.body_html || "",
        changed: (post.contentHtml || "") !== (remote.body_html || ""),
        type: "html",
      },
      updatedAt: {
        local: post.updatedAt,
        remote: remote.updated_at,
      },
    };

    res.json({ diff, postId: post.id, title: post.title });
  } catch (err) {
    console.error("GET /api/posts/:id/conflict-diff error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/posts/:id/resolve-conflict — Resolve a sync conflict (field-level) ─
router.post("/:id/resolve-conflict", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const { resolutions } = req.body;
    if (!resolutions || typeof resolutions !== "object") {
      return res.status(422).json({ error: "resolutions must be an object with field names as keys" });
    }

    const post = await prisma.post.findFirst({
      where: { id: parseInt(req.params.id), shopId: shop.id },
      include: {
        shopifyArticle: true,
        tags: { include: { tag: true } },
        shop: true,
      },
    });
    if (!post) return res.status(404).json({ error: "Post not found" });
    if (!post.shopifyArticle || post.shopifyArticle.syncState !== "conflict") {
      return res.status(400).json({ error: "Post is not in conflict state" });
    }

    for (const [field, choice] of Object.entries(resolutions)) {
      if (!["local", "remote"].includes(choice)) {
        return res.status(422).json({
          error: `Resolution for "${field}" must be 'local' or 'remote'`,
        });
      }
    }

    const conflictPayload = post.shopifyArticle.conflictPayload;
    if (!conflictPayload?.fields) {
      return res.status(400).json({ error: "No conflict payload found for this post" });
    }

    const session = await shopify.config.sessionStorage.findSessionsByShop(post.shop.domain);
    const validSession = session?.find(s => s.accessToken);
    if (!validSession) return res.status(401).json({ error: "No active Shopify session" });

    const client = new shopify.api.clients.Rest({ session: validSession });
    const response = await client.get({
      path: `blogs/${post.shopifyArticle.shopifyBlogId}/articles/${post.shopifyArticle.shopifyArticleId}`,
    });
    const remote = response.body?.article;
    if (!remote) return res.status(404).json({ error: "Article not found on Shopify" });

    const localTags = await prisma.postTag.findMany({
      where: { postId: post.id },
      include: { tag: true },
    });
    const localTagStr = localTags.map(pt => pt.tag?.name).filter(Boolean).sort().join(",");

    const localState = ArticleSyncService.normalizeLocalState(post, localTagStr);
    const remoteState = ArticleSyncService.normalizeRemoteState(remote);
    const resolvedLocal = { ...localState };

    for (const field of ["title", "author", "status", "tags", "featuredImage"]) {
      if (resolutions[field] === "remote") {
        resolvedLocal[field] = remoteState[field];
      }
    }

    let needsContentParse = false;
    if (resolutions.content === "remote") {
      needsContentParse = true;
    }

    const postUpdate = {
      title: resolvedLocal.title,
      status: resolvedLocal.status === "published" ? "published" : "draft",
      author: resolvedLocal.author || null,
      featuredImage: resolvedLocal.featuredImage || null,
      slug: remote.handle || post.slug,
      publishedAt: remote.published_at ? new Date(remote.published_at) : null,
    };

    if (needsContentParse) {
      const parsed = ShopifyArticleParser.parse(remote.body_html || "");
      postUpdate.contentHtml = parsed.rawEditorHtml || remote.body_html || "";
      postUpdate.contentJson = parsed.blocks;
    }

    await prisma.post.update({
      where: { id: post.id },
      data: postUpdate,
    });

    if (resolutions.tags === "remote") {
      const remoteTagNames = (remote.tags || "").split(",").map(t => t.trim()).filter(Boolean);
      await prisma.postTag.deleteMany({ where: { postId: post.id } });
      for (const tagName of remoteTagNames) {
        const slug = tagName.toLowerCase().replace(/\s+/g, "-");
        const tagRec = await prisma.tag.upsert({
          where: { shopId_slug: { shopId: shop.id, slug } },
          create: { shopId: shop.id, name: tagName, slug },
          update: {},
        });
        await prisma.postTag.upsert({
          where: { postId_tagId: { postId: post.id, tagId: tagRec.id } },
          create: { postId: post.id, tagId: tagRec.id },
          update: {},
        });
      }
    }

    const result = await ArticleSyncService.pushPostToShopify(post.id, {
      publishMode: postUpdate.status === "published",
    });

    await ArticleSyncService.logSyncEvent({
      shopId: shop.id,
      postId: post.id,
      shopifyArticleId: post.shopifyArticle.shopifyArticleId,
      direction: "app_to_shopify",
      eventType: "resolve",
      status: "applied",
      message: `Field-level conflict resolved for "${post.title}": ${Object.entries(resolutions).map(([f, c]) => `${f}=${c}`).join(", ")}`,
    });

    res.json({
      success: true,
      resolutions,
      message: `Resolved ${Object.keys(resolutions).length} field(s) for "${post.title}"`,
      syncedAt: result.syncedAt,
    });
  } catch (err) {
    console.error("POST /api/posts/:id/resolve-conflict error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/sync-logs — Fetch sync history for a post ────────────────
router.get("/sync-logs", async (req, res) => {
  try {
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const { postId, limit = 50 } = req.query;

    const where = { shopId: shop.id };
    if (postId) where.postId = parseInt(postId);

    const logs = await prisma.articleSyncLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: parseInt(limit),
    });

    res.json({ logs });
  } catch (err) {
    console.error("GET /api/posts/sync-logs error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/:id/sync-status — Lightweight sync state for editor polling ─
router.get("/:id/sync-status", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ error: "Post not found" });

    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const current = await prisma.shopifyArticle.findUnique({
      where: { postId: id },
      select: { shopifyArticleId: true, shopifyBlogId: true },
    });

    if (current?.shopifyArticleId && current?.shopifyBlogId) {
      await ArticleSyncService.pollReconcilePost(id);
    }

    const shopifyArticle = await prisma.shopifyArticle.findUnique({
      where: { postId: id },
      select: {
        status: true,
        syncState: true,
        syncMode: true,
        lastSyncDirection: true,
        syncedAt: true,
        structureDegraded: true,
        lastError: true,
        shopifyArticleId: true,
        shopifyBlogId: true,
      },
    });

    if (!shopifyArticle) {
      return res.json({ shopifyArticle: null });
    }

    res.json({ shopifyArticle });
  } catch (err) {
    console.error("GET /api/posts/:id/sync-status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/posts/:id — Get single post ─────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    // Skip if :id looks like a named path segment (not a numeric ID)
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(404).json({ error: "Post not found" });

    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const post = await prisma.post.findFirst({
      where: { id, shopId: shop.id },
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
    const serialized = serializePost(post);

    // Generate JSON-LD schema for the post
    const jsonLd = req.query.include_schema !== "false"
      ? JsonLdService.renderPostSchema(serialized, shop.domain)
      : null;

    res.json({ post: { ...serialized, jsonLd }, features });
  } catch (err) {
    console.error("GET /api/posts/:id error:", err);
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

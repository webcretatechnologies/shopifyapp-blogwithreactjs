import { prisma } from "./shopify.js";
import express from "express";

// We can mock the request and response objects and invoke the prisma query
async function testGetPosts() {
  console.log("Testing GET /api/posts logic...");
  try {
    const shop = await prisma.shop.findUnique({
      where: { domain: "rajiv-market-shop.myshopify.com" }
    });
    if (!shop) {
      console.log("Shop not found in database.");
      return;
    }
    console.log("Using Shop:", shop.domain);

    const status = undefined;
    const search = undefined;
    const page = 1;
    const per_page = 20;
    
    const take = parseInt(per_page);
    const skip = (parseInt(page) - 1) * take;

    const where = {
      shopId: shop.id,
      ...(status && { status }),
      ...(search && {
        title: { contains: search },
      }),
    };

    console.log("Querying database...");
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

    console.log(`Query succeeded! Found ${total} posts.`);
    
    // Test serializePost
    const serialized = posts.map(serializePost);
    console.log("Serialization succeeded!");
  } catch (err) {
    console.error("GET /api/posts logic failed:", err);
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

testGetPosts();

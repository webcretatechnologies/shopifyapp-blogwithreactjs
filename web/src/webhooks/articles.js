import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const ArticleWebhookHandlers = {
  ARTICLES_CREATE: {
    deliveryMethod: "http",
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body) => {
      try {
        const payload = JSON.parse(body);
        const store = await prisma.shop.findUnique({ where: { domain: shop } });
        if (!store) return;

        // Ensure we don't duplicate if we created it from the app
        const existing = await prisma.shopifyArticle.findFirst({
          where: { shopifyArticleId: String(payload.id) }
        });
        
        if (existing) return;

        // Create a new post in our DB to match the Shopify article
        const post = await prisma.post.create({
          data: {
            shopId: store.id,
            title: payload.title,
            slug: payload.handle || String(payload.id),
            status: payload.published_at ? "published" : "draft",
            author: payload.author,
            contentHtml: payload.body_html || "",
            featuredImage: payload.image?.src || null,
            publishedAt: payload.published_at ? new Date(payload.published_at) : null,
          }
        });

        // Link it
        await prisma.shopifyArticle.create({
          data: {
            postId: post.id,
            shopifyArticleId: String(payload.id),
            shopifyBlogId: String(payload.blog_id),
            status: payload.published_at ? "published" : "draft",
            syncedAt: new Date()
          }
        });
      } catch (err) {
        console.error("ARTICLES_CREATE webhook error:", err);
      }
    },
  },

  ARTICLES_UPDATE: {
    deliveryMethod: "http",
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body) => {
      try {
        const payload = JSON.parse(body);
        const link = await prisma.shopifyArticle.findFirst({
          where: { shopifyArticleId: String(payload.id) }
        });

        if (!link) return; // If we don't track it, ignore

        // Update the post
        await prisma.post.update({
          where: { id: link.postId },
          data: {
            title: payload.title,
            status: payload.published_at ? "published" : "draft",
            author: payload.author,
            contentHtml: payload.body_html || "",
            featuredImage: payload.image?.src || null,
            publishedAt: payload.published_at ? new Date(payload.published_at) : null,
          }
        });

        await prisma.shopifyArticle.update({
          where: { id: link.id },
          data: {
            status: payload.published_at ? "published" : "draft",
            syncedAt: new Date()
          }
        });
      } catch (err) {
        console.error("ARTICLES_UPDATE webhook error:", err);
      }
    },
  },

  ARTICLES_DELETE: {
    deliveryMethod: "http",
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body) => {
      try {
        const payload = JSON.parse(body);
        const link = await prisma.shopifyArticle.findFirst({
          where: { shopifyArticleId: String(payload.id) }
        });

        if (!link) return;

        // The merchant deleted the article in Shopify.
        // We delete our local record to maintain sync.
        await prisma.post.delete({
          where: { id: link.postId }
        });
      } catch (err) {
        console.error("ARTICLES_DELETE webhook error:", err);
      }
    },
  },
};

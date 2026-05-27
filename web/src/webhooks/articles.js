import { ArticleSyncService } from "../services/ArticleSyncService.js";

export const ArticleWebhookHandlers = {
  ARTICLES_CREATE: {
    deliveryMethod: "http",
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body) => {
      try {
        await ArticleSyncService.handleArticleWebhook(topic, shop, body);
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
        await ArticleSyncService.handleArticleWebhook(topic, shop, body);
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
        await ArticleSyncService.handleArticleWebhook(topic, shop, body);
      } catch (err) {
        console.error("ARTICLES_DELETE webhook error:", err);
      }
    },
  },
};

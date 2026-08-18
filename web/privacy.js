import { DeliveryMethod } from "@shopify/shopify-api";
import { prisma } from "./shopify.js";

/**
 * @type {{[key: string]: import("@shopify/shopify-api").WebhookHandler}}
 */
export default {
  /**
   * Customers can request their data from a store owner. When this happens,
   * Shopify invokes this privacy webhook.
   *
   * This app never stores customer-identifying data (no customer id/email/phone
   * anywhere in the schema — order attribution is tracked per-post, not per-customer,
   * and analytics events are anonymous page views). There is nothing to compile or
   * return for this request; logging it is the only action needed.
   *
   * https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks#customers-data_request
   */
  CUSTOMERS_DATA_REQUEST: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body) => {
      try {
        const payload = JSON.parse(body);
        console.log(
          `[Privacy] CUSTOMERS_DATA_REQUEST for shop ${shop}, customer ${payload?.customer?.id} — no customer-identifying data is stored by this app; nothing to return.`
        );
      } catch (err) {
        console.error("CUSTOMERS_DATA_REQUEST webhook error:", err);
      }
    },
  },

  /**
   * Store owners can request that data is deleted on behalf of a customer. When
   * this happens, Shopify invokes this privacy webhook.
   *
   * Same reasoning as CUSTOMERS_DATA_REQUEST — this app holds no customer-identifying
   * data to redact.
   *
   * https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks#customers-redact
   */
  CUSTOMERS_REDACT: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body) => {
      try {
        const payload = JSON.parse(body);
        console.log(
          `[Privacy] CUSTOMERS_REDACT for shop ${shop}, customer ${payload?.customer?.id} — no customer-identifying data is stored by this app; nothing to redact.`
        );
      } catch (err) {
        console.error("CUSTOMERS_REDACT webhook error:", err);
      }
    },
  },

  /**
   * 48 hours after a store owner uninstalls your app, Shopify invokes this
   * privacy webhook. Unlike the two above, this app DOES hold real shop data
   * (posts, sync state, analytics, settings, sessions) that must actually be
   * erased here, not just acknowledged.
   *
   * Deleting the Shop row cascades to every relation that references it
   * (Post, ShopSetting, ShopifyArticle, PostTranslation, etc. — all declared
   * onDelete: Cascade in schema.prisma). Session rows are a separate table
   * keyed by shop domain, not a foreign key relation, so they're cleared
   * explicitly.
   *
   * https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks#shop-redact
   */
  SHOP_REDACT: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop) => {
      try {
        await prisma.session.deleteMany({ where: { shop } });
        const deleted = await prisma.shop.deleteMany({ where: { domain: shop } });
        console.log(`[Privacy] SHOP_REDACT for ${shop} — deleted ${deleted.count} shop record(s) and all associated data.`);
      } catch (err) {
        console.error("SHOP_REDACT webhook error:", err);
      }
    },
  },
};

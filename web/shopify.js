// Load environment variables from root .env
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

import { shopifyApp } from "@shopify/shopify-app-express";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-10";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const shopify = shopifyApp({
  api: {
    apiVersion: "2024-10",
    restResources,
    future: {
      customerAddressDefaultFix: true,
      lineItemBilling: true,
      unstable_managedPricingSupport: true,
    },
    // Billing is handled dynamically via custom GraphQL in routes/billing.js
  },
  auth: {
    path: "/api/auth",
    callbackPath: "/api/auth/callback",
  },
  webhooks: {
    path: "/api/webhooks",
  },
  sessionStorage: new PrismaSessionStorage(prisma),
});

// Intercept callback to request expiring offline tokens
const originalCallback = shopify.api.auth.callback.bind(shopify.api.auth);
shopify.api.auth.callback = async function (params) {
  shopify.api.logger.info("OAuth callback interceptor: requesting expiring offline access token");
  return originalCallback({
    ...params,
    expiring: true,
  });
};

// Wrap session storage to automatically rotate expiring access tokens on retrieval
const sessionStorage = shopify.config.sessionStorage;
const originalLoadSession = sessionStorage.loadSession.bind(sessionStorage);
const originalFindSessionsByShop = sessionStorage.findSessionsByShop.bind(sessionStorage);

sessionStorage.loadSession = async function (id) {
  const session = await originalLoadSession(id);
  if (!session) return session;

  // Check if session has a refresh token and is expired or expiring in the next 5 minutes
  const isExpiredOrExpiringSoon = session.expires && (session.expires.getTime() - 300000 < Date.now());

  if (session.refreshToken && isExpiredOrExpiringSoon) {
    try {
      shopify.api.logger.info(`Session ${id} is expired or expiring soon (expires at ${session.expires}). Attempting automatic token rotation using refresh token...`, { shop: session.shop });
      
      const { session: newSession } = await shopify.api.auth.refreshToken({
        shop: session.shop,
        refreshToken: session.refreshToken,
      });

      // Keep the same session ID
      newSession.id = id;

      shopify.api.logger.info(`Successfully rotated token for shop: ${session.shop}. Storing updated session.`, { shop: session.shop });
      await sessionStorage.storeSession(newSession);
      return newSession;
    } catch (error) {
      shopify.api.logger.error(`Automatic token rotation failed for shop ${session.shop}: ${error.message}`, { shop: session.shop });
    }
  }

  return session;
};

sessionStorage.findSessionsByShop = async function (shop) {
  const sessions = await originalFindSessionsByShop(shop);
  if (!sessions || sessions.length === 0) return sessions;

  const refreshedSessions = [];
  for (const session of sessions) {
    const isExpiredOrExpiringSoon = session.expires && (session.expires.getTime() - 300000 < Date.now());

    if (session.refreshToken && isExpiredOrExpiringSoon) {
      try {
        shopify.api.logger.info(`Session ${session.id} loaded in findSessionsByShop is expired or expiring soon (expires at ${session.expires}). Attempting automatic token rotation...`, { shop });
        
        const { session: newSession } = await shopify.api.auth.refreshToken({
          shop: session.shop,
          refreshToken: session.refreshToken,
        });

        // Keep the same session ID
        newSession.id = session.id;

        shopify.api.logger.info(`Successfully rotated token for shop ${shop} in findSessionsByShop. Storing updated session.`, { shop });
        await sessionStorage.storeSession(newSession);
        refreshedSessions.push(newSession);
      } catch (error) {
        shopify.api.logger.error(`Automatic token rotation failed for shop ${shop} in findSessionsByShop: ${error.message}`, { shop });
        refreshedSessions.push(session);
      }
    } else {
      refreshedSessions.push(session);
    }
  }

  return refreshedSessions;
};

export { prisma };
export default shopify;

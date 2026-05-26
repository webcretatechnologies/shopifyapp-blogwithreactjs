// Load environment variables from root .env
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

import { BillingInterval, LATEST_API_VERSION } from "@shopify/shopify-api";
import { shopifyApp } from "@shopify/shopify-app-express";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-10";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Billing plans for the Blogger app
const billingConfig = {
  "Blogger Starter": {
    amount: 4.99,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
  },
  "Blogger Pro": {
    amount: 9.99,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
  },
  "Blogger Business": {
    amount: 19.99,
    currencyCode: "USD",
    interval: BillingInterval.Every30Days,
  },
};

const shopify = shopifyApp({
  api: {
    apiVersion: LATEST_API_VERSION,
    restResources,
    future: {
      customerAddressDefaultFix: true,
      lineItemBilling: true,
      unstable_managedPricingSupport: true,
    },
    billing: billingConfig,
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

export { prisma };
export default shopify;

import { prisma } from "../../shopify.js";

/**
 * One-time AI-credit top-up packs, sold via Shopify's AppPurchaseOneTime billing API
 * (POST /api/ai/credit-packs/purchase) as an alternative to changing plans just to generate a
 * few more articles. Super Admin's Pricing module owns these rows (AiCreditPack) the same way it
 * owns SubscriptionPlan - this file is just the shared read layer both the merchant-facing route
 * and Super Admin's CRUD routes go through.
 */

// Only packs a merchant can actually buy right now - excludes anything Super Admin deactivated.
export async function listActiveAiCreditPacks() {
  return prisma.aiCreditPack.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getActiveAiCreditPack(key) {
  return prisma.aiCreditPack.findFirst({ where: { key, isActive: true } });
}

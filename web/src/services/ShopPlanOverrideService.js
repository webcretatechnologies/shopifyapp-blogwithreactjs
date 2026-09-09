import { prisma } from "../../shopify.js";

// Single source of truth for reading a Super Admin plan override. An override row can outlive
// its usefulness in two ways — its expiresAt date has passed, or a caller just wants to know
// whether one is currently in force — so every write path that could otherwise clobber
// shop.planKey (billing's Shopify-subscription sync, webhooks, downgrade-to-free, etc.) must
// route through here instead of reading shop.planKey/ShopPlanOverride directly.
export async function getActiveOverride(shopDomain) {
  const override = await prisma.shopPlanOverride.findUnique({ where: { shopDomain } });
  if (!override) return null;

  if (override.expiresAt && override.expiresAt <= new Date()) {
    // Expired — clear it so the audit table stops showing a stale "Yes (Plan)" badge and future
    // lookups skip straight to the null case instead of re-deriving "expired" every call.
    await prisma.shopPlanOverride.delete({ where: { shopDomain } }).catch(() => {});
    return null;
  }

  return override;
}

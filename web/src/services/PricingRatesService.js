// Single source of truth for resolving Shop.planKey to a live SubscriptionPlan price. Previously
// this logic was duplicated 3x in superAdmin.js as a hardcoded free/starter/pro/business
// substring-matching table — stale and wrong whenever plans were renamed or a tier removed (it
// kept showing a "Business Plan" bucket for months after that tier was deleted from
// SubscriptionPlan). `priceForPlanKey` below works off Shop.planKey's *exact* stored value
// against whatever plans exist right now, so renamed/added/removed tiers are picked up
// automatically with no code change here.

/** Live SubscriptionPlan rows, price coerced to a number. */
export async function getLivePlans(prisma) {
  const dbPlans = await prisma.subscriptionPlan.findMany();
  return dbPlans.map((p) => ({ name: p.name, price: parseFloat(p.price) }));
}

/**
 * Resolves a Shop.planKey (which stores either "free" or the exact SubscriptionPlan.name it was
 * set from) to its live price and a human label — no hardcoded tier names, works for any plan
 * that exists in SubscriptionPlan right now, including ones added after this code was written.
 */
export function priceForPlanKey(planKey, livePlans) {
  const key = planKey || "free";
  if (key.toLowerCase() === "free") return { label: "Free Plan", price: 0 };
  const exact = livePlans.find((p) => p.name === key);
  if (exact) return { label: exact.name, price: exact.price };
  // Legacy/removed plan still referenced by an old Shop row — show it with $0 rather than
  // silently dropping it from any breakdown, so stale data stays visible instead of vanishing.
  return { label: key, price: 0 };
}

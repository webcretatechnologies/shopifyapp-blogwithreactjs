/**
 * CouponService — SaaS subscription discount codes (Billing Coupons).
 *
 * Shared validation/pricing logic used by both the preview endpoint
 * (POST /api/billing/coupon/validate, client-side UX only) and the real charge path
 * (POST /api/billing/request, which re-runs this exact same validation server-side — the preview
 * is never trusted for the actual discount that gets sent to Shopify).
 *
 * "Used" for totalUses/usesPerStore purposes = claims with status APPROVED, full stop. PENDING
 * never counts, no matter how recently created.
 *
 * This used to also count a PENDING claim within a 1-hour grace window of creation, on the theory
 * that it deterred rapid-fire retries of the same code. That doesn't hold up: querying Shopify
 * directly for a subscription the merchant simply navigated away from (closed the tab, hit back —
 * as opposed to an explicit Decline) shows it staying PENDING indefinitely, with no webhook fired
 * for it — there is no way to distinguish "still deciding" from "already walked away" for this
 * case. Any window built on PENDING status is therefore guessing, and blocked real, legitimate
 * cancellations for however long the window lasted. Accepted trade-off: an abandoned checkout can
 * now be retried immediately and as many times as the merchant wants — it costs nothing on
 * Shopify's side either way, and that was judged strictly better than blocking real
 * cancellations. If abuse resistance is wanted later, it needs a different signal entirely (e.g.
 * IP/session rate-limiting at the API layer) — not a revived status-based grace window.
 */
import { prisma } from "../../shopify.js";

// Exported so Super Admin's coupon usage-count badge (superAdmin.js) can apply the exact same
// "counted" definition as real enforcement — a duplicate, drifted copy of this predicate is
// exactly how a past bug went unnoticed: the admin's usage number and the actual limit check
// disagreed with each other.
export function countedClaimsWhere(extra) {
  return { ...extra, status: "APPROVED" };
}

export function couponDiscountLabel(coupon) {
  return coupon.discountType === "PERCENTAGE"
    ? `${Number(coupon.percentOff)}% off`
    : `$${Number(coupon.amountOff).toFixed(2)} off`;
}

/** Rounds to 2 decimals, never below 0. */
export function applyCouponDiscount(price, coupon) {
  if (coupon.discountType === "PERCENTAGE") {
    return Math.max(0, Math.round(price * (1 - Number(coupon.percentOff) / 100) * 100) / 100);
  }
  return Math.max(0, Math.round((price - Number(coupon.amountOff)) * 100) / 100);
}

/**
 * Validates a coupon code for a given shop (and optionally a specific plan tier — the
 * SubscriptionPlan.name being purchased). Returns { ok: true, coupon } with every field the
 * frontend needs (including a resolved `planTiers` array so ineligible plan cards can be greyed
 * out client-side), or { ok: false, error }.
 */
export async function validateCouponForShop(code, shopDomain, planTier = null) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  if (!normalizedCode) return { ok: false, error: "Enter a coupon code." };

  const coupon = await prisma.coupon.findUnique({
    where: { code: normalizedCode },
    include: { plans: { include: { plan: true } } },
  });
  if (!coupon) return { ok: false, error: "This coupon code doesn't exist." };
  if (!coupon.active) return { ok: false, error: "This coupon is no longer active." };

  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt) {
    return { ok: false, error: "This coupon isn't active yet." };
  }
  if (coupon.endsAt && now > coupon.endsAt) {
    return { ok: false, error: "This coupon has expired." };
  }

  if (coupon.totalUses !== null) {
    const totalClaims = await prisma.couponClaim.count({
      where: countedClaimsWhere({ couponId: coupon.id }),
    });
    if (totalClaims >= coupon.totalUses) {
      return { ok: false, error: "This coupon has reached its usage limit." };
    }
  }

  const storeClaims = await prisma.couponClaim.count({
    where: countedClaimsWhere({ couponId: coupon.id, shopDomain }),
  });
  if (storeClaims >= coupon.usesPerStore) {
    return { ok: false, error: "You've already used this coupon." };
  }

  let planTiers = null; // null = applies to all paid plans, no restriction to report
  if (coupon.appliesTo === "SPECIFIC_PLANS") {
    planTiers = coupon.plans.map((cp) => cp.plan.name);
    if (planTier && !planTiers.includes(planTier)) {
      return { ok: false, error: "This coupon doesn't apply to the selected plan." };
    }
  } else if (coupon.appliesTo === "SPECIFIC_STORES") {
    const eligible = await prisma.couponShop.findUnique({
      where: { couponId_shopDomain: { couponId: coupon.id, shopDomain } },
    }).catch(() => null);
    if (!eligible) return { ok: false, error: "This coupon isn't available for your store." };
  }

  // Fixed-amount coupons can be created against one plan's price and later reused against a
  // cheaper one (or a coupon can simply be misconfigured) — Shopify's own appSubscriptionCreate
  // rejects a discount.value.amount >= the plan's price outright ("Discount amount must be less
  // than or equal to X"), surfacing a raw API error to the merchant instead of a clean message.
  // Percentage coupons are excluded here — they're already capped at 99% in
  // validateCouponPayload/the admin form, so they can never reach or exceed 100% of any price.
  // Placed as the last check (after scoping) since it needs a resolved plan to price-check
  // against — a coupon that's already ineligible for this plan should fail with the scoping
  // error above, not this one.
  if (coupon.discountType === "FIXED_AMOUNT" && planTier) {
    const plan = await prisma.subscriptionPlan.findUnique({ where: { name: planTier } });
    if (plan && Math.round(Number(coupon.amountOff) * 100) >= Math.round(Number(plan.price) * 100)) {
      return { ok: false, error: "This coupon's discount amount is too large for the selected plan." };
    }
  }

  return {
    ok: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      percentOff: coupon.percentOff !== null ? Number(coupon.percentOff) : null,
      amountOff: coupon.amountOff !== null ? Number(coupon.amountOff) : null,
      durationMonths: coupon.durationMonths,
      description: coupon.description,
      appliesTo: coupon.appliesTo,
      planTiers,
    },
  };
}

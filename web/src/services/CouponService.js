/**
 * CouponService — SaaS subscription discount codes (Billing Coupons).
 *
 * Shared validation/pricing logic used by both the preview endpoint
 * (POST /api/billing/coupon/validate, client-side UX only) and the real charge path
 * (POST /api/billing/request, which re-runs this exact same validation server-side — the preview
 * is never trusted for the actual discount that gets sent to Shopify).
 *
 * "Used" for totalUses/usesPerStore purposes = claims with status PENDING or APPROVED (a real
 * charge attempt happened); DECLINED/CANCELLED/EXPIRED don't count against the limit.
 */
import { prisma } from "../../shopify.js";

const COUNTED_CLAIM_STATUSES = ["PENDING", "APPROVED"];

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
      where: { couponId: coupon.id, status: { in: COUNTED_CLAIM_STATUSES } },
    });
    if (totalClaims >= coupon.totalUses) {
      return { ok: false, error: "This coupon has reached its usage limit." };
    }
  }

  const storeClaims = await prisma.couponClaim.count({
    where: { couponId: coupon.id, shopDomain, status: { in: COUNTED_CLAIM_STATUSES } },
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

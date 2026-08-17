/**
 * CouponService — SaaS subscription discount codes (Billing Coupons).
 *
 * Shared validation/pricing logic used by both the preview endpoint
 * (POST /api/billing/coupon/validate, client-side UX only) and the real charge path
 * (POST /api/billing/request, which re-runs this exact same validation server-side — the preview
 * is never trusted for the actual discount that gets sent to Shopify).
 *
 * "Used" for totalUses/usesPerStore purposes = claims with status APPROVED, or status PENDING
 * and still recent (see PENDING_CLAIM_GRACE_MS) — DECLINED/CANCELLED/EXPIRED never count.
 *
 * Nothing in this codebase ever actually transitions a claim to DECLINED/CANCELLED/EXPIRED (the
 * only status write anywhere is PENDING -> APPROVED, in GET /api/billing/check, and only once
 * Shopify reports the matching subscription active) — so a merchant who closes the Shopify
 * approval tab, or explicitly declines, leaves a claim stuck at PENDING forever. Without the
 * recency check below, that claim would count against usesPerStore/totalUses permanently, even
 * though no discount was ever actually granted — directly contradicting this service's own
 * documented behavior above and the Super Admin coupon UI's help text ("an abandoned checkout
 * does not burn a use"). A real Shopify approval redirect completes in well under a minute;
 * anything still PENDING after the grace window is treated as abandoned, not in-flight.
 */
import { prisma } from "../../shopify.js";

const PENDING_CLAIM_GRACE_MS = 60 * 60 * 1000; // 1 hour

// Exported so Super Admin's coupon usage-count badge (superAdmin.js) can apply the exact same
// "counted" definition as real enforcement — a duplicate, drifted copy of this predicate is
// exactly how the bug this comment is attached to went unnoticed: the admin's usage number and
// the actual limit check disagreed with each other.
export function countedClaimsWhere(extra) {
  return {
    ...extra,
    OR: [
      { status: "APPROVED" },
      { status: "PENDING", createdAt: { gte: new Date(Date.now() - PENDING_CLAIM_GRACE_MS) } },
    ],
  };
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

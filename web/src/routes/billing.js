import express from "express";
import shopify, { prisma } from "../../shopify.js";
import { getArticleLimit, buildTieredPlanFeatures } from "../services/PlanFeatureService.js";
import { validateCouponForShop, applyCouponDiscount } from "../services/CouponService.js";

const router = express.Router();

// Get all dynamic active plans
router.get("/plans", async (req, res) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    // Price-ascending, matching the order the pricing page itself sorts cards into — the "based
    // on" plan a diffed bullet list refers to has to be the same one the merchant sees to its
    // immediate left.
    const byPriceAsc = [...plans].sort((a, b) => Number(a.price) - Number(b.price));
    const tiered = buildTieredPlanFeatures(byPriceAsc.map((p) => p.name));
    // Replaces the plan's own stored `features` marketing copy with a checklist built straight
    // from its live PlanFeature gating (Sync Features/Sync Limits in Super Admin) — what the
    // merchant sees now always matches what they actually get, and each tier only lists what's
    // new versus the plan below it instead of repeating shared baseline features on every card.
    const plansWithFeatures = byPriceAsc.map((plan, index) => ({
      ...plan,
      features: tiered[index].bullets,
      basedOnPlanTitle: tiered[index].basedOnIndex !== null ? byPriceAsc[tiered[index].basedOnIndex].title : null,
    }));
    res.json({ plans: plansWithFeatures });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch plans" });
  }
});

// Get current billing status using GraphQL
router.get("/check", async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    
    // Fetch shop details from DB first to get post count
    const shop = await prisma.shop.findUnique({
      where: { domain: session.shop }
    });

    let postCount = 0;
    if (shop) {
      postCount = await prisma.post.count({
        where: { shopId: shop.id }
      });
    }

    const client = new shopify.api.clients.Graphql({ session });
    
    const response = await client.request(`
      query {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
          }
        }
      }
    `);

    const subscriptions = response.data?.currentAppInstallation?.activeSubscriptions || [];
    const activeSub = subscriptions.find(sub => sub.status === "ACTIVE");

    let activePlan = "free";

    if (activeSub) {
      activePlan = activeSub.name;
      // Sync shop planKey in database if it differs
      if (shop && shop.planKey !== activePlan) {
        await prisma.shop.update({
          where: { id: shop.id },
          data: { planKey: activePlan }
        });
      }

      // Reconcile any pending coupon claim now that Shopify confirms this subscription is
      // actually active — a discount can only ever be attached at appSubscriptionCreate time, so
      // this is just bookkeeping (the discount itself is already live on the real subscription
      // regardless of this flag), but it lets the admin panel show real APPROVED counts instead
      // of everything sitting at PENDING forever. Best-effort: never blocks the billing check.
      try {
        await prisma.couponClaim.updateMany({
          where: { shopifyChargeId: activeSub.id, status: "PENDING" },
          data: { status: "APPROVED" },
        });
      } catch (err) {
        console.error("Failed to reconcile coupon claim status:", err);
      }
    } else {
      // Fallback to check DB
      const dbPlan = await prisma.appPlan.findFirst({
        where: { shopId: shop?.id, isActive: true },
        orderBy: { createdAt: 'desc' }
      });
      if (dbPlan) {
        activePlan = dbPlan.planKey;
      } else {
        // Ensure DB reflects it's on free tier
        if (shop && shop.planKey !== "free") {
          await prisma.shop.update({
            where: { id: shop.id },
            data: { planKey: "free" }
          });
        }
      }
    }

    // Article limit is sourced from PlanFeatureService's DB-backed "article_limit" PlanFeature
    // row (the same source Super Admin's Sync Limits modal edits) — previously this route kept
    // its own separate hardcoded copy, so an admin editing article_limit had no effect here and
    // the merchant billing page could show a stale limit.
    const postLimit = getArticleLimit(activePlan);

    res.status(200).json({ activePlan, postCount, postLimit });
  } catch (error) {
    console.error("Failed to check billing:", error);
    res.status(500).json({ error: "Failed to check billing status" });
  }
});

// Request a new subscription using GraphQL
router.post("/request", async (req, res) => {
  try {
        const session = res.locals.shopify.session;
    const { plan, host, couponCode } = req.body;

    if (plan === "free") {
      return res.status(200).json({ confirmationUrl: null, isFree: true });
    }

    // Fetch the dynamic plan details from DB
    const dbPlan = await prisma.subscriptionPlan.findUnique({
      where: { name: plan }
    });

    if (!dbPlan || !dbPlan.isActive) {
      return res.status(400).json({ error: "Invalid or inactive plan selected" });
    }

    // Re-validate the coupon server-side even though the client already previewed it via
    // /coupon/validate — that preview is only a UX convenience, never trusted for the actual
    // discount sent to Shopify. A stale/expired/already-used code submitted anyway is silently
    // ignored (the subscription still proceeds at full price) rather than blocking the upgrade.
    let appliedCoupon = null;
    if (couponCode) {
      const couponResult = await validateCouponForShop(couponCode, session.shop, dbPlan.name);
      if (couponResult.ok) appliedCoupon = couponResult.coupon;
    }

    // Fetch the test mode setting
    const testModeSetting = await prisma.adminSetting.findUnique({
      where: { key: "billing_test_mode" }
    });
    const isTestMode = testModeSetting ? testModeSetting.value === "true" : true;

    let returnUrl = `https://${shopify.api.config.hostName}/?shop=${session.shop}`;
    if (host) {
      returnUrl += `&host=${encodeURIComponent(host)}`;
    }
    const client = new shopify.api.clients.Graphql({ session });

    // Use EVERY_30_DAYS or ANNUAL
    let interval = dbPlan.interval === "ANNUAL" ? "ANNUAL" : "EVERY_30_DAYS";

    const mutation = `
      mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean, $trialDays: Int) {
        appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, test: $test, trialDays: $trialDays) {
          appSubscription {
            id
          }
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      name: dbPlan.name,
      returnUrl: returnUrl,
      test: isTestMode,
      // 0/undefined/null all mean "no trial" to Shopify's API — dbPlan.trialDays defaults to 0
      // in the DB, so this only sends a real value when Super Admin's Edit Core modal set one.
      trialDays: dbPlan.trialDays > 0 ? dbPlan.trialDays : undefined,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: {
                amount: parseFloat(dbPlan.price),
                currencyCode: dbPlan.currency || "USD"
              },
              interval: interval,
              // discount is nested inside this same AppSubscriptionLineItemInput object, not a
              // separate top-level mutation argument — confirmed against the live Admin GraphQL
              // schema (percentage is a 0-1 fraction, e.g. 0.2 for 20% off, not 20).
              ...(appliedCoupon
                ? {
                    discount: {
                      durationLimitInIntervals: appliedCoupon.durationMonths,
                      value: appliedCoupon.discountType === "PERCENTAGE"
                        ? { percentage: appliedCoupon.percentOff / 100 }
                        : { amount: appliedCoupon.amountOff },
                    },
                  }
                : {}),
            }
          }
        }
      ]
    };

    const response = await client.request(mutation, { variables });
    const data = response.data?.appSubscriptionCreate;

    if (data?.userErrors?.length > 0) {
      console.error("GraphQL billing errors:", data.userErrors);
      return res.status(400).json({ error: data.userErrors[0].message });
    }

    // Record the coupon claim now that Shopify has accepted the subscription (the discount is
    // already locked in on Shopify's side regardless of this — this is bookkeeping for the admin
    // panel's usage counts, not something the charge itself depends on).
    const shopifyChargeId = data?.appSubscription?.id;
    if (appliedCoupon && shopifyChargeId) {
      const discountedPrice = applyCouponDiscount(parseFloat(dbPlan.price), appliedCoupon);
      await prisma.couponClaim.create({
        data: {
          couponId: appliedCoupon.id,
          shopDomain: session.shop,
          planTier: dbPlan.name,
          priceBeforeDiscount: dbPlan.price,
          discountedPrice,
          currencyCode: dbPlan.currency || "USD",
          status: "PENDING",
          shopifyChargeId,
        },
      }).catch((err) => console.error("Failed to record coupon claim:", err));
    }

    res.status(200).json({ confirmationUrl: data.confirmationUrl });
  } catch (error) {
    console.error("Failed to request billing:", error);
    res.status(500).json({ error: "Failed to request billing" });
  }
});

// Preview a coupon code before committing to a plan — never trusted for the real charge (see
// the re-validation inside POST /request above).
router.post("/coupon/validate", async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const { code, planTier } = req.body;
    const result = await validateCouponForShop(code, session.shop, planTier || null);
    res.status(200).json(result);
  } catch (error) {
    console.error("Failed to validate coupon:", error);
    res.status(500).json({ ok: false, error: "Failed to validate coupon" });
  }
});

export default router;

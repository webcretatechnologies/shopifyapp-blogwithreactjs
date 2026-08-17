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
    // Bullet-diffing needs a strict low-to-high price order internally — each tier's bullets are
    // computed as "what's new vs the plan directly below it in price" — so this pass always runs
    // price-ascending regardless of the admin's chosen display order.
    const byPriceAsc = [...plans].sort((a, b) => Number(a.price) - Number(b.price));
    const tiered = buildTieredPlanFeatures(byPriceAsc.map((p) => p.name));
    const featuresByPlanId = new Map(
      byPriceAsc.map((plan, index) => [
        plan.id,
        {
          features: tiered[index].bullets,
          basedOnPlanTitle: tiered[index].basedOnIndex !== null ? byPriceAsc[tiered[index].basedOnIndex].title : null,
        },
      ])
    );
    // Card *display* order, however, is the admin's own Sort Order (already the `plans` array's
    // order, per the query above) — previously this route discarded that entirely and always
    // returned price-ascending, so editing Sort Order in Super Admin had no visible effect on the
    // real merchant Billing page.
    const plansWithFeatures = plans.map((plan) => ({
      ...plan,
      ...featuresByPlanId.get(plan.id),
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
            test
            trialDays
            createdAt
            currentPeriodEnd
          }
        }
      }
    `);

    const subscriptions = response.data?.currentAppInstallation?.activeSubscriptions || [];
    const activeSub = subscriptions.find(sub => sub.status === "ACTIVE");

    let activePlan = "free";

    // Shopify's activeSubscriptions query can still report a just-cancelled subscription as
    // ACTIVE for a few seconds after appSubscriptionCancel (ordinary eventual consistency on
    // Shopify's side) — blindly trusting it here would resync shop.planKey back to the old paid
    // plan right after a merchant's downgrade-to-free went through, undoing it. Give a brief
    // grace window after any local planKey write before trusting Shopify's live subscription
    // list over what we already know locally.
    // Shop.updatedAt is Prisma's own @updatedAt column, already bumped by the free-downgrade
    // route's prisma.shop.update({ planKey: "free" }) call — no schema change needed to use it
    // as a "was this shop record just touched" signal for the grace window below.
    const RECENT_LOCAL_CHANGE_MS = 30_000;
    const planWasJustChangedLocally =
      shop?.updatedAt && Date.now() - new Date(shop.updatedAt).getTime() < RECENT_LOCAL_CHANGE_MS;

    const trustLocalFreeOverStaleShopify = planWasJustChangedLocally && shop?.planKey === "free";

    if (activeSub && !trustLocalFreeOverStaleShopify) {
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
    } else if (activeSub && trustLocalFreeOverStaleShopify) {
      // Trust the recent local cancellation over Shopify's still-stale ACTIVE read.
      activePlan = "free";
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

    // Trial/renewal info — only meaningful when there's a real active subscription (Free has
    // neither a trial clock nor a renewal date).
    let billingCycle = null;
    if (activeSub) {
      const trialDays = activeSub.trialDays || 0;
      const createdAt = activeSub.createdAt ? new Date(activeSub.createdAt) : null;
      const trialEndsAt = trialDays > 0 && createdAt
        ? new Date(createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000)
        : null;
      const isTrial = trialEndsAt ? trialEndsAt > new Date() : false;
      const trialDaysRemaining = isTrial
        ? Math.max(0, Math.ceil((trialEndsAt - new Date()) / (24 * 60 * 60 * 1000)))
        : 0;
      billingCycle = {
        isTrial,
        trialDaysRemaining,
        trialEndsAt,
        renewsOn: activeSub.currentPeriodEnd || null,
        isTestCharge: !!activeSub.test,
      };
    }

    res.status(200).json({
      activePlan, postCount, postLimit,
      billingCycle,
    });
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
      // Previously this just returned success without doing anything — no real Shopify
      // subscription was ever cancelled and shop.planKey never changed, so a merchant on a paid
      // plan who clicked "Downgrade to Free" saw a success toast while silently staying on their
      // current plan (and kept being billed for it). Actually cancel whatever subscription is
      // live, same as any other billing-state change, before reporting success.
      const client = new shopify.api.clients.Graphql({ session });
      const activeRes = await client.request(`
        query {
          currentAppInstallation {
            activeSubscriptions { id status }
          }
        }
      `);
      const activeSub = (activeRes.data?.currentAppInstallation?.activeSubscriptions || [])
        .find((sub) => sub.status === "ACTIVE");

      if (activeSub) {
        const cancelRes = await client.request(`
          mutation CancelSubscription($id: ID!) {
            appSubscriptionCancel(id: $id) {
              appSubscription { id status }
              userErrors { field message }
            }
          }
        `, { variables: { id: activeSub.id } });

        const userErrors = cancelRes.data?.appSubscriptionCancel?.userErrors;
        if (userErrors?.length > 0) {
          return res.status(400).json({ error: userErrors[0].message });
        }
      }

      const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
      if (shop && shop.planKey !== "free") {
        await prisma.shop.update({ where: { id: shop.id }, data: { planKey: "free" } });
      }

      // Return the confirmed final state directly instead of making the frontend immediately
      // re-fetch it from GET /check. Right after appSubscriptionCancel above, Shopify's own
      // activeSubscriptions query can still report the just-cancelled subscription as ACTIVE for
      // a few seconds (ordinary eventual consistency on Shopify's side) — /check's own "sync
      // planKey from Shopify" logic would then see that stale ACTIVE subscription and overwrite
      // the planKey:"free" we just correctly set back to the old paid plan, so the merchant saw
      // a success toast but the page's own next data load showed the downgrade hadn't happened
      // (only a hard refresh, some time later once Shopify caught up, showed it correctly). We
      // just cancelled it ourselves and confirmed no userErrors, so this response IS the source
      // of truth — no need to ask Shopify again immediately.
      const postCount = shop ? await prisma.post.count({ where: { shopId: shop.id } }) : 0;
      return res.status(200).json({
        confirmationUrl: null,
        isFree: true,
        activePlan: "free",
        postCount,
        postLimit: getArticleLimit("free"),
        billingCycle: null,
      });
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

    // Test mode is controlled by BILLING_TEST_MODE in the root .env — while it's set, every
    // appSubscriptionCreate call goes through as a Shopify "test charge" (no real money moves,
    // shows a "This is a test charge" banner on Shopify's approval screen). Flip it to "false"
    // once real, paying charges should go out. Previously this was a DB row toggled from a Super
    // Admin UI control that no longer exists — env var is the new single source of truth.
    const isTestMode = process.env.BILLING_TEST_MODE !== "false";

    // Lands back on the Plans & Billing page itself (not the app root) with a `subscribed=1`
    // flag — plans.jsx uses that to show a real Shopify success toast once the merchant returns
    // from Shopify's own approval screen, instead of silently dropping them on the dashboard with
    // no confirmation that the upgrade actually went through.
    let returnUrl = `https://${shopify.api.config.hostName}/plans?shop=${session.shop}&subscribed=1`;
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

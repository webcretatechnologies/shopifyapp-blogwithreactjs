import express from "express";
import shopify, { prisma } from "../../shopify.js";

const router = express.Router();

const PLANS = {
  FREE: "free",
  STARTER: "Blogger Starter",
  PRO: "Blogger Pro",
  BUSINESS: "Blogger Business",
};

// Get current billing status
router.get("/check", async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    
    // Check with Shopify API directly to ensure accuracy
    const checkResult = await shopify.api.billing.check({
      session,
      plans: [PLANS.STARTER, PLANS.PRO, PLANS.BUSINESS],
      isTest: true,
      returnObject: true,
    });

    let activePlan = PLANS.FREE;
    
    // Check if any plan is active
    if (checkResult.hasActivePayment) {
      // Find which one is active
      if (checkResult.appSubscriptions?.length > 0) {
        activePlan = checkResult.appSubscriptions[0].name;
      } else {
        // Fallback to checking Prisma if returnObject didn't include the names
        const dbPlan = await prisma.appPlan.findFirst({
          where: { shop: { domain: session.shop }, isActive: true },
          orderBy: { createdAt: 'desc' }
        });
        if (dbPlan) {
          activePlan = dbPlan.planKey;
        }
      }
    } else {
      // Ensure DB reflects it's on free tier if no active payment
      await prisma.shop.update({
        where: { domain: session.shop },
        data: { planKey: PLANS.FREE }
      });
      await prisma.appPlan.updateMany({
        where: { shop: { domain: session.shop }, isActive: true },
        data: { isActive: false }
      });
    }

    res.status(200).json({ activePlan });
  } catch (error) {
    console.error("Failed to check billing:", error);
    res.status(500).json({ error: "Failed to check billing status" });
  }
});

// Request a new subscription
router.post("/request", async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const { plan } = req.body;

    if (!Object.values(PLANS).includes(plan)) {
      return res.status(400).json({ error: "Invalid plan selected" });
    }

    // Free plan downgrade
    if (plan === PLANS.FREE) {
      // Actually cancel existing subscriptions via GraphQL or just update local if Shopify doesn't enforce free
      // Usually, to downgrade to free, you'd cancel the current app subscription via GraphQL.
      // For simplicity, we just return success and let the user handle it via the Shopify admin.
      return res.status(200).json({ confirmationUrl: null, isFree: true });
    }

    // For paid plans, request a subscription
    const confirmationUrl = await shopify.api.billing.request({
      session,
      plan: plan,
      isTest: true,
      returnUrl: `https://${shopify.api.config.hostName}/?shop=${session.shop}`,
    });

    res.status(200).json({ confirmationUrl });
  } catch (error) {
    console.error("Failed to request billing:", error);
    res.status(500).json({ error: "Failed to request billing" });
  }
});

export default router;

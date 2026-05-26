import express from "express";
import shopify, { prisma } from "../../shopify.js";

const router = express.Router();

// Get all dynamic active plans
router.get("/plans", async (req, res) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ plans });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch plans" });
  }
});

// Get current billing status using GraphQL
router.get("/check", async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    
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
    } else {
      // Fallback to check DB
      const dbPlan = await prisma.appPlan.findFirst({
        where: { shop: { domain: session.shop }, isActive: true },
        orderBy: { createdAt: 'desc' }
      });
      if (dbPlan) {
        activePlan = dbPlan.planKey;
      } else {
        // Ensure DB reflects it's on free tier
        await prisma.shop.update({
          where: { domain: session.shop },
          data: { planKey: "free" }
        });
      }
    }

    res.status(200).json({ activePlan });
  } catch (error) {
    console.error("Failed to check billing:", error);
    res.status(500).json({ error: "Failed to check billing status" });
  }
});

// Request a new subscription using GraphQL
router.post("/request", async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const { plan } = req.body;

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

    // Fetch the test mode setting
    const testModeSetting = await prisma.adminSetting.findUnique({
      where: { key: "billing_test_mode" }
    });
    const isTestMode = testModeSetting ? testModeSetting.value === "true" : true;

    const returnUrl = `https://${shopify.api.config.hostName}/?shop=${session.shop}`;
    const client = new shopify.api.clients.Graphql({ session });

    // Use EVERY_30_DAYS or ANNUAL
    let interval = dbPlan.interval === "ANNUAL" ? "ANNUAL" : "EVERY_30_DAYS";

    const mutation = `
      mutation appSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
        appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, test: $test) {
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
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: {
                amount: parseFloat(dbPlan.price),
                currencyCode: dbPlan.currency || "USD"
              },
              interval: interval
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

    res.status(200).json({ confirmationUrl: data.confirmationUrl });
  } catch (error) {
    console.error("Failed to request billing:", error);
    res.status(500).json({ error: "Failed to request billing" });
  }
});

export default router;

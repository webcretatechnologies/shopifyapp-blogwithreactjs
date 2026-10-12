import express from "express";
import shopify, { prisma } from "../../shopify.js";
import { listActiveAiCreditPacks, getActiveAiCreditPack } from "../services/AiCreditPackService.js";
import { reconcilePendingAiCreditPurchases } from "../services/AiCreditPurchaseService.js";
import { getAiCreditLimit, getAiCreditStatus, refreshAiCreditPeriod } from "../services/PlanFeatureService.js";
import { isBillingTestMode } from "../services/BillingModeService.js";

const router = express.Router();

async function getShopFromSession(res) {
  const session = res.locals.shopify?.session;
  if (!session?.shop) return null;
  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  return refreshAiCreditPeriod(shop, prisma);
}

async function reconcilePendingPurchases(session, shop) {
  if (!session || !shop) return;
  try {
    const graphqlClient = new shopify.api.clients.Graphql({ session });
    await reconcilePendingAiCreditPurchases({
      prisma,
      graphqlClient,
      shopId: shop.id,
    });
  } catch (error) {
    // Webhook delivery remains the fast path. A temporary reconciliation failure should not make
    // the billing page unavailable; the next page load/poll will try again.
    console.warn("Failed to reconcile pending AI credit purchases:", error.message);
  }
}

// Shopify redirects back to this URL after the merchant has dealt with its approval screen.
// Keep that redirect inside our embedded app: accepting an arbitrary URL here would create an
// open-redirect endpoint and could send a merchant away from Shopify altogether.
function safeReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/plans";
  }

  try {
    const parsed = new URL(value, "https://embedded-app.invalid");
    // These are assigned by the purchase endpoint below. Removing them here prevents a client
    // from accidentally inflating the URL by passing the embedded `host` token twice.
    parsed.searchParams.delete("host");
    parsed.searchParams.delete("shop");
    parsed.searchParams.delete("credits_purchased");
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/plans";
  }
}

// ─── GET /api/ai/credit-packs — pack options plus the shop's own current balance ──
router.get("/", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    let shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });
    await reconcilePendingPurchases(session, shop);
    // Reconciliation may have just incremented the purchased balance.
    shop = await prisma.shop.findUnique({ where: { id: shop.id } });

    const packs = await listActiveAiCreditPacks();
    const status = getAiCreditStatus(shop.planKey, shop.aiCreditsUsed || 0, shop.aiCreditsPurchased || 0, shop.aiCreditsPurchasedUsed || 0, shop.freeAiCreditsUsed || 0);
    res.json({
      // Decimal -> Number so the frontend gets a plain number to call .toFixed on, not a Prisma
      // Decimal object that would serialize to a string.
      packs: packs.map((p) => ({ ...p, price: Number(p.price) })),
      aiCreditsUsed: shop.aiCreditsUsed || 0,
      aiCreditsPurchased: shop.aiCreditsPurchased || 0,
      // The plan's own bare allowance (before purchases) — the UI uses this to tell whether
      // buying a pack even makes sense (an already-unlimited plan has nothing to top up).
      planCreditLimit: getAiCreditLimit(shop.planKey),
      effectiveCreditLimit: status.effectiveLimit,
      remaining: status.remaining,
    });
  } catch (error) {
    console.error("GET /api/ai/credit-packs", error);
    res.status(500).json({ error: "Failed to load AI credit packs" });
  }
});

// ─── GET /api/ai/credit-packs/latest-purchase — status of the shop's most recent purchase ──
// Polled by the shared AI-credit badge right after the merchant is redirected back from Shopify's
// own approval screen (?credits_purchased=1), so the success/error notification reflects what Shopify's
// app_purchases_one_time/update webhook actually confirmed (PENDING -> APPROVED, or -> DECLINED/
// CANCELLED/EXPIRED if the merchant backed out) instead of a static "thanks" shown regardless of
// outcome, or shown before the webhook has even landed.
router.get("/latest-purchase", async (req, res) => {
  try {
    const session = res.locals.shopify?.session;
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });
    await reconcilePendingPurchases(session, shop);

    const purchase = await prisma.aiCreditPurchase.findFirst({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
    });
    if (!purchase) return res.json({ purchase: null });

    res.json({
      purchase: {
        status: purchase.status,
        credits: purchase.credits,
        price: Number(purchase.price),
        createdAt: purchase.createdAt,
      },
    });
  } catch (error) {
    console.error("GET /api/ai/credit-packs/latest-purchase", error);
    res.status(500).json({ error: "Failed to load purchase status" });
  }
});

// ─── POST /api/ai/credit-packs/purchase — start a one-time AppPurchaseOneTime charge ──
router.post("/purchase", async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const shop = await getShopFromSession(res);
    if (!shop) return res.status(401).json({ error: "Unauthorized" });

    const { packKey, host, returnPath } = req.body || {};
    const pack = await getActiveAiCreditPack(packKey);
    if (!pack) {
      return res.status(400).json({ error: "Invalid credit pack selected" });
    }
    const packPrice = Number(pack.price);

    // A plan that's already unlimited has nothing for a pack to add to — block the purchase
    // rather than silently taking the merchant's money for credits that can never matter.
    if (getAiCreditLimit(shop.planKey) == null) {
      return res.status(400).json({ error: "Your current plan already includes unlimited AI credits." });
    }

    // Same BILLING_TEST_MODE convention as billing.js's subscription flow — while set, every
    // appPurchaseOneTimeCreate call goes through as a Shopify "test charge" (no real money
    // moves).
    const isTestMode = await isBillingTestMode("oneTime");

    // Send the merchant back to the screen from which they opened the credit picker. The shared
    // badge consumes `credits_purchased=1`, reconciles the Shopify charge, and displays the
    // outcome there instead of forcing the merchant through Plans & Billing.
    const returnUrl = new URL(safeReturnPath(returnPath), `https://${shopify.api.config.hostName}`);
    returnUrl.searchParams.set("shop", session.shop);
    returnUrl.searchParams.set("credits_purchased", "1");
    if (typeof host === "string" && host) returnUrl.searchParams.set("host", host);

    const client = new shopify.api.clients.Graphql({ session });
    const mutation = `
      mutation appPurchaseOneTimeCreate($name: String!, $price: MoneyInput!, $returnUrl: URL!, $test: Boolean) {
        appPurchaseOneTimeCreate(name: $name, price: $price, returnUrl: $returnUrl, test: $test) {
          appPurchaseOneTime { id }
          confirmationUrl
          userErrors { field message }
        }
      }
    `;
    const variables = {
      name: `${pack.credits} AI Credits`,
      price: { amount: packPrice, currencyCode: pack.currency || "USD" },
      returnUrl: returnUrl.toString(),
      test: isTestMode,
    };

    const response = await client.request(mutation, { variables });
    const data = response.data?.appPurchaseOneTimeCreate;

    if (data?.userErrors?.length > 0) {
      console.error("GraphQL one-time purchase errors:", data.userErrors);
      return res.status(400).json({ error: data.userErrors[0].message });
    }

    const shopifyPurchaseId = data?.appPurchaseOneTime?.id;
    if (!shopifyPurchaseId || !data?.confirmationUrl) {
      return res.status(500).json({ error: "Shopify did not return a purchase confirmation." });
    }

    // Recorded PENDING now, credited only once app_purchases_one_time/update confirms ACTIVE
    // (see index.js's webhook handler) — never optimistically here, since the merchant hasn't
    // actually approved the charge on Shopify's screen yet.
    await prisma.aiCreditPurchase.create({
      data: {
        shopId: shop.id,
        packKey: pack.key,
        credits: pack.credits,
        price: packPrice,
        currencyCode: pack.currency || "USD",
        status: "PENDING",
        shopifyPurchaseId,
        test: isTestMode,
      },
    });

    res.status(200).json({ confirmationUrl: data.confirmationUrl });
  } catch (error) {
    console.error("Failed to start AI credit pack purchase:", error);
    res.status(500).json({ error: "Failed to start purchase" });
  }
});

export default router;

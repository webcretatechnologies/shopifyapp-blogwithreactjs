import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  BlockStack,
  InlineStack,
  InlineGrid,
  Badge,
  Icon,
  Box,
  Divider,
  ProgressBar,
  Banner,
  TextField,
  Spinner,
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";
import { useState, useEffect } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { TitleBar } from "@shopify/app-bridge-react";
import { smartBackAction } from "../utils/smartBack";
import ConfirmActionModal from "../components/ConfirmActionModal";
import PlanUsageMeters from "../components/PlanUsageMeters";

function intervalSuffix(interval) {
  return interval === "ANNUAL" ? "/year" : "/month";
}

// Returns null (not a clamped near-zero number) when a fixed-amount coupon is too large for this
// specific plan's price — Shopify's own appSubscriptionCreate rejects discount.value.amount >=
// price outright, so clamping the displayed price to $0.01 would show a discount that could never
// actually be applied here. Callers fall back to the plan's real full price when this returns
// null. Percentage coupons can never hit this (already capped at 99% server-side).
function applyCouponDiscount(price, coupon) {
  if (coupon.discountType === "PERCENTAGE") {
    return Math.max(0, Math.round(price * (1 - Number(coupon.percentOff) / 100) * 100) / 100);
  }
  if (Number(coupon.amountOff) >= price) return null;
  return Math.max(0, Math.round((price - Number(coupon.amountOff)) * 100) / 100);
}

export default function Plans() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activePlan, setActivePlan] = useState("");
  const [postCount, setPostCount] = useState(0);
  const [postLimit, setPostLimit] = useState(10);
  // Saved templates are the app's second plan cap (PlanFeature "template_limit"); null =
  // unlimited, same convention as postLimit.
  const [templateCount, setTemplateCount] = useState(0);
  const [templateLimit, setTemplateLimit] = useState(null);
  // Lifetime AI allowance (PlanFeature "ai_credits"); null = unlimited.
  const [aiUsed, setAiUsed] = useState(0);
  const [aiLimit, setAiLimit] = useState(null);
  // Extra generations bought via one-time AiCreditPurchase packs, on top of aiLimit.
  const [aiPurchased, setAiPurchased] = useState(0);
  const [creditPacks, setCreditPacks] = useState([]);
  const [purchasingPack, setPurchasingPack] = useState(null);
  const [billingCycle, setBillingCycle] = useState(null);
  const [dynamicPlans, setDynamicPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingTier, setSubmittingTier] = useState(null);
  const [error, setError] = useState("");

  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);

  // Shows a real Shopify admin toast (not a page-level Banner) for "you just changed plans" —
  // reserved for confirmations that happen off a merchant's direct click on this page (landing
  // back from Shopify's own approval screen after subscribing/upgrading), where a banner buried
  // in the page content is easy to miss entirely.
  const showPlanToast = (content) => {
    if (window.shopify?.toast) {
      window.shopify.toast.show(content);
    }
  };

  useEffect(() => {
    (async () => {
      const { checkData, plansData } = await fetchBillingData();
      // billing.js's returnUrl appends ?subscribed=1 once Shopify's own approval screen sends the
      // merchant back here — without this, a successful upgrade/downgrade landed the merchant back
      // on this page with zero confirmation that anything actually happened.
      if (searchParams.get("subscribed") === "1" && checkData) {
        const planTitle = plansData?.plans?.find((p) => p.name === checkData.activePlan)?.title
          || (checkData.activePlan?.toLowerCase() === "free" ? "Free" : checkData.activePlan);
        showPlanToast(`You're now on the ${planTitle} plan`);
        const next = new URLSearchParams(searchParams);
        next.delete("subscribed");
        setSearchParams(next, { replace: true });
      }
      // aiCreditPacks.js's returnUrl appends ?credits_purchased=1 the same way — but unlike a
      // subscription (confirmed synchronously in the redirect response), a one-time purchase is
      // only actually credited once Shopify's app_purchases_one_time/update webhook lands, which
      // can arrive a moment after this redirect. Acknowledge the purchase now, then re-fetch once
      // shortly after to pick up the credited balance without the merchant needing a manual
      // refresh.
      if (searchParams.get("credits_purchased") === "1") {
        showPlanToast("Thanks! Your AI credits will appear shortly.");
        const next = new URLSearchParams(searchParams);
        next.delete("credits_purchased");
        setSearchParams(next, { replace: true });
        setTimeout(() => fetchBillingData(), 3000);
      }
      fetchCreditPacks();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchCreditPacks = async () => {
    try {
      const res = await fetch("/api/ai/credit-packs");
      const data = await res.json();
      setCreditPacks(data.packs || []);
      if ("aiCreditsPurchased" in data) setAiPurchased(data.aiCreditsPurchased || 0);
    } catch (err) {
      console.error("Failed to load AI credit packs:", err);
    }
  };

  const buyCreditPack = async (packKey) => {
    setPurchasingPack(packKey);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const host = urlParams.get("host");
      const res = await fetch("/api/ai/credit-packs/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packKey, host }),
      });
      const data = await res.json();
      if (res.ok && data.confirmationUrl) {
        window.open(data.confirmationUrl, "_top");
      } else {
        setError(data.error || "Failed to start purchase.");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to start purchase.");
    } finally {
      setPurchasingPack(null);
    }
  };

  const fetchBillingData = async () => {
    setIsLoading(true);
    try {
      const [checkRes, plansRes] = await Promise.all([
        fetch("/api/billing/check"),
        fetch("/api/billing/plans"),
      ]);
      const checkData = await checkRes.json();
      const plansData = await plansRes.json();

      setActivePlan(checkData.activePlan || "free");
      setPostCount(checkData.postCount || 0);
      setTemplateCount(checkData.templateCount || 0);
      setTemplateLimit("templateLimit" in checkData ? checkData.templateLimit : null);
      setAiUsed(checkData.aiCreditsUsed || 0);
      setAiLimit("aiCreditLimit" in checkData ? checkData.aiCreditLimit : null);
      setAiPurchased(checkData.aiCreditsPurchased || 0);
      // checkData.postLimit is `null` on purpose for unlimited plans (Pro) — that's a meaningful
      // value, not missing data, so it must NOT be coalesced away. `?? 10` here previously treated
      // null the same as undefined/missing and silently substituted a hardcoded 10, which is
      // exactly why Pro (truly unlimited) was showing "8 of 10" / "80% used" / a fake near-limit
      // warning instead of "Unlimited".
      setPostLimit("postLimit" in checkData ? checkData.postLimit : 10);
      setBillingCycle(checkData.billingCycle || null);
      setDynamicPlans(plansData.plans || []);
      return { checkData, plansData };
    } catch (err) {
      console.error("Failed to load plans data:", err);
      return {};
    } finally {
      setIsLoading(false);
    }
  };

  const applyCoupon = async () => {
    setCouponError("");
    setCouponLoading(true);
    try {
      const res = await fetch("/api/billing/coupon/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponInput }),
      });
      const data = await res.json();
      if (data.ok) {
        setAppliedCoupon(data.coupon);
      } else {
        setAppliedCoupon(null);
        setCouponError(data.error || "This coupon isn't valid.");
      }
    } catch (err) {
      console.error(err);
      setCouponError("Failed to validate coupon.");
    } finally {
      setCouponLoading(false);
    }
  };

  const clearCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponError("");
  };

  // Downgrading (including to Free) previously fired immediately on click — no confirmation step,
  // unlike upgrades which at least go through Shopify's own approval screen. A downgrade takes
  // effect immediately and can mean losing access to paid features or cancelling the real Shopify
  // subscription outright, so it gets the same "are you sure" treatment as other consequential
  // actions in this app (ConfirmActionModal).
  const [downgradeTarget, setDowngradeTarget] = useState(null);

  const requestDowngrade = (plan) => setDowngradeTarget(plan);
  const cancelDowngrade = () => setDowngradeTarget(null);
  const confirmDowngrade = async () => {
    if (!downgradeTarget) return;
    const succeeded = await handleSubscribe(downgradeTarget.name);
    // Keep the modal open on failure so its own error banner is actually visible — the page-level
    // Banner behind it is invisible while a modal overlay is open (see ConfirmActionModal's docblock).
    if (succeeded) setDowngradeTarget(null);
  };

  const handleSubscribe = async (planName) => {
    setError("");
    setIsSubmitting(true);
    setSubmittingTier(planName);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const host = urlParams.get("host");

      const res = await fetch("/api/billing/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planName, host, couponCode: appliedCoupon?.code }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.confirmationUrl) {
          window.open(data.confirmationUrl, "_top");
        } else if (data.isFree) {
          // Free never goes through Shopify's approval screen — no redirect round-trip, so
          // there's no ?subscribed=1 to react to. Confirm right here instead.
          //
          // Deliberately NOT re-fetching via fetchBillingData()/GET /check here: that route
          // re-queries Shopify's own activeSubscriptions to decide the plan, and immediately
          // after the appSubscriptionCancel call the backend just made, Shopify's API can still
          // report the just-cancelled subscription as ACTIVE for a few seconds (ordinary
          // eventual consistency) — /check would then "helpfully" resync planKey back to the old
          // paid plan, undoing the downgrade the merchant just confirmed. The backend already
          // did the real work and confirmed no userErrors, so this response body IS the source
          // of truth; use it directly instead of asking a race-prone endpoint to confirm itself.
          setActivePlan(data.activePlan || "free");
          setPostCount(data.postCount ?? 0);
          setTemplateCount(data.templateCount ?? 0);
          setTemplateLimit("templateLimit" in data ? data.templateLimit : null);
          setAiUsed(data.aiCreditsUsed || 0);
          setAiLimit("aiCreditLimit" in data ? data.aiCreditLimit : null);
          setAiPurchased(data.aiCreditsPurchased || 0);
          setPostLimit("postLimit" in data ? data.postLimit : null);
          setBillingCycle(data.billingCycle ?? null);
          showPlanToast("You're now on the Free plan");
        }
        return true;
      }
      const err = await res.json();
      setError(err.error || "Failed to process subscription.");
      return false;
    } catch (err) {
      console.error(err);
      return false;
    } finally {
      setIsSubmitting(false);
      setSubmittingTier(null);
    }
  };

  const isFreePlanActive = activePlan.toLowerCase() === "free" || !activePlan;
  const currentPlanDetails = dynamicPlans.find((p) => p.name === activePlan);
  const currentPlanTitle = currentPlanDetails?.title || (isFreePlanActive ? "Free" : activePlan);
  const currentPrice = Number(currentPlanDetails?.price ?? 0);

  const usagePct = postLimit === null ? 0 : Math.min(100, Math.round((postCount / postLimit) * 100));

  const postsAtLimit = postLimit !== null && postCount >= postLimit;
  const postsNearLimit = postLimit !== null && !postsAtLimit && usagePct >= 80;

  const anyUsageWarning = postsAtLimit || postsNearLimit;

  const formatDate = (isoOrDate) => {
    if (!isoOrDate) return null;
    return new Date(isoOrDate).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  };

  // Card display order follows the admin's own Sort Order (dynamicPlans already arrives in that
  // order from /api/billing/plans) — previously this page re-sorted by price itself, silently
  // overriding whatever order was set in Super Admin. "Next plan to upgrade to" still needs a
  // true price ordering regardless of display order, so that's computed separately. Which plan
  // shows the "Recommended" badge is a Super Admin-set flag (plan.isRecommended, edited via
  // EditPlanCoreModal's "Recommend / Highlight Plan in UI" checkbox) — not derived here at all.
  const displayPlans = dynamicPlans;
  const byPriceAsc = [...dynamicPlans].sort((a, b) => Number(a.price) - Number(b.price));
  const nextPlan = byPriceAsc.find((p) => Number(p.price) > currentPrice);

  return (
    <>
    <TitleBar title="Plans & billing" />
    <Page
      title="Plans & billing"
      backAction={smartBackAction(navigate, location, "/dashboard", "Dashboard")}
    >
      <Layout>
        <Layout.Section>
          <Text as="p" variant="bodyMd" tone="subdued">
            Select the best subscription plan, review usage metrics, and upgrade or downgrade at
            any time.
          </Text>
        </Layout.Section>

        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError("")}>
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}

        {isLoading && (
          <Layout.Section>
            <Box padding="1600">
              <InlineStack align="center">
                <BlockStack gap="300" inlineAlign="center">
                  <Spinner accessibilityLabel="Loading plans" size="large" />
                  <Text as="p" tone="subdued">Loading your plan and billing details…</Text>
                </BlockStack>
              </InlineStack>
            </Box>
          </Layout.Section>
        )}

        {!isLoading && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="start" gap="400" wrap={false}>
                  <BlockStack gap="050">
                    <Text as="h3" variant="headingMd">Plan usage</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {billingCycle?.renewsOn
                        ? `Current billing period · resets ${formatDate(billingCycle.renewsOn)}`
                        : `${currentPlanTitle} plan · limits don't reset each billing cycle`}
                    </Text>
                  </BlockStack>
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone={postsAtLimit ? "critical" : postsNearLimit ? "warning" : "success"}>
                      {`${currentPlanTitle} Plan`}
                    </Badge>
                    {isFreePlanActive ? (
                      nextPlan && (
                        <Button
                          size="slim"
                          variant="primary"
                          onClick={() => handleSubscribe(nextPlan.name)}
                          loading={isSubmitting && submittingTier === nextPlan.name}
                        >
                          Upgrade
                        </Button>
                      )
                    ) : (
                      <Button
                        size="slim"
                        tone="critical"
                        onClick={() => requestDowngrade(byPriceAsc[0])}
                        disabled={!byPriceAsc[0]}
                      >
                        Downgrade
                      </Button>
                    )}
                  </InlineStack>
                </InlineStack>

                {anyUsageWarning && (
                  <Banner tone={postsAtLimit ? "critical" : "warning"}>
                    <InlineStack align="space-between" blockAlign="center" gap="300">
                      <Text as="p" variant="bodySm">
                        {postsAtLimit && "You've reached your article limit on this plan. "}
                        {!postsAtLimit && postsNearLimit && "You're close to your article limit. "}
                        {nextPlan ? `Upgrade to ${nextPlan.title} Plan for more room.` : "Contact us for higher limits."}
                      </Text>
                      {nextPlan && (
                        <Button
                          size="slim"
                          onClick={() => handleSubscribe(nextPlan.name)}
                          loading={isSubmitting && submittingTier === nextPlan.name}
                        >
                          Upgrade to {nextPlan.title} Plan
                        </Button>
                      )}
                    </InlineStack>
                  </Banner>
                )}

                {billingCycle?.isTrial && (
                  <Banner tone="info">
                    <Text as="p" variant="bodySm">
                      Free trial — <strong>{billingCycle.trialDaysRemaining} day{billingCycle.trialDaysRemaining === 1 ? "" : "s"} left</strong>
                      {billingCycle.trialEndsAt ? `, then billing starts ${formatDate(billingCycle.trialEndsAt)}` : ""}.
                    </Text>
                  </Banner>
                )}

                <PlanUsageMeters
                  meters={[
                    { label: "Articles", used: postCount, limit: postLimit },
                    { label: "Saved templates", used: templateCount, limit: templateLimit },
                    {
                      label: aiPurchased > 0 ? `AI credits (+${aiPurchased} purchased)` : "AI credits",
                      used: aiUsed,
                      // aiUsed/aiLimit already come from the server as a downgrade-safe, meter-
                      // ready pair (GET /api/billing/check's meterUsed/meterLimit — see its own
                      // comment) — no client-side math needed, and adding aiPurchased again here
                      // would double-count it now that the server already folds purchased credits
                      // into aiLimit.
                      limit: aiLimit,
                    },
                  ]}
                />
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {!isLoading && aiLimit != null && creditPacks.length > 0 && (
          <Layout.Section>
            <Card>
              <Box padding="500">
                <BlockStack gap="400">
                  <div>
                    <Text as="h3" variant="headingMd">Need more AI credits right now?</Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Buy a one-time credit pack instead of changing plans — credits never expire and stack with your plan's own allowance.
                    </Text>
                  </div>
                  <InlineGrid columns={{ xs: 1, sm: Math.min(creditPacks.length, 3) }} gap="300">
                    {(() => {
                      // The smallest pack (by credit count) is the undiscounted anchor rate —
                      // every other pack's "Save X%" badge is how much cheaper its own
                      // price-per-credit is against that baseline, the same framing Bloggle's
                      // "Save 10%" preset labels use relative to their smallest tier.
                      const smallestPack = creditPacks.reduce(
                        (min, p) => (p.credits < min.credits ? p : min),
                        creditPacks[0]
                      );
                      const baselinePerCredit = smallestPack.price / smallestPack.credits;
                      return creditPacks.map((pack) => {
                        // Super Admin-set flag (pack.isRecommended, edited via
                        // EditCreditPackModal's "Best Value / Highlight Pack in UI" checkbox) —
                        // not auto-computed here.
                        const isBestValue = !!pack.isRecommended;
                        const perCredit = pack.price / pack.credits;
                        const savePct = Math.round((1 - perCredit / baselinePerCredit) * 100);
                        const showSavings = pack !== smallestPack && savePct > 0;
                        return (
                          // No reserved top space — every card's border starts at the same
                          // height, and the "Best value" ribbon is meant to sit right ON that
                          // border (roughly half above it, half overlapping the card), pinned at
                          // the corner, rather than floating fully clear of it.
                          <div key={pack.key} style={{ position: "relative", height: "100%" }}>
                            {isBestValue && (
                              <div style={{ position: "absolute", top: -12, right: 16, zIndex: 1 }}>
                                <Badge tone="success">Best value</Badge>
                              </div>
                            )}
                            <div
                              style={{
                                height: "100%",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                border: `1px solid ${isBestValue ? "var(--p-color-border-emphasis)" : "var(--p-color-border)"}`,
                                borderRadius: "var(--p-border-radius-300)",
                                background: "var(--p-color-bg-surface-secondary)",
                                padding: "20px 16px 16px",
                                boxSizing: "border-box",
                              }}
                            >
                              <Text as="span" variant="heading2xl">{pack.credits}</Text>
                              <Text as="span" variant="bodySm" tone="subdued">AI credits</Text>
                              {/* Fixed-height slot, rendered on every card whether or not it has a
                                  discount, so the Buy button lines up at the same height across
                                  the whole row instead of drifting up on cards with no badge. */}
                              <div style={{ height: 24, marginTop: 8, visibility: showSavings ? "visible" : "hidden" }}>
                                <Badge tone="success">{`Save ${savePct}%`}</Badge>
                              </div>
                              <div style={{ width: "100%", marginTop: "auto", paddingTop: 12 }}>
                                <Button
                                  fullWidth
                                  variant="primary"
                                  onClick={() => buyCreditPack(pack.key)}
                                  loading={purchasingPack === pack.key}
                                  disabled={purchasingPack != null}
                                >
                                  {`Buy for $${pack.price.toFixed(2)}`}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </InlineGrid>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        )}

        {!isLoading && (
        <>
        <Layout.Section>
          <Box paddingBlockStart="600" paddingBlockEnd="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingLg">Choose your plan</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Upgrade or downgrade at any time. Changes take effect immediately.
              </Text>
            </BlockStack>
          </Box>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <BlockStack gap="050">
                <Text as="h3" variant="headingMd">Have a coupon code?</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Apply it before picking a plan below to see the discounted price.
                </Text>
              </BlockStack>

              <InlineStack gap="300" blockAlign="start">
                <div style={{ flexGrow: 1, maxWidth: "320px" }}>
                  <TextField
                    label="Coupon code"
                    labelHidden
                    value={appliedCoupon ? appliedCoupon.code : couponInput}
                    onChange={(v) => setCouponInput(v.toUpperCase())}
                    placeholder="WELCOME40"
                    autoComplete="off"
                    disabled={!!appliedCoupon}
                    error={couponError}
                  />
                </div>
                {appliedCoupon ? (
                  <Button tone="critical" onClick={clearCoupon}>Remove</Button>
                ) : (
                  <Button onClick={applyCoupon} loading={couponLoading} disabled={!couponInput.trim()}>
                    Apply
                  </Button>
                )}
              </InlineStack>

              {appliedCoupon && (
                <Banner tone="success">
                  <InlineStack gap="150" blockAlign="center">
                    <Text as="span" fontWeight="semibold">
                      {appliedCoupon.code} · {appliedCoupon.discountType === "PERCENTAGE"
                        ? `${appliedCoupon.percentOff}% off`
                        : `$${appliedCoupon.amountOff} off`}
                    </Text>
                    <Text as="span" variant="bodySm">
                      {appliedCoupon.description ? `${appliedCoupon.description} — ` : ""}
                      Applies for {appliedCoupon.durationMonths} month
                      {appliedCoupon.durationMonths === 1 ? "" : "s"}, then the regular price.
                    </Text>
                  </InlineStack>
                </Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <InlineGrid columns={{ xs: 1, md: displayPlans.length || 1 }} gap="400">
            {displayPlans.map((plan) => {
              const isCurrent = activePlan === plan.name;
              const isRecommended = !!plan.isRecommended;
              const price = Number(plan.price);

              const couponAppliesHere = Boolean(
                appliedCoupon &&
                price > 0 &&
                (appliedCoupon.appliesTo !== "SPECIFIC_PLANS" ||
                  appliedCoupon.planTiers?.includes(plan.name))
              );
              const discountedPrice = couponAppliesHere ? applyCouponDiscount(price, appliedCoupon) : null;
              // discountedPrice can still be null here even when couponAppliesHere is true — a
              // fixed-amount coupon too large for this specific plan's price (see
              // applyCouponDiscount's own comment). Treat that as "doesn't apply to this plan"
              // for rendering purposes, same as the scoping/price checks above.
              const showDiscountHere = couponAppliesHere && discountedPrice !== null;

              return (
                <Box
                  key={plan.name}
                  borderWidth="025"
                  borderColor="border"
                  borderRadius="300"
                  background="bg-surface"
                  padding="0"
                >
                  <Box padding="500">
                    <BlockStack gap="400">
                      <InlineStack align="space-between" blockAlign="start">
                        <BlockStack gap="100">
                          <Text as="h3" variant="headingMd">{plan.title} Plan</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{plan.description}</Text>
                        </BlockStack>
                        {isRecommended && <Badge tone="info">Recommended</Badge>}
                      </InlineStack>

                      <Box paddingBlockStart="200" paddingBlockEnd="200">
                        {price === 0 ? (
                          <Text as="h2" variant="heading2xl">Free</Text>
                        ) : showDiscountHere ? (
                          <BlockStack gap="100">
                            <InlineStack gap="150" blockAlign="baseline">
                              <Text as="span" variant="bodyLg" tone="subdued" textDecorationLine="line-through">
                                ${price.toFixed(2)}
                              </Text>
                              <Text as="span" variant="heading2xl">${discountedPrice.toFixed(2)}</Text>
                              <Text as="span" variant="bodySm" tone="subdued">{intervalSuffix(plan.interval)}</Text>
                            </InlineStack>
                            <Text as="span" variant="bodySm" tone="success">
                              {appliedCoupon.discountType === "PERCENTAGE"
                                ? `${appliedCoupon.percentOff}% off`
                                : `$${appliedCoupon.amountOff} off`} for {appliedCoupon.durationMonths} month
                              {appliedCoupon.durationMonths === 1 ? "" : "s"}
                            </Text>
                          </BlockStack>
                        ) : (
                          <InlineStack gap="150" blockAlign="baseline">
                            <Text as="span" variant="heading2xl">${price.toFixed(2)}</Text>
                            <Text as="span" variant="bodySm" tone="subdued">{intervalSuffix(plan.interval)}</Text>
                          </InlineStack>
                        )}
                        {plan.trialDays > 0 && !isCurrent && (
                          <Box paddingBlockStart="150">
                            <Badge tone="success">{`${plan.trialDays}-day free trial`}</Badge>
                          </Box>
                        )}
                      </Box>

                      <Divider />

                      <BlockStack gap="200" inlineAlign="start">
                        <Text as="strong" variant="bodySm">Features & Security</Text>
                        {plan.basedOnPlanTitle && (
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                            <Icon source={CheckIcon} tone="success" />
                            <Text as="strong" variant="bodySm">All {plan.basedOnPlanTitle} Plan features +</Text>
                          </div>
                        )}
                        {Array.isArray(plan.features) && plan.features.map((feature, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                            <Icon source={CheckIcon} tone="success" />
                            <Text as="span" variant="bodySm">{feature}</Text>
                          </div>
                        ))}
                      </BlockStack>

                      <Box paddingBlockStart="400">
                        <Button
                          fullWidth
                          variant={isCurrent ? "secondary" : "primary"}
                          tone={isCurrent ? "success" : undefined}
                          loading={isSubmitting && submittingTier === plan.name}
                          disabled={isCurrent || isSubmitting}
                          onClick={() =>
                            price > currentPrice
                              ? handleSubscribe(plan.name)
                              : requestDowngrade(plan)
                          }
                        >
                          {isCurrent
                            ? "Current Plan"
                            : price > currentPrice
                              ? `Upgrade to ${plan.title} Plan`
                              : `Downgrade to ${plan.title} Plan`}
                        </Button>
                      </Box>
                    </BlockStack>
                  </Box>
                </Box>
              );
            })}
          </InlineGrid>
        </Layout.Section>
        </>
        )}
      </Layout>

      <ConfirmActionModal
        open={!!downgradeTarget}
        title={
          downgradeTarget && Number(downgradeTarget.price) === 0
            ? "Downgrade to the Free plan?"
            : `Downgrade to ${downgradeTarget?.title} Plan?`
        }
        body={
          downgradeTarget && (
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd">
                This takes effect immediately — you'll lose access to any {currentPlanTitle}-only
                features right away, not at the end of your current billing period.
              </Text>
              {Number(downgradeTarget.price) === 0 && (
                <Text as="p" variant="bodyMd">
                  Your current Shopify subscription will be cancelled and you won't be billed
                  again.
                </Text>
              )}
              <Text as="p" variant="bodyMd" tone="subdued">
                Already-published articles stay live either way — this only affects what you can
                do going forward (article limits, blocked features, etc.).
              </Text>
            </BlockStack>
          )
        }
        confirmText={`Downgrade to ${downgradeTarget?.title || ""} Plan`}
        confirmTone="warning"
        onConfirm={confirmDowngrade}
        onCancel={cancelDowngrade}
        loading={isSubmitting && submittingTier === downgradeTarget?.name}
        error={error || undefined}
      />
    </Page>
    </>
  );
}

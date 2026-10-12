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
  ButtonGroup,
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

function formatCreditPackMoney(value, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value));
  } catch {
    return `$${Number(value).toFixed(2)}`;
  }
}

function couponDurationLabel(durationMonths, interval) {
  if (interval !== "ANNUAL") {
    return `Applies for ${durationMonths} month${durationMonths === 1 ? "" : "s"}, then the regular price.`;
  }
  const yearlyCycles = Math.max(1, Math.ceil(durationMonths / 12));
  return `Applies to your first ${yearlyCycles} yearly billing ${yearlyCycles === 1 ? "cycle" : "cycles"}.`;
}

// One-time AI credit packs are approved through Shopify before they are added to the merchant's
// balance; the UI only starts the purchase and never credits optimistically.
const SHOW_ONE_TIME_AI_CREDIT_PACKS = true;

// Returns null (not a clamped near-zero number) when a fixed-amount coupon is too large for this
// specific plan's price — Shopify's own appSubscriptionCreate rejects discount.value.amount >=
// price outright, so clamping the displayed price to $0.01 would show a discount that could never
// actually be applied here. Callers fall back to the plan's real full price when this returns
// null. Percentage coupons can never hit this (already capped at 99% server-side).
function applyCouponDiscount(price, coupon, planName = null) {
  if (coupon.discountType === "FIXED_PRICE") {
    const target = Number(coupon.planPrices?.[planName]);
    return Number.isFinite(target) && target > 0 && target < price ? target : null;
  }
  if (coupon.discountType === "PERCENTAGE") {
    return Math.max(0, Math.round(price * (1 - Number(coupon.percentOff) / 100) * 100) / 100);
  }
  if (Number(coupon.amountOff) >= price) return null;
  return Math.max(0, Math.round((price - Number(coupon.amountOff)) * 100) / 100);
}

function planUsageLimits(features = []) {
  const valueFor = (pattern, fallback) => {
    const value = features.find((feature) => pattern.test(feature));
    return value ? value.replace(/^Up to\s+/i, "") : fallback;
  };
  return [
    // The row label supplies the context, so keep unlimited values concise.
    { label: "Articles", value: valueFor(/articles/i, "Included").replace(/^Unlimited Articles$/i, "Unlimited") },
    // The label already says “Saved templates”, so the full “Unlimited Saved
    // Templates” string makes the value column overflow on narrower cards.
    { label: "Saved templates", value: valueFor(/templates/i, "Included").replace(/^Unlimited Saved Templates$/i, "Unlimited") },
    { label: "AI credits", value: valueFor(/AI credits/i, "Included") },
  ];
}

function isUsageLimitBullet(feature) {
  return /^(Up to \d+ Articles|Unlimited Articles|\d+ Saved Templates|Unlimited Saved Templates|\d+ AI Credits|Unlimited AI Credits)$/i.test(feature);
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
  // Free credits are lifetime; paid-plan AI credits refresh monthly. null = unlimited.
  const [aiUsed, setAiUsed] = useState(0);
  const [aiLimit, setAiLimit] = useState(null);
  // Extra generations bought via one-time AiCreditPurchase packs, on top of aiLimit.
  const [aiPurchased, setAiPurchased] = useState(0);
  const [creditPacks, setCreditPacks] = useState([]);
  const [purchasingPack, setPurchasingPack] = useState(null);
  const [billingCycle, setBillingCycle] = useState(null);
  const [dynamicPlans, setDynamicPlans] = useState([]);
  const [selectedBillingInterval, setSelectedBillingInterval] = useState("EVERY_30_DAYS");
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
      const currentPlan = plansData?.plans?.find((plan) => plan.name === checkData?.activePlan);
      if (currentPlan?.interval === "ANNUAL") setSelectedBillingInterval("ANNUAL");
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
        body: JSON.stringify({
          packKey,
          host,
          // `host` is sent separately. Do not repeat the embedded host query inside returnPath,
          // because Shopify caps one-time-purchase return URLs at 255 characters.
          returnPath: window.location.pathname,
        }),
      });
      const data = await res.json();
      if (res.ok && data.confirmationUrl) {
        try {
          window.sessionStorage.setItem("blogger_pending_ai_credit_purchase", JSON.stringify({
            purchaseId: data.purchaseId,
            returnPath: window.location.pathname,
            startedAt: Date.now(),
          }));
        } catch {
          // The server return URL remains available if storage is unavailable.
        }
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
        } else {
          // A Super Admin override can keep gating on a paid tier even after the merchant's
          // Shopify subscription has been cancelled. That's still a successful request, but this
          // branch was previously ignored entirely (no UI update, no toast), so it looked broken.
          setActivePlan(data.activePlan || activePlan || "free");
          setPostCount(data.postCount ?? postCount);
          setTemplateCount(data.templateCount ?? templateCount);
          setTemplateLimit("templateLimit" in data ? data.templateLimit : templateLimit);
          setAiUsed(data.aiCreditsUsed ?? aiUsed);
          setAiLimit("aiCreditLimit" in data ? data.aiCreditLimit : aiLimit);
          setAiPurchased(data.aiCreditsPurchased ?? aiPurchased);
          setPostLimit("postLimit" in data ? data.postLimit : postLimit);
          setBillingCycle(data.billingCycle ?? null);
          showPlanToast(`Downgrade processed. Your current app access remains on ${data.activePlan || "the overridden"} plan.`);
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
  // EditPlanCoreModal's "Recommend / Highlight Plan in UI" checkbox). A tier's monthly and
  // yearly variants share that recommendation so merchants see the same guidance in either view.
  const hasYearlyPlans = dynamicPlans.some((plan) => Number(plan.price) > 0 && plan.interval === "ANNUAL");
  const hasMonthlyPlans = dynamicPlans.some((plan) => Number(plan.price) > 0 && plan.interval !== "ANNUAL");
  // Free is a shared baseline; the selected cadence only filters paid offers.
  const displayPlans = dynamicPlans.filter((plan) =>
    Number(plan.price) === 0 || plan.interval === selectedBillingInterval
  );
  const byPriceAsc = [...displayPlans].sort((a, b) => Number(a.price) - Number(b.price));
  const nextPlan = byPriceAsc.find((p) => Number(p.price) > currentPrice);
  // Derive the banner from the live Super Admin prices so it never becomes stale.
  const bestYearlySavingsPct = dynamicPlans
    .filter((plan) => plan.interval === "ANNUAL" && Number(plan.price) > 0)
    .reduce((best, yearlyPlan) => {
      const monthlyPlan = dynamicPlans.find((candidate) =>
        candidate.interval !== "ANNUAL" &&
        Number(candidate.price) > 0 &&
        candidate.title.trim().toLowerCase() === yearlyPlan.title.trim().toLowerCase()
      );
      if (!monthlyPlan) return best;
      const yearlyAtMonthlyRate = Number(monthlyPlan.price) * 12;
      const savingPct = yearlyAtMonthlyRate > 0
        ? Math.round(((yearlyAtMonthlyRate - Number(yearlyPlan.price)) / yearlyAtMonthlyRate) * 100)
        : 0;
      return Math.max(best, savingPct);
    }, 0);

  return (
    <>
    <TitleBar title="Plans & Billing" />
    <Page
      title="Plans & Billing"
      backAction={smartBackAction(navigate, location, "/dashboard", "Dashboard")}
    >
      <Layout>
        <Layout.Section>
          <Text as="p" variant="bodyMd" tone="subdued">
            Select the best subscription plan, review usage metrics, and cancel or upgrade your
            account at any time.
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
                      {isFreePlanActive
                        ? "Free articles and AI credits are one-time lifetime allowances."
                        : billingCycle?.renewsOn
                        ? `Article and AI allowances reset monthly. Subscription renews ${formatDate(billingCycle.renewsOn)}`
                        : "Article and AI allowances reset monthly while your plan is active."}
                    </Text>
                  </BlockStack>
                  <InlineStack gap="200" blockAlign="center">
                    {!isFreePlanActive && (
                      <Badge tone="attention">
                        {currentPlanDetails?.interval === "ANNUAL" ? "Billed yearly" : "Billed monthly"}
                      </Badge>
                    )}
                    <Badge tone={postsAtLimit ? "critical" : postsNearLimit ? "warning" : "info"}>
                      {`${currentPlanTitle} Plan`}
                    </Badge>
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

        {SHOW_ONE_TIME_AI_CREDIT_PACKS && !isLoading && aiLimit != null && creditPacks.length > 0 && (
          <Layout.Section>
            <Card>
              <Box padding="500">
                <BlockStack gap="500">
                  <div style={{ padding: "18px 20px", borderRadius: "var(--p-border-radius-300)", background: "linear-gradient(112deg, #f0fdf4 0%, #eff6ff 100%)", border: "1px solid #bbf7d0" }}>
                    <InlineStack align="space-between" blockAlign="center" gap="400" wrap={false}>
                      <BlockStack gap="100">
                        <Text as="h3" variant="headingLg">Keep your content momentum going</Text>
                        <Text as="p" tone="subdued">Add credits whenever you need them. They never expire and stack with your plan allowance.</Text>
                      </BlockStack>
                      <div style={{ minWidth: 92, paddingLeft: 20, borderLeft: "1px solid #bbf7d0", textAlign: "right" }}>
                        <Text as="p" variant="headingLg">{Math.max(0, (aiLimit ?? 0) - aiUsed)}</Text>
                        <Text as="p" variant="bodySm" tone="subdued">available now</Text>
                      </div>
                    </InlineStack>
                  </div>
                  <InlineGrid columns={{ xs: 1, sm: Math.min(creditPacks.length, 3) }} gap="300">
                    {(() => {
                      const smallestPack = creditPacks.reduce(
                        (min, p) => (p.credits < min.credits ? p : min),
                        creditPacks[0]
                      );
                      const baselinePerCredit = smallestPack.price / smallestPack.credits;
                      return creditPacks.map((pack) => {
                        const isBestValue = !!pack.isRecommended;
                        const perCredit = pack.price / pack.credits;
                        const savePct = Math.max(0, Math.round((1 - perCredit / baselinePerCredit) * 100));
                        return (
                          <div key={pack.key} style={{ display: "flex", flexDirection: "column", minHeight: 244, overflow: "hidden", border: isBestValue ? "2px solid #008060" : "1px solid var(--p-color-border)", borderRadius: "var(--p-border-radius-300)", background: isBestValue ? "linear-gradient(180deg, #effcf6 0%, #ffffff 54%)" : "var(--p-color-bg-surface)", boxShadow: isBestValue ? "0 8px 18px rgba(0, 128, 96, 0.12)" : "none", boxSizing: "border-box" }}>
                            <div style={{ height: 31, display: "flex", alignItems: "center", justifyContent: "center", background: isBestValue ? "#008060" : "transparent", color: "#fff" }}>
                              {isBestValue && <Text as="span" variant="bodySm" fontWeight="semibold">BEST VALUE</Text>}
                            </div>
                            <div style={{ display: "flex", flex: 1, flexDirection: "column", padding: "6px 14px 14px", textAlign: "center" }}>
                              <BlockStack gap="100" inlineAlign="center">
                                <Text as="p" variant="heading2xl">{pack.credits}</Text>
                                <Text as="p" tone="subdued">AI credits</Text>
                              </BlockStack>
                              <div style={{ minHeight: 28, display: "flex", justifyContent: "center", alignItems: "center", marginTop: 8 }}>
                                {savePct > 0 ? <Badge tone="success">{`Save ${savePct}% per credit`}</Badge> : <Text as="span" variant="bodySm" tone="subdued">Perfect for a quick boost</Text>}
                              </div>
                              <div style={{ marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--p-color-border-secondary)" }}>
                                <Text as="p" variant="headingMd">{formatCreditPackMoney(pack.price, pack.currency)}</Text>
                                <Text as="p" variant="bodySm" tone="subdued">{`${formatCreditPackMoney(perCredit, pack.currency)} per credit`}</Text>
                              </div>
                              <div style={{ marginTop: "auto", paddingTop: 12 }}>
                                <Button fullWidth variant="primary" onClick={() => buyCreditPack(pack.key)} loading={purchasingPack === pack.key} disabled={purchasingPack != null}>
                                  Choose this pack
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </InlineGrid>
                  <div style={{ borderTop: "1px solid var(--p-color-border-secondary)", paddingTop: 14 }}>
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 7 }}>
                      <span aria-hidden="true" style={{ color: "#008060", fontSize: 15, fontWeight: 700, lineHeight: 1 }}>✓</span>
                      <Text as="span" variant="bodySm" tone="subdued">Secure one-time Shopify charge · Credits never expire</Text>
                    </div>
                  </div>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        )}

        {!isLoading && (
        <>
        <Layout.Section>
          <Box paddingBlockStart="800" paddingBlockEnd="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingLg">Choose Your Plan</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Upgrade or downgrade at any time. Upgrades take effect immediately; changes to a
                lower yearly plan begin at your next renewal.
              </Text>
              {hasMonthlyPlans && hasYearlyPlans && (
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <InlineStack gap="300" blockAlign="center">
                    <ButtonGroup variant="segmented">
                      <Button
                        pressed={selectedBillingInterval === "EVERY_30_DAYS"}
                        onClick={() => setSelectedBillingInterval("EVERY_30_DAYS")}
                      >
                        Monthly
                      </Button>
                      <Button
                        pressed={selectedBillingInterval === "ANNUAL"}
                        onClick={() => setSelectedBillingInterval("ANNUAL")}
                      >
                        Yearly
                      </Button>
                    </ButtonGroup>
                    {bestYearlySavingsPct > 0 && (
                      <Badge tone="success">Save up to {bestYearlySavingsPct}% yearly</Badge>
                    )}
                  </InlineStack>
                </div>
              )}
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
                        : appliedCoupon.discountType === "FIXED_PRICE" ? "special plan price" : `$${appliedCoupon.amountOff} off`}
                    </Text>
                    <Text as="span" variant="bodySm">
                      {appliedCoupon.description ? `${appliedCoupon.description} — ` : ""}
                      {couponDurationLabel(appliedCoupon.durationMonths, selectedBillingInterval)}
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
              const isRecommended = dynamicPlans.some(
                (candidate) => candidate.title === plan.title && candidate.isRecommended
              );
              const price = Number(plan.price);
              const monthlyEquivalent = plan.interval === "ANNUAL"
                ? dynamicPlans.find((candidate) =>
                    candidate.interval !== "ANNUAL" &&
                    Number(candidate.price) > 0 &&
                    candidate.title.trim().toLowerCase() === plan.title.trim().toLowerCase()
                  )
                : null;
              const yearlyAtMonthlyRate = monthlyEquivalent ? Number(monthlyEquivalent.price) * 12 : null;
              const yearlySavings = yearlyAtMonthlyRate ? Math.max(0, yearlyAtMonthlyRate - price) : 0;
              const yearlySavingsPct = yearlyAtMonthlyRate && yearlySavings > 0
                ? Math.round((yearlySavings / yearlyAtMonthlyRate) * 100)
                : 0;
              const usageLimits = planUsageLimits(plan.features);
              // Numeric allowances belong solely in Usage Limits. Keep product capabilities such
              // as “Blog Templates” in Features & Security, but never duplicate their limits.
              const displayFeatures = Array.isArray(plan.features)
                ? plan.features.filter((feature) => !isUsageLimitBullet(feature))
                : [];
              const annualMonthlyRate = plan.interval === "ANNUAL" ? price / 12 : null;

              const couponAppliesHere = Boolean(
                appliedCoupon &&
                price > 0 &&
                (appliedCoupon.appliesTo !== "SPECIFIC_PLANS" ||
                  appliedCoupon.planTiers?.includes(plan.name))
              );
              const discountedPrice = couponAppliesHere ? applyCouponDiscount(price, appliedCoupon, plan.name) : null;
              // discountedPrice can still be null here even when couponAppliesHere is true — a
              // fixed-amount coupon too large for this specific plan's price (see
              // applyCouponDiscount's own comment). Treat that as "doesn't apply to this plan"
              // for rendering purposes, same as the scoping/price checks above.
              const showDiscountHere = couponAppliesHere && discountedPrice !== null;
              const annualDiscountedMonthlyRate = plan.interval === "ANNUAL" && discountedPrice !== null
                ? discountedPrice / 12
                : null;

              const statusLabel = isRecommended ? "RECOMMENDED" : isCurrent ? "CURRENT PLAN" : null;
              const statusStyle = isRecommended
                ? { background: "#008060", color: "#fff" }
                : isCurrent
                  ? { background: "#e7f7ed", color: "#006e52" }
                  : { background: "transparent", color: "transparent" };

              return (
                <div
                  key={plan.name}
                  style={{
                    height: "100%",
                    overflow: "hidden",
                    border: isRecommended ? "2px solid #008060" : "1px solid var(--p-color-border)",
                    borderRadius: "var(--p-border-radius-300)",
                    background: isRecommended ? "linear-gradient(180deg, #effcf6 0%, #ffffff 31%)" : "var(--p-color-bg-surface)",
                    boxShadow: isRecommended ? "0 8px 18px rgba(0, 128, 96, 0.10)" : "none",
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ height: 31, display: "flex", alignItems: "center", justifyContent: "center", ...statusStyle }}>
                    {statusLabel && <Text as="span" variant="bodySm" fontWeight="semibold">{statusLabel}</Text>}
                  </div>
                  <Box padding="500">
                    <BlockStack gap="400">
                      <InlineStack align="space-between" blockAlign="start">
                        <BlockStack gap="100">
                          <Text as="h3" variant="headingMd">{plan.title} Plan</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{plan.description}</Text>
                        </BlockStack>
                      </InlineStack>

                      <Box paddingBlockStart="200" paddingBlockEnd="200">
                        {price === 0 ? (
                          <Text as="h2" variant="heading2xl">Free</Text>
                        ) : showDiscountHere ? (
                          <BlockStack gap="100">
                            <InlineStack gap="150" blockAlign="baseline">
                              <Text as="span" variant="bodyLg" tone="subdued" textDecorationLine="line-through">
                                ${(plan.interval === "ANNUAL" && monthlyEquivalent
                                  ? Number(monthlyEquivalent.price)
                                  : price).toFixed(2)}
                              </Text>
                              <Text as="span" variant="heading2xl">
                                ${(annualDiscountedMonthlyRate ?? discountedPrice).toFixed(2)}
                              </Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {plan.interval === "ANNUAL" ? "/month" : intervalSuffix(plan.interval)}
                              </Text>
                            </InlineStack>
                            <Text as="span" variant="bodySm" tone="success">
                              {appliedCoupon.discountType === "PERCENTAGE"
                                ? `${appliedCoupon.percentOff}% off`
                                : appliedCoupon.discountType === "FIXED_PRICE" ? "Early access price" : `$${appliedCoupon.amountOff} off`} · {couponDurationLabel(appliedCoupon.durationMonths, plan.interval)}
                            </Text>
                          </BlockStack>
                        ) : (
                          <InlineStack gap="150" blockAlign="baseline">
                            {plan.interval === "ANNUAL" && monthlyEquivalent && (
                              <Text as="span" variant="bodyLg" tone="subdued" textDecorationLine="line-through">
                                ${Number(monthlyEquivalent.price).toFixed(2)}
                              </Text>
                            )}
                            <Text as="span" variant="heading2xl">
                              ${(annualMonthlyRate ?? price).toFixed(2)}
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {plan.interval === "ANNUAL" ? "/month" : intervalSuffix(plan.interval)}
                            </Text>
                          </InlineStack>
                        )}
                        {plan.interval === "ANNUAL" && yearlySavings > 0 && (
                          <Box paddingBlockStart="150">
                            <InlineStack gap="150" blockAlign="center" wrap>
                              <Text as="span" variant="bodySm" tone="subdued">
                                Billed ${price.toFixed(2)} yearly
                              </Text>
                              <Badge tone="success">
                                Save ${yearlySavings.toFixed(2)}
                              </Badge>
                            </InlineStack>
                          </Box>
                        )}
                        {showDiscountHere && (
                          <Box paddingBlockStart="100">
                            <Text as="span" variant="bodySm" tone="subdued">
                              {couponDurationLabel(appliedCoupon.durationMonths, plan.interval)}
                            </Text>
                          </Box>
                        )}
                        {plan.trialDays > 0 && !isCurrent && (
                          <Box paddingBlockStart="150">
                            <Badge tone="success">{`${plan.trialDays}-day free trial`}</Badge>
                          </Box>
                        )}
                      </Box>

                      <Divider />

                      <BlockStack gap="150">
                        <Text as="strong" variant="bodySm">Usage Limits</Text>
                        {usageLimits.map((limit) => (
                          <InlineStack key={limit.label} align="space-between" gap="100" wrap={false} className="plan-usage-limit">
                            <Text as="span" variant="bodySm" tone="subdued">
                              {limit.label === "AI credits" && plan.interval === "ANNUAL" ? "AI credits / month" : limit.label}
                            </Text>
                            <Text as="span" variant="bodySm" fontWeight="semibold" alignment="end">{limit.value}</Text>
                          </InlineStack>
                        ))}
                      </BlockStack>

                      <Divider />

                      <BlockStack gap="200" inlineAlign="start">
                        <Text as="strong" variant="bodySm">Features & Security</Text>
                        {plan.basedOnPlanTitle && (
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                            <Icon source={CheckIcon} tone="success" />
                            <Text as="strong" variant="bodySm">All {plan.basedOnPlanTitle} Plan features +</Text>
                          </div>
                        )}
                        {displayFeatures.map((feature, i) => (
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
                            price > currentPrice && plan.interval === currentPlanDetails?.interval
                              ? handleSubscribe(plan.name)
                              : plan.name === "free"
                                ? requestDowngrade(plan)
                                : handleSubscribe(plan.name)
                          }
                        >
                          {isCurrent
                            ? "Current Plan"
                            : plan.interval !== currentPlanDetails?.interval
                              ? plan.interval === "ANNUAL" && yearlySavingsPct > 0
                                ? `Switch to yearly · save ${yearlySavingsPct}%`
                                : `Switch to ${plan.title} Plan`
                              : price > currentPrice
                              ? `Upgrade to ${plan.title} Plan`
                              : `Downgrade to ${plan.title} Plan`}
                        </Button>
                      </Box>
                    </BlockStack>
                  </Box>
                </div>
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

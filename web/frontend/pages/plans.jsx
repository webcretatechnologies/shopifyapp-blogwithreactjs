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
import { useNavigate, useLocation } from "react-router-dom";
import { smartBackAction } from "../utils/smartBack";

function applyCouponDiscount(price, coupon) {
  if (coupon.discountType === "PERCENTAGE") {
    return Math.max(0, Math.round(price * (1 - Number(coupon.percentOff) / 100) * 100) / 100);
  }
  return Math.max(0, Math.round((price - Number(coupon.amountOff)) * 100) / 100);
}

export default function Plans() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activePlan, setActivePlan] = useState("");
  const [postCount, setPostCount] = useState(0);
  const [postLimit, setPostLimit] = useState(10);
  const [blogCount, setBlogCount] = useState(0);
  const [blogLimit, setBlogLimit] = useState(null);
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

  useEffect(() => {
    fetchBillingData();
  }, []);

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
      setPostLimit(checkData.postLimit ?? 10);
      setBlogCount(checkData.blogCount || 0);
      setBlogLimit(checkData.blogLimit ?? null);
      setBillingCycle(checkData.billingCycle || null);
      setDynamicPlans(plansData.plans || []);
    } catch (err) {
      console.error("Failed to load plans data:", err);
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
        if (data.confirmationUrl) window.open(data.confirmationUrl, "_top");
        else if (data.isFree) await fetchBillingData();
      } else {
        const err = await res.json();
        setError(err.error || "Failed to process subscription.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
      setSubmittingTier(null);
    }
  };

  const isFreePlanActive = activePlan.toLowerCase() === "free" || !activePlan;
  const currentPlanDetails = dynamicPlans.find((p) => p.name === activePlan);
  const currentPlanTitle = currentPlanDetails?.title || (isFreePlanActive ? "Free" : activePlan);
  const currentPrice = Number(currentPlanDetails?.price ?? 0);

  const postLimitLabel = postLimit === null ? "Unlimited" : `${postLimit} Limit`;
  const usagePct = postLimit === null ? 0 : Math.min(100, Math.round((postCount / postLimit) * 100));

  const blogLimitLabel = blogLimit === null ? "Unlimited" : `${blogLimit} Limit`;
  const blogUsagePct = blogLimit === null ? 0 : Math.min(100, Math.round((blogCount / blogLimit) * 100));

  const formatDate = (isoOrDate) => {
    if (!isoOrDate) return null;
    return new Date(isoOrDate).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  };

  const sortedPlans = [...dynamicPlans].sort((a, b) => Number(a.price) - Number(b.price));

  return (
    <Page
      title="Plans & Billing"
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
                <InlineStack align="space-between">
                  <Text as="h3" variant="headingMd">Plan Usage</Text>
                  <Badge tone="info">{`${currentPlanTitle} Plan`}</Badge>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  Usage limits reset at the start of your next 30-day billing cycle.
                </Text>

                {billingCycle && (
                  <Banner tone={billingCycle.isTrial ? "info" : "success"}>
                    <Text as="p" variant="bodySm">
                      {billingCycle.isTrial ? (
                        <>
                          Free trial — <strong>{billingCycle.trialDaysRemaining} day{billingCycle.trialDaysRemaining === 1 ? "" : "s"} left</strong>
                          {billingCycle.trialEndsAt ? `, then billing starts ${formatDate(billingCycle.trialEndsAt)}` : ""}.
                        </>
                      ) : billingCycle.renewsOn ? (
                        <>Renews on <strong>{formatDate(billingCycle.renewsOn)}</strong>.</>
                      ) : (
                        "Active subscription."
                      )}
                      {billingCycle.isTestCharge && " (Test charge — no real payment will be collected.)"}
                    </Text>
                  </Banner>
                )}

                <InlineGrid columns={{ xs: 1, sm: 2 }} gap="800">
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="strong" variant="bodySm">Articles</Text>
                      <Badge tone="info">{postLimitLabel}</Badge>
                    </InlineStack>
                    <ProgressBar progress={usagePct} tone="success" size="small" />
                    <InlineStack align="space-between" blockAlign="baseline">
                      <Text as="strong" variant="bodySm">{postCount}</Text>
                      <Text as="p" variant="bodyXs" tone="subdued">
                        {postLimit === null ? "Unlimited" : `${usagePct}% used`}
                      </Text>
                    </InlineStack>
                  </BlockStack>

                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="strong" variant="bodySm">Shopify Blogs</Text>
                      <Badge tone="info">{blogLimitLabel}</Badge>
                    </InlineStack>
                    <ProgressBar progress={blogUsagePct} tone="success" size="small" />
                    <InlineStack align="space-between" blockAlign="baseline">
                      <Text as="strong" variant="bodySm">{blogCount}</Text>
                      <Text as="p" variant="bodyXs" tone="subdued">
                        {blogLimit === null ? "Unlimited" : `${blogUsagePct}% used`}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </InlineGrid>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {!isLoading && (
        <>
        <Layout.Section>
          <Box paddingBlockStart="600" paddingBlockEnd="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingLg">Choose Your Plan</Text>
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
          <InlineGrid columns={{ xs: 1, md: sortedPlans.length || 1 }} gap="400">
            {sortedPlans.map((plan, index) => {
              const isCurrent = activePlan === plan.name;
              const isRecommended = Number(plan.price) > 0 && index === sortedPlans.length - 1;
              const price = Number(plan.price);

              const couponAppliesHere = Boolean(
                appliedCoupon &&
                price > 0 &&
                (appliedCoupon.appliesTo !== "SPECIFIC_PLANS" ||
                  appliedCoupon.planTiers?.includes(plan.name))
              );
              const discountedPrice = couponAppliesHere ? applyCouponDiscount(price, appliedCoupon) : null;

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
                        ) : couponAppliesHere ? (
                          <BlockStack gap="100">
                            <InlineStack gap="150" blockAlign="baseline">
                              <Text as="span" variant="bodyLg" tone="subdued" textDecorationLine="line-through">
                                ${price.toFixed(2)}
                              </Text>
                              <Text as="span" variant="heading2xl">${discountedPrice.toFixed(2)}</Text>
                              <Text as="span" variant="bodySm" tone="subdued">/month</Text>
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
                            <Text as="span" variant="bodySm" tone="subdued">/month</Text>
                          </InlineStack>
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
                          onClick={() => handleSubscribe(plan.name)}
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
    </Page>
  );
}

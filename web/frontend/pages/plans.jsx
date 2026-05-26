import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Grid,
  Divider,
  Box,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { Check, ArrowRight, Star, Sparkles } from "lucide-react";

export default function Plans() {
  const [activePlan, setActivePlan] = useState("");
  const [dynamicPlans, setDynamicPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/billing/check")
      .then((res) => res.json())
      .then((data) => {
        setActivePlan(data.activePlan || "free");
      });

    fetch("/api/billing/plans")
      .then((res) => res.json())
      .then((data) => {
        setDynamicPlans(data.plans || []);
        setIsLoading(false);
      });
  }, []);

  const handleSubscribe = async (planName) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/billing/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planName }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.confirmationUrl) {
          window.open(data.confirmationUrl, "_top");
        } else if (data.isFree) {
          setActivePlan("free");
          setIsLoading(false);
        }
      } else {
        const errorData = await response.json();
        console.error("Failed to request subscription:", errorData);
        alert(errorData.error || "Failed to process subscription.");
        setIsLoading(false);
      }
    } catch (err) {
      console.error(err);
      setIsLoading(false);
    }
  };

  // Determine which plan to feature as "Most Popular"
  // Pick the middle plan or the first paid non-active plan
  const getFeaturedIndex = (plans) => {
    if (plans.length <= 1) return -1;
    const paid = plans.filter(
      (p) => !p.name.toLowerCase().includes("free") && Number(p.price) > 0
    );
    if (paid.length === 0) return -1;
    // Feature the middle paid plan, or the second one
    const middleIdx = Math.floor(paid.length / 2);
    const featuredName = paid[middleIdx]?.name;
    return plans.findIndex((p) => p.name === featuredName);
  };

  const featuredIndex = getFeaturedIndex(dynamicPlans);

  return (
    <Page title="Plans & Billing" subtitle="Choose the plan that fits your business">
      <Layout>
        <Layout.Section>
          <Box paddingBlockEnd="400">
            <Text variant="bodyLg" tone="subdued" alignment="center">
              Unlock the right tools for your store. Upgrade, downgrade, or switch plans at any time — no lock-in.
            </Text>
          </Box>

          {isLoading && dynamicPlans.length === 0 ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
              <BlockStack gap="300" alignInline="center">
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    border: "3px solid var(--p-color-border)",
                    borderTopColor: "var(--p-color-text-interactive)",
                    animation: "spinner 0.7s linear infinite",
                  }}
                />
                <style>{`@keyframes spinner { to { transform: rotate(360deg) } }`}</style>
                <Text variant="headingMd" tone="subdued">
                  Loading available plans...
                </Text>
              </BlockStack>
            </div>
          ) : (
            <Grid>
              {dynamicPlans.map((tier, idx) => {
                const isActive = activePlan === tier.name;
                const isFeatured = idx === featuredIndex;
                const isFree = tier.name.toLowerCase().includes("free") || Number(tier.price) === 0;
                const intervalLabel = tier.interval === "ANNUAL" ? "yr" : "mo";
                const btnVariant = isActive ? "secondary" : isFeatured ? "primary" : "secondary";
                const btnLabel = isActive
                  ? "Current Plan"
                  : isFree
                    ? "Downgrade"
                    : "Upgrade";

                return (
                  <Grid.Cell
                    key={tier.name}
                    columnSpan={{ xs: 6, sm: 6, md: 3, lg: 3, xl: 3 }}
                  >
                    <div
                      style={{
                        position: "relative",
                        height: "100%",
                        display: "flex",
                      }}
                    >
                      {/* Featured badge */}
                      {isFeatured && (
                        <div
                          style={{
                            position: "absolute",
                            top: -12,
                            left: "50%",
                            transform: "translateX(-50%)",
                            zIndex: 2,
                          }}
                        >
                          <Badge tone="attention" size="small">
                            <InlineStack gap="100" align="center" blockAlign="center">
                              <Star size={12} fill="currentColor" />
                              <span>Most Popular</span>
                            </InlineStack>
                          </Badge>
                        </div>
                      )}

                      <div
                        style={{
                          width: "100%",
                          display: "flex",
                          transition: "all 0.25s ease",
                          borderRadius: "var(--p-border-radius-2, 8px)",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            const card = e.currentTarget;
                            card.style.boxShadow =
                              "0 8px 30px rgba(0,0,0,0.08)";
                            card.style.transform = "translateY(-2px)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            const card = e.currentTarget;
                            card.style.boxShadow = isFeatured
                              ? "0 4px 20px rgba(0, 128, 96, 0.12)"
                              : "0 1px 3px rgba(0,0,0,0.04)";
                            card.style.transform = "translateY(0)";
                          }
                        }}
                      >
                      <Card
                        background={isActive ? "bg-surface-success" : "bg-surface"}
                        style={{
                          width: "100%",
                          display: "flex",
                          flexDirection: "column",
                          border: isFeatured
                            ? "2px solid var(--p-color-border-interactive)"
                            : isActive
                              ? "2px solid var(--p-color-border-success)"
                              : "1px solid var(--p-color-border-subdued)",
                          cursor: "default",
                          overflow: "hidden",
                        }}
                        >
                        {/* HEADER: Plan name + icon */}
                        <Box paddingBlockStart="500" paddingInlineStart="500" paddingInlineEnd="500">
                          <BlockStack gap="100">
                            <InlineStack gap="200" align="start" blockAlign="center">
                              <Text as="h3" variant="headingLg" fontWeight="bold">
                                {tier.title || tier.name}
                              </Text>
                              {isActive && (
                                <Badge tone="success" size="small">
                                  <InlineStack gap="50" align="center" blockAlign="center">
                                    <Sparkles size={10} />
                                    <span>Active</span>
                                  </InlineStack>
                                </Badge>
                              )}
                            </InlineStack>
                            {tier.description && (
                              <Text as="p" variant="bodySm" tone="subdued">
                                {tier.description}
                              </Text>
                            )}
                          </BlockStack>
                        </Box>

                        <Box paddingInlineStart="500" paddingInlineEnd="500" paddingBlockStart="400">
                          <BlockStack gap="0">
                            <InlineStack gap="050" blockAlign="baseline" align="start">
                              <Text
                                as="span"
                                variant="heading4xl"
                                fontWeight="bold"
                                tone={isActive ? "success" : "base"}
                              >
                                ${Number(tier.price).toFixed(2)}
                              </Text>
                              <Text
                                as="span"
                                variant="headingSm"
                                tone="subdued"
                              >
                                /{intervalLabel}
                              </Text>
                            </InlineStack>{tier.trialDays ? (
                            <Text variant="bodyXs" tone="success" fontWeight="medium">
                              {tier.trialDays}-day free trial
                            </Text>
                          ) : null}
                          </BlockStack>
                        </Box>

                        <Box padding="500">
                          <Divider />
                        </Box>

                        <Box paddingInlineStart="500" paddingInlineEnd="500" paddingBlockEnd="0" style={{ flex: 1 }}>
                          <BlockStack gap="300">
                            {Array.isArray(tier.features) &&
                              tier.features.map((feature, i) => (
                                <InlineStack key={i} gap="200" align="start" blockAlign="start">
                                  <div
                                    style={{
                                      flexShrink: 0,
                                      width: 20,
                                      height: 20,
                                      borderRadius: "50%",
                                      backgroundColor: isActive
                                        ? "var(--p-color-bg-success-subdued, #e3f1e8)"
                                        : "var(--p-color-bg-subdued, #f6f6f7)",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      marginTop: 1,
                                    }}
                                  >
                                    <Check
                                      size={12}
                                      color={
                                        isActive
                                          ? "var(--p-color-text-success, #008060)"
                                          : "var(--p-color-text, #202223)"
                                      }
                                      strokeWidth={3}
                                    />
                                  </div>
                                  <Text variant="bodySm">{feature}</Text>
                                </InlineStack>
                              ))}
                          </BlockStack>
                        </Box>

                        {/* CTA BUTTON */}
                        <Box padding="500" paddingBlockStart="400" style={{ marginTop: "auto" }}>
                          <Button
                            fullWidth
                            size="large"
                            variant={btnVariant}
                            disabled={isActive || isLoading}
                            onClick={() => handleSubscribe(tier.name)}
                          >
                            {!isActive && <ArrowRight size={16} style={{marginRight: 6}} />}{btnLabel}
                          </Button>
                          {isActive && (
                            <Box paddingBlockStart="150">
                              <Text
                                as="p"
                                variant="bodyXs"
                                tone="success"
                                alignment="center"
                              >
                                You are currently on this plan
                              </Text>
                            </Box>
                          )}
                        </Box>
                      </Card>
                    </div>
                    </div>
                  </Grid.Cell>
                );
              })}
            </Grid>
          )}

          {/* FOOTER: trust / guarantee */}
          {!isLoading && dynamicPlans.length > 0 && (
            <Box paddingBlockStart="600" padding="400">
              <Card background="bg-surface-subdued">
                <Box padding="400">
                  <BlockStack gap="300" alignInline="center">
                    <InlineStack gap="300" align="center" blockAlign="center" wrap={false}>
                      <Check size={16} color="var(--p-color-text-success, #008060)" strokeWidth={3} />
                      <Text variant="bodySm" tone="subdued" alignment="center">
                        Switch plans anytime — no penalties or hidden fees
                      </Text>
                    </InlineStack>
                    <InlineStack gap="300" align="center" blockAlign="center" wrap={false}>
                      <Check size={16} color="var(--p-color-text-success, #008060)" strokeWidth={3} />
                      <Text variant="bodySm" tone="subdued" alignment="center">
                        All plans include Shopify's secure billing infrastructure
                      </Text>
                    </InlineStack>
                    <InlineStack gap="300" align="center" blockAlign="center" wrap={false}>
                      <Check size={16} color="var(--p-color-text-success, #008060)" strokeWidth={3} />
                      <Text variant="bodySm" tone="subdued" alignment="center">
                        Cancel your subscription at any time from your Shopify admin
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </Box>
              </Card>
            </Box>
          )}
        </Layout.Section>
      </Layout>
    </Page>
  );
}

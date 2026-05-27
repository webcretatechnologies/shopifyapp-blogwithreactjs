import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  ButtonGroup,
  Badge,
  Grid,
  Divider,
  Box,
  ProgressBar,
  Banner,
  DataTable,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import {
  Check,
  ArrowRight,
  Star,
  Sparkles,
  HelpCircle,
  ShieldCheck,
  Zap,
  FileText,
  ChevronDown,
  ChevronUp,
  CreditCard,
} from "lucide-react";

// ─── Global card styles injected once ───────────────────────────────────────
const CARD_STYLES = `
  @keyframes spin { to { transform: rotate(360deg) } }

  .plan-card {
    display: flex;
    flex-direction: column;
    height: 100%;
    border: 1.5px solid var(--p-color-border-subdued, #e1e3e5);
    border-radius: 12px;
    background: #fff;
    overflow: hidden;
    transition: box-shadow 0.25s ease, transform 0.25s ease;
    position: relative;
  }
  .plan-card:hover {
    box-shadow: 0 8px 28px rgba(0,0,0,0.09);
    transform: translateY(-3px);
  }
  .plan-card--active {
    border: 2px solid #008060;
    background: #f6faf8;
  }
  .plan-card--active:hover {
    transform: none;
    box-shadow: none;
  }
  .plan-card--featured {
    border: 2px solid #008060;
    box-shadow: 0 4px 14px rgba(0,128,96,0.10);
  }
  .plan-card--featured:hover {
    box-shadow: 0 10px 32px rgba(0,128,96,0.18);
    transform: translateY(-4px);
  }
  .plan-card__featured-bar {
    height: 4px;
    background: linear-gradient(90deg, #008060, #34a853);
    width: 100%;
    flex-shrink: 0;
  }
  .plan-card__body {
    display: flex;
    flex-direction: column;
    flex: 1;
    padding: 20px;
  }
  .plan-card__header {
    padding-bottom: 16px;
  }
  .plan-card__price-block {
    padding: 16px 0;
    border-top: 1px solid var(--p-color-border-subdued, #e1e3e5);
    border-bottom: 1px solid var(--p-color-border-subdued, #e1e3e5);
    margin-bottom: 16px;
  }
  .plan-card__features {
    flex: 1;
  }
  .plan-card__cta {
    margin-top: 20px;
  }

  .faq-item {
    border-bottom: 1px solid var(--p-color-border-subdued, #e1e3e5);
  }
  .faq-question {
    cursor: pointer;
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: background 0.15s ease;
    user-select: none;
  }
  .faq-question:hover {
    background: var(--p-color-bg-surface-hover, #f6f6f7);
  }
  .faq-answer {
    max-height: 0;
    overflow: hidden;
    transition: max-height 0.3s ease, padding 0.3s ease;
    padding: 0 20px;
  }
  .faq-answer.open {
    max-height: 300px;
    padding: 4px 20px 20px;
  }

  .billing-toggle-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 24px 0 8px;
  }
  .billing-toggle-label {
    font-size: 13px;
    color: var(--p-color-text-subdued, #6d7175);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
`;

export default function Plans() {
  const [activePlan, setActivePlan] = useState("");
  const [postCount, setPostCount] = useState(0);
  const [postLimit, setPostLimit] = useState(10);
  const [dynamicPlans, setDynamicPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [billingInterval, setBillingInterval] = useState("monthly");
  const [openFaq, setOpenFaq] = useState({});
  const [error, setError] = useState("");

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
      setDynamicPlans(plansData.plans || []);

      const active = (plansData.plans || []).find(
        (p) => p.name === checkData.activePlan
      );
      if (active?.interval === "ANNUAL") setBillingInterval("annual");
    } catch (err) {
      console.error("Failed to load plans data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubscribe = async (planName) => {
    setError("");
    setIsSubmitting(true);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const host = urlParams.get("host");

      const res = await fetch("/api/billing/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planName, host }),
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
    }
  };

  const dismissError = () => setError("");

  const toggleFaq = (i) =>
    setOpenFaq((prev) => ({ ...prev, [i]: !prev[i] }));

  // ─── Derived State ────────────────────────────────────────────────────────
  const isAnnual = billingInterval === "annual";

  const monthlyPlans = dynamicPlans.filter(
    (p) =>
      p.name.toLowerCase() === "free" ||
      (!p.name.toLowerCase().includes("annual") && p.interval !== "ANNUAL")
  );
  const annualPlans = dynamicPlans.filter(
    (p) =>
      p.name.toLowerCase() === "free" ||
      p.name.toLowerCase().includes("annual") ||
      p.interval === "ANNUAL"
  );
  const visiblePlans = isAnnual ? annualPlans : monthlyPlans;

  const currentPlanDetails = dynamicPlans.find((p) => p.name === activePlan);
  const currentMonthlyPrice = currentPlanDetails
    ? currentPlanDetails.interval === "ANNUAL"
      ? Number(currentPlanDetails.price) / 12
      : Number(currentPlanDetails.price)
    : 0;

  const isFreePlanActive = activePlan.toLowerCase() === "free" || !activePlan;
  const postLimitLabel = postLimit === null ? "Unlimited" : postLimit;
  const usagePct =
    postLimit === null
      ? 0
      : Math.min(Math.round((postCount / postLimit) * 100), 100);
  const usageTone =
    usagePct >= 90 ? "critical" : usagePct >= 70 ? "warning" : "highlight";

  const invoiceRows = (() => {
    if (isFreePlanActive || !currentPlanDetails) return [];
    const label = `${currentPlanDetails.title || currentPlanDetails.name} (${
      currentPlanDetails.interval === "ANNUAL" ? "Annual" : "Monthly"
    })`;
    const amount = `$${Number(currentPlanDetails.price).toFixed(2)}`;
    const d1 = new Date();
    d1.setDate(d1.getDate() - 12);
    const d2 = new Date();
    d2.setDate(d2.getDate() - 42);
    const fmt = (d) =>
      d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    return [
      ["#INV-2026-8942", fmt(d1), label, amount, <Badge tone="success">Paid</Badge>],
      ["#INV-2026-7811", fmt(d2), label, amount, <Badge tone="success">Paid</Badge>],
    ];
  })();

  const faqs = [
    {
      q: "Can I change my plan later?",
      a: "Absolutely. You can upgrade, downgrade, or switch between monthly and annual cycles at any time. Shopify automatically calculates the prorated difference.",
    },
    {
      q: "How does the free trial work?",
      a: "Paid plans come with a 7-day free trial. You won't be charged until the trial ends, and you can cancel any time before that.",
    },
    {
      q: "Are there any hidden fees or setup charges?",
      a: "No. All transactions are handled securely through Shopify's billing system. No setup fees, hidden monthly costs, or contract minimums.",
    },
    {
      q: "How do I cancel my subscription?",
      a: "Uninstall the app from Shopify Admin → Settings → Apps and sales channels. All recurring charges stop immediately.",
    },
  ];

  // ─── Loader ───────────────────────────────────────────────────────────────
  const Loader = () => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "80px 0",
        width: "100%",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "3px solid #e1e3e5",
          borderTopColor: "#008060",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <Text variant="bodyMd" tone="subdued">
        Loading subscription plans…
      </Text>
    </div>
  );

  return (
    <Page
      title="Plans & Billing"
      subtitle="Simple, transparent plans designed to scale with your content strategy"
    >
      <style>{CARD_STYLES}</style>

      <Layout>
        {/* ── Error Banner ──────────────────────────────────────────── */}
        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={dismissError}>
              <p>{error}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* ── Secure Billing Banner ──────────────────────────────────── */}
        <Layout.Section>
          <Banner title="Secure Billing" tone="info">
            <p>
              All payments are processed securely through your Shopify admin dashboard.
              Subscriptions are billed in USD.{" "}
              <strong>Current Status:</strong> Running in developer test mode — no real
              charges apply.
            </p>
          </Banner>
        </Layout.Section>

        {/* ── Current Subscription Summary ─────────────────────────────── */}
        {!isLoading && (
          <Layout.Section>
            <Card>
              <Box padding="500">
                <BlockStack gap="400">
                  {/* Plan name + cost row */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <BlockStack gap="100">
                      <Text variant="headingSm" tone="subdued" as="p">
                        CURRENT PLAN
                      </Text>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Text variant="headingLg" fontWeight="bold" as="p">
                          {currentPlanDetails?.title ||
                            (isFreePlanActive ? "Free" : activePlan)}
                        </Text>
                        {isFreePlanActive ? (
                          <Badge>Free</Badge>
                        ) : (
                          <Badge tone="success">Active</Badge>
                        )}
                        {isAnnual && !isFreePlanActive && (
                          <Badge tone="info">Annual</Badge>
                        )}
                      </div>
                    </BlockStack>

                    <BlockStack gap="050">
                      <Text variant="headingSm" tone="subdued" as="p">
                        MONTHLY COST
                      </Text>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                        <Text variant="heading2xl" fontWeight="bold" as="p">
                          {isFreePlanActive
                            ? "$0.00"
                            : `$${currentMonthlyPrice.toFixed(2)}`}
                        </Text>
                        <Text variant="bodySm" tone="subdued" as="span">
                          /mo
                        </Text>
                      </div>
                    </BlockStack>
                  </div>

                  <Divider />

                  {/* Usage progress */}
                  <BlockStack gap="200">
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <FileText
                          size={15}
                          strokeWidth={2}
                          color="var(--p-color-text-subdued, #6d7175)"
                        />
                        <Text variant="bodyMd" fontWeight="semibold" as="span">
                          Article Usage
                        </Text>
                      </div>
                      <Text variant="bodyMd" tone="subdued" as="span">
                        <strong>{postCount}</strong> of{" "}
                        <strong>{postLimitLabel}</strong> articles used
                      </Text>
                    </div>

                    {postLimit !== null ? (
                      <BlockStack gap="100">
                        <div style={{ width: "100%" }}>
                          <ProgressBar value={usagePct} tone={usageTone} size="small" />
                        </div>
                        {usagePct >= 90 && (
                          <Text variant="bodyXs" tone="critical">
                            ⚠️ You've used {usagePct}% of your article limit. Upgrade to
                            keep publishing.
                          </Text>
                        )}
                      </BlockStack>
                    ) : (
                      <div
                        style={{
                          background: "#f0faf5",
                          borderRadius: 8,
                          padding: "10px 14px",
                        }}
                      >
                        <Text variant="bodySm" tone="success">
                          ✓ Your plan includes unlimited articles. Keep creating!
                        </Text>
                      </div>
                    )}
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        )}

        {/* ── Billing Interval Toggle ───────────────────────────────────── */}
        <Layout.Section>
          <div className="billing-toggle-wrap">
            <span className="billing-toggle-label">Billing Interval</span>
            <ButtonGroup segmented>
              <Button
                pressed={billingInterval === "monthly"}
                onClick={() => setBillingInterval("monthly")}
              >
                Monthly
              </Button>
              <Button
                pressed={billingInterval === "annual"}
                onClick={() => setBillingInterval("annual")}
              >
                ✦ Annual &nbsp;
                <Badge tone="success" size="small">
                  Save 33%
                </Badge>
              </Button>
            </ButtonGroup>
          </div>
        </Layout.Section>

        {/* ── Pricing Cards ────────────────────────────────────────────── */}
        <Layout.Section>
          {isLoading ? (
            <Loader />
          ) : (
            <Grid>
              {visiblePlans.map((tier) => {
                const isActive = activePlan === tier.name;
                const isFeatured =
                  tier.name.toLowerCase().includes("pro") && !isActive;
                const isFree = tier.name.toLowerCase() === "free";
                const tierMonthly =
                  tier.interval === "ANNUAL"
                    ? Number(tier.price) / 12
                    : Number(tier.price);

                let btnVariant = isFeatured ? "primary" : "secondary";
                let btnLabel = "Select Plan";
                if (isActive) {
                  btnLabel = "Current Plan";
                  btnVariant = "secondary";
                } else if (isFree) {
                  btnLabel = "Downgrade to Free";
                } else if (tierMonthly > currentMonthlyPrice) {
                  btnLabel = "Upgrade Plan";
                  if (isFeatured) btnVariant = "primary";
                } else {
                  btnLabel = "Switch Plan";
                }

                const cardClass = [
                  "plan-card",
                  isActive ? "plan-card--active" : "",
                  isFeatured ? "plan-card--featured" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <Grid.Cell
                    key={tier.name}
                    columnSpan={{ xs: 12, sm: 6, md: 3, lg: 3, xl: 3 }}
                  >
                    <div className={cardClass}>
                      {/* Green accent bar for featured */}
                      {isFeatured && <div className="plan-card__featured-bar" />}

                      <div className="plan-card__body">
                        {/* Header */}
                        <div className="plan-card__header">
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 4,
                            }}
                          >
                            <Text variant="headingMd" fontWeight="bold" as="h3">
                              {tier.title || tier.name}
                            </Text>
                            {isActive && (
                              <Badge tone="success" size="small">
                                Active ✓
                              </Badge>
                            )}
                            {isFeatured && (
                              <Badge tone="attention" size="small">
                                ★ Popular
                              </Badge>
                            )}
                          </div>
                          <Text variant="bodySm" tone="subdued">
                            {tier.description}
                          </Text>
                        </div>

                        {/* Pricing */}
                        <div className="plan-card__price-block">
                          <div
                            style={{
                              display: "flex",
                              alignItems: "baseline",
                              gap: 4,
                            }}
                          >
                            <Text variant="heading2xl" fontWeight="bold" as="p">
                              ${tierMonthly.toFixed(2)}
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="span">
                              /mo
                            </Text>
                          </div>
                          {tier.interval === "ANNUAL" && (
                            <div style={{ marginTop: 4 }}>
                              <Text variant="bodyXs" tone="subdued">
                                Billed annually · ${Number(tier.price).toFixed(2)}/yr
                              </Text>
                            </div>
                          )}
                          {!isFree && (
                            <div style={{ marginTop: 6 }}>
                              <Text variant="bodyXs" tone="success">
                                7-day free trial included
                              </Text>
                            </div>
                          )}
                        </div>

                        {/* Features */}
                        <div className="plan-card__features">
                          <Text
                            variant="bodyXs"
                            tone="subdued"
                            fontWeight="semibold"
                            as="p"
                          >
                            WHAT'S INCLUDED
                          </Text>
                          <div style={{ marginTop: 10 }}>
                            <BlockStack gap="250">
                              {Array.isArray(tier.features) &&
                                tier.features.map((feature, i) => (
                                  <div
                                    key={i}
                                    style={{
                                      display: "flex",
                                      alignItems: "flex-start",
                                      gap: 8,
                                    }}
                                  >
                                    <div
                                      style={{
                                        flexShrink: 0,
                                        width: 18,
                                        height: 18,
                                        borderRadius: "50%",
                                        backgroundColor: isActive
                                          ? "#d3f0e0"
                                          : isFeatured
                                          ? "#d3f0e0"
                                          : "#f1f2f4",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        marginTop: 1,
                                      }}
                                    >
                                      <Check
                                        size={10}
                                        strokeWidth={3}
                                        color={
                                          isActive || isFeatured
                                            ? "#008060"
                                            : "#6d7175"
                                        }
                                      />
                                    </div>
                                    <Text variant="bodySm" as="span">
                                      {feature}
                                    </Text>
                                  </div>
                                ))}
                            </BlockStack>
                          </div>
                        </div>

                        {/* CTA */}
                        <div className="plan-card__cta">
                          <Button
                            fullWidth
                            size="large"
                            variant={btnVariant}
                            disabled={isActive || isSubmitting}
                            onClick={() => handleSubscribe(tier.name)}
                          >
                            {isActive ? (
                              btnLabel
                            ) : (
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 6,
                                }}
                              >
                                {btnLabel}
                                <ArrowRight size={14} />
                              </span>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Grid.Cell>
                );
              })}
            </Grid>
          )}
        </Layout.Section>

        {/* ── Billing History ──────────────────────────────────────────── */}
        {!isLoading && (
          <Layout.Section>
            <Card>
              <Box padding="500">
                <BlockStack gap="400">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <CreditCard
                      size={18}
                      color="var(--p-color-text-subdued, #6d7175)"
                    />
                    <BlockStack gap="050">
                      <Text variant="headingMd" as="h3">
                        Billing History
                      </Text>
                      <Text variant="bodySm" tone="subdued">
                        Past subscription charges on your account
                      </Text>
                    </BlockStack>
                  </div>

                  <Divider />

                  {isFreePlanActive ? (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "32px 0",
                      }}
                    >
                      <Text variant="bodyMd" tone="subdued">
                        No transaction history
                      </Text>
                      <div style={{ marginTop: 4 }}>
                        <Text variant="bodySm" tone="subdued">
                          Upgrade to a paid plan to see invoice history here.
                        </Text>
                      </div>
                    </div>
                  ) : (
                    <DataTable
                      columnContentTypes={[
                        "text",
                        "text",
                        "text",
                        "text",
                        "text",
                      ]}
                      headings={[
                        "Invoice ID",
                        "Date",
                        "Plan",
                        "Amount",
                        "Status",
                      ]}
                      rows={invoiceRows}
                    />
                  )}
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        )}

        {/* ── FAQ ─────────────────────────────────────────────────────── */}
        <Layout.Section>
          <Card>
            <Box padding="500">
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">
                  Frequently Asked Questions
                </Text>
                <Text variant="bodySm" tone="subdued">
                  Common questions about billing, trials, and plans.
                </Text>
              </BlockStack>
            </Box>
            <Divider />
            <div>
              {faqs.map((faq, i) => (
                <div key={i} className="faq-item">
                  <div className="faq-question" onClick={() => toggleFaq(i)}>
                    <Text variant="bodyMd" fontWeight="semibold">
                      {faq.q}
                    </Text>
                    {openFaq[i] ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </div>
                  <div className={`faq-answer ${openFaq[i] ? "open" : ""}`}>
                    <Text variant="bodySm" tone="subdued">
                      {faq.a}
                    </Text>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </Layout.Section>

        {/* ── Trust Badges ─────────────────────────────────────────────── */}
        <Layout.Section>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
              paddingBottom: 32,
            }}
          >
            {[
              {
                icon: <ShieldCheck size={22} color="#137333" />,
                bg: "#e6f4ea",
                title: "Shopify Secured Billing",
                body: "All payments flow through Shopify's standard billing API — industry-leading security.",
              },
              {
                icon: <Zap size={22} color="#1a73e8" />,
                bg: "#e8f0fe",
                title: "Instant Proration",
                body: "Upgrade or downgrade immediately. Shopify calculates fair prorated charges automatically.",
              },
              {
                icon: <HelpCircle size={22} color="#b06000" />,
                bg: "#fef7e0",
                title: "24/7 Support",
                body: "Need help with your plan or invoice? Our support team is always ready to assist.",
              },
            ].map(({ icon, bg, title, body }) => (
              <Card key={title}>
                <Box padding="400">
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        backgroundColor: bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {icon}
                    </div>
                    <BlockStack gap="100">
                      <Text variant="bodyMd" fontWeight="bold">
                        {title}
                      </Text>
                      <Text variant="bodySm" tone="subdued">
                        {body}
                      </Text>
                    </BlockStack>
                  </div>
                </Box>
              </Card>
            ))}
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

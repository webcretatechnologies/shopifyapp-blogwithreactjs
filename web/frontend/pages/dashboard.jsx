import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Box,
  InlineStack,
  BlockStack,
  Divider,
  Badge,
  ProgressBar,
  Select,
  Banner,
  SkeletonBodyText,
  SkeletonDisplayText,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { RefreshIcon } from "@shopify/polaris-icons";
import KpiRow from "../components/common/KpiRow";
import AnalyticsChart from "../components/analytics/AnalyticsChart";
import SetupGuide from "../components/SetupGuide";

const RANGE_OPTIONS = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
];

// ─── Mini Funnel ─────────────────────────────────────────────────────────
function MiniFunnel({ funnel = [] }) {
  if (!funnel.length) return null;
  const maxCount = Math.max(...funnel.map((f) => f.count), 1);

  return (
    <BlockStack gap="200">
      {funnel.map((stage, i) => {
        const pct = (stage.count / maxCount) * 100;
        return (
          <div key={stage.stage}>
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="bodySm">{stage.stage}</Text>
              <Text variant="bodySm" fontWeight="semibold">
                {stage.count.toLocaleString()}
              </Text>
            </InlineStack>
            <Box paddingBlockStart="100">
              <ProgressBar
                progress={Math.round(pct)}
                size="small"
                tone={i === 3 ? "success" : i === 0 ? "primary" : "highlight"}
              />
            </Box>
          </div>
        );
      })}
    </BlockStack>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [shopInfo, setShopInfo] = useState(null);
  const [extensionActive, setExtensionActive] = useState(false);
  const [extensionLoading, setExtensionLoading] = useState(true);
  const [metaRobotsActive, setMetaRobotsActive] = useState(false);
  const [metaRobotsLoading, setMetaRobotsLoading] = useState(true);
  const [range, setRange] = useState("30");
  // Mirrors SetupGuide's dismissal flag: while the guide is visible it already
  // contains the enable-tracking step, so the banner would be a duplicate prompt.
  const [setupDismissed] = useState(
    () => localStorage.getItem("blogger_setup_dismissed") === "1"
  );

  const fetchAnalytics = async (days = range) => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/posts/analytics/summary?days=${days}`);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch {
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleRangeChange = (value) => {
    setRange(value);
    fetchAnalytics(value);
  };

  const fetchShop = async () => {
    try {
      const res = await fetch("/api/shop");
      const data = await res.json();
      setShopInfo(data.shop);
    } catch {}
  };

  const fetchExtensionStatus = async () => {
    setExtensionLoading(true);
    try {
      const res = await fetch("/api/shop/extension-status");
      const data = await res.json();
      setExtensionActive(data.active);
    } catch {} finally {
      setExtensionLoading(false);
    }
  };

  const fetchMetaRobotsStatus = async () => {
    setMetaRobotsLoading(true);
    try {
      const res = await fetch("/api/settings/meta-robots-status");
      const data = await res.json();
      setMetaRobotsActive(data.active);
    } catch {} finally {
      setMetaRobotsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    fetchShop();
    fetchExtensionStatus();
    fetchMetaRobotsStatus();
  }, []);

  const { t } = useTranslation();
  const stats = analytics?.stats;

  return (
    <>
      <TitleBar title={t("Navigation.dashboard")} />
      <Page
        title={t("Navigation.dashboard")}
        subtitle={
          shopInfo
            ? `${shopInfo.domain} · Plan: ${shopInfo.planKey?.toUpperCase() || "FREE"}`
            : ""
        }
        primaryAction={{
          content: "Write new article",
          onAction: () => navigate("/posts/new"),
        }}
        secondaryActions={[
          { content: "Manage articles", onAction: () => navigate("/posts") },
          { content: "Import posts", onAction: () => navigate("/posts/import") },
        ]}
      >
        <Layout>
          {/* ── Setup Guide ─────────────────────────────────────────── */}
          {!analyticsLoading && !extensionLoading && !metaRobotsLoading && (
            <Layout.Section>
              <SetupGuide
                shop={shopInfo?.domain}
                isExtensionActive={extensionActive}
                isMetaRobotsActive={metaRobotsActive}
                hasPosts={stats?.totalPosts > 0}
              />
            </Layout.Section>
          )}

          {/* ── Date range toolbar ──────────────────────────────────── */}
          <Layout.Section>
            <InlineStack align="end" gap="200" blockAlign="center">
              <Box minWidth="160px">
                <Select
                  label="Date range"
                  labelHidden
                  options={RANGE_OPTIONS}
                  value={range}
                  onChange={handleRangeChange}
                />
              </Box>
              <Button
                onClick={() => fetchAnalytics()}
                icon={RefreshIcon}
                accessibilityLabel="Refresh analytics"
              />
            </InlineStack>
          </Layout.Section>

          {/* ── Tracking not active — empty-state guidance ──────────── */}
          {!extensionLoading && !extensionActive && setupDismissed && (
            <Layout.Section>
              <Banner
                title="Storefront tracking isn't active yet"
                tone="warning"
                action={{
                  content: "Enable tracking",
                  onAction: () =>
                    window.open(`https://${shopInfo?.domain}/admin/themes/current/editor?context=apps`, "_blank"),
                }}
              >
                <Text as="p">
                  Views, revenue, and conversions below will stay at zero until you enable the Blog Analytics app embed in your theme editor.
                </Text>
              </Banner>
            </Layout.Section>
          )}

          {/* ── KPI Summary ────────────────────────────────────────── */}
          <Layout.Section>
            <KpiRow
              loading={analyticsLoading}
              items={[
                { label: "Total articles", value: stats?.totalPosts ?? 0 },
                {
                  label: `Views (${range}d)`,
                  value: (stats?.totalViews ?? 0).toLocaleString(),
                  trend: analytics?.trends?.views,
                },
                {
                  label: "Revenue",
                  value: `$${(stats?.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                  trend: analytics?.trends?.revenue,
                },
                {
                  label: "Conversion rate",
                  value: `${stats?.conversionRate ?? "0.00"}%`,
                  trend: analytics?.trends?.conversionRate,
                },
              ]}
            />
          </Layout.Section>

          {/* ── Multi-Series Chart ─────────────────────────────────── */}
          <Layout.Section>
            {analyticsLoading ? (
              <Card>
                <Box padding="400">
                  <SkeletonDisplayText size="small" />
                  <Box paddingBlockStart="400">
                    <SkeletonBodyText lines={6} />
                  </Box>
                </Box>
              </Card>
            ) : (
              <AnalyticsChart
                data={analytics?.daily || []}
                title={`Blog performance — last ${range} days`}
                period={range}
                showPeriodSelector={false}
                series={[
                  { key: "views", label: "Views", color: "#008060" },
                  { key: "addToCart", label: "Add to cart", color: "#e67e22" },
                  { key: "conversions", label: "Conversions", color: "#005bd3" },
                ]}
              />
            )}
          </Layout.Section>

          {/* ── Funnel + Top Posts ──────────────────── */}
          <Layout.Section variant="oneHalf">
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">Conversion funnel</Text>
                  <Divider />
                  {analyticsLoading ? (
                    <SkeletonBodyText lines={4} />
                  ) : analytics?.funnel?.length ? (
                    <MiniFunnel funnel={analytics.funnel} />
                  ) : (
                    <Text tone="subdued" variant="bodySm">
                      {extensionActive
                        ? "No funnel data yet for this period."
                        : "No funnel data yet. Enable storefront tracking above to start collecting it."}
                    </Text>
                  )}
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            {analyticsLoading ? (
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">Top posts</Text>
                    <Divider />
                    <SkeletonBodyText lines={5} />
                  </BlockStack>
                </Box>
              </Card>
            ) : analytics?.topPosts?.length > 0 ? (
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">Top posts</Text>
                    <Divider />
                    <BlockStack gap="300">
                      {analytics.topPosts.slice(0, 5).map((p, index) => (
                        <div key={p.id}>
                          <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="050">
                              <div style={{ maxWidth: "200px" }}>
                                <Text variant="bodySm" fontWeight="semibold" truncate>
                                  {p.title || "Untitled"}
                                </Text>
                              </div>
                              <Badge tone={p.status === "published" ? "success" : "info"}>
                                {p.status}
                              </Badge>
                            </BlockStack>
                            <BlockStack gap="025" align="end">
                              <Text variant="bodySm" tone="subdued">
                                {(p.views || 0).toLocaleString()} views
                              </Text>
                              {p.conversions > 0 && (
                                <Text variant="bodyXs" tone="success">
                                  {p.conversions} conversions
                                </Text>
                              )}
                            </BlockStack>
                          </InlineStack>
                        </div>
                      ))}
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Card>
            ) : (
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">Top posts</Text>
                    <Divider />
                    <Text tone="subdued" variant="bodySm">
                      {extensionActive
                        ? "No performance data yet for this period. Check back once your posts start getting traffic."
                        : "No performance data yet. Enable storefront tracking above to start collecting it."}
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
            )}
          </Layout.Section>
        </Layout>
      </Page>
    </>
  );
}

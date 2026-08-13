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
  Banner,
  SkeletonBodyText,
  SkeletonDisplayText,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { RefreshIcon, CheckCircleIcon } from "@shopify/polaris-icons";
import KpiRow from "../components/common/KpiRow";
import AnalyticsChart from "../components/analytics/AnalyticsChart";
import DateRangeFilter, { toISODateString } from "../components/analytics/DateRangePicker";
import SetupGuide from "../components/SetupGuide";
import EmbedRequirementBanner from "../components/EmbedRequirementBanner";
import { analyticsTrackerActivateUrl } from "../utils/themeEmbedUtils";

const DEFAULT_RANGE = (() => {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { start, end };
})();

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
  const [setupStatus, setSetupStatus] = useState(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [dateRange, setDateRange] = useState(DEFAULT_RANGE);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [showRefreshBadge, setShowRefreshBadge] = useState(false);
  // Mirrors SetupGuide's dismissal flag: while the guide is visible it already
  // contains the enable-tracking step, so the banner would be a duplicate prompt. Uses
  // sessionStorage (not localStorage) so an incomplete requirement resurfaces on the merchant's
  // next admin session rather than staying hidden forever once dismissed once.
  const [setupDismissed] = useState(
    () => sessionStorage.getItem("blogger_setup_dismissed") === "1"
  );

  const fetchAnalytics = async (range = dateRange, { silent = false } = {}) => {
    if (!silent) setAnalyticsLoading(true);
    try {
      const from = toISODateString(range.start);
      const to = toISODateString(range.end);
      const res = await fetch(`/api/posts/analytics/summary?from=${from}&to=${to}`);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch {
    } finally {
      if (!silent) setAnalyticsLoading(false);
    }
  };

  // Not using Polaris <Toast> — it requires a <Frame> ancestor this app's provider tree doesn't
  // have (see pages/analytics.jsx for the full explanation); a Frame-independent badge instead.
  const handleManualRefresh = () => {
    setManualRefreshing(true);
    fetchAnalytics(dateRange, { silent: true }).finally(() => {
      setManualRefreshing(false);
      setShowRefreshBadge(true);
      setTimeout(() => setShowRefreshBadge(false), 2500);
    });
  };

  const fetchShop = async () => {
    try {
      const res = await fetch("/api/shop");
      const data = await res.json();
      setShopInfo(data.shop);
    } catch {}
  };

  const fetchSetupStatus = async ({ silent = false } = {}) => {
    if (!silent) setSetupLoading(true);
    try {
      const res = await fetch("/api/shop/setup-status");
      const data = await res.json();
      setSetupStatus(data);
    } catch {} finally {
      if (!silent) setSetupLoading(false);
    }
  };

  useEffect(() => {
    fetchShop();
    fetchSetupStatus();
  }, []);

  useEffect(() => {
    fetchAnalytics(dateRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  // A merchant enabling an app embed happens in the theme editor, a separate tab — re-check
  // silently (no loading flash) whenever they switch back to this one, so a completed step
  // ticks off on its own instead of requiring a manual page reload.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchSetupStatus({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const { t } = useTranslation();
  const stats = analytics?.stats;
  const rangeDays = Math.round((dateRange.end - dateRange.start) / (24 * 60 * 60 * 1000)) + 1;

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
          {/* ── Missing OAuth scopes — needs reinstall, not a theme fix ──── */}
          {!setupLoading && setupStatus?.missingScopes?.length > 0 && (
            <Layout.Section>
              <Banner
                title="This app needs additional permissions"
                tone="critical"
                action={{
                  content: "Manage app permissions",
                  onAction: () =>
                    window.open(`https://${shopInfo?.domain}/admin/settings/apps`, "_blank"),
                }}
              >
                <Text as="p">
                  Some features may not work correctly until you reinstall or reauthorize this app
                  from your Shopify Admin's Apps page to grant the permissions it now needs.
                </Text>
              </Banner>
            </Layout.Section>
          )}

          {/* ── Setup Guide ─────────────────────────────────────────── */}
          {!analyticsLoading && !setupLoading && (
            <Layout.Section>
              <SetupGuide
                shop={shopInfo?.domain}
                isExtensionActive={setupStatus?.analyticsTracker?.active}
                isMetaRobotsActive={setupStatus?.metaRobots?.active}
                themeSupportsAppEmbeds={setupStatus?.themeSupportsAppEmbeds}
                hasPosts={stats?.totalPosts > 0}
              />
            </Layout.Section>
          )}

          {/* ── Date range toolbar ──────────────────────────────────── */}
          <Layout.Section>
            <InlineStack align="end" gap="300" blockAlign="center">
              {showRefreshBadge && (
                <Badge tone="success" icon={CheckCircleIcon}>
                  Updated
                </Badge>
              )}
              <Button
                onClick={handleManualRefresh}
                icon={RefreshIcon}
                accessibilityLabel="Refresh analytics"
                loading={manualRefreshing}
              />
              <DateRangeFilter value={dateRange} onChange={setDateRange} />
            </InlineStack>
          </Layout.Section>

          {/* ── Tracking not active — empty-state guidance ──────────── */}
          {!setupLoading && setupDismissed && (
            <Layout.Section>
              <EmbedRequirementBanner
                active={setupStatus?.analyticsTracker?.active}
                themeSupportsAppEmbeds={setupStatus?.themeSupportsAppEmbeds}
                activateUrl={analyticsTrackerActivateUrl(shopInfo?.domain || "")}
                featureName="Storefront tracking"
                whatBreaks="Views, revenue, and conversions below will stay at zero."
              />
            </Layout.Section>
          )}

          {/* ── KPI Summary ────────────────────────────────────────── */}
          <Layout.Section>
            <KpiRow
              loading={analyticsLoading}
              items={[
                { label: "Total articles", value: stats?.totalPosts ?? 0 },
                {
                  label: `Views (${rangeDays}d)`,
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
                title={`Blog performance — last ${rangeDays} days`}
                period={analytics?.daily?.length || 1}
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
                      {setupStatus?.analyticsTracker?.active
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
                      {setupStatus?.analyticsTracker?.active
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

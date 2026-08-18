import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Page,
  Layout,
  Grid,
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
  Icon,
  SkeletonBodyText,
  SkeletonDisplayText,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  RefreshIcon,
  CheckCircleIcon,
  PlusIcon,
  ImportIcon,
  ChartVerticalIcon,
  ChatIcon,
  SettingsIcon,
  BlogIcon,
} from "@shopify/polaris-icons";
import ReactApexChart from "react-apexcharts";
import KpiRow from "../components/common/KpiRow";
import AnalyticsChart from "../components/analytics/AnalyticsChart";
import SetupGuide from "../components/SetupGuide";
import EmbedRequirementBanner from "../components/EmbedRequirementBanner";
import { analyticsTrackerActivateUrl } from "../utils/themeEmbedUtils";
import { toISODateString } from "../components/analytics/DateRangePicker";

// 30-day pulse — long enough for the chart to actually show a trend line, short enough to stay a
// "how's it going" glance rather than a research tool (the full, filterable range picker lives on
// the Analytics page).
const PULSE_RANGE = (() => {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { start, end };
})();

// ─── Content Pipeline — horizontal bar chart ───────────────────────────────────────────────────
// A chart type not used anywhere else in the app (Analytics uses line/area for trends and a
// donut for device split) — this is content-status volume (how many articles are in each stage
// of the pipeline), a different data dimension entirely from performance metrics, best shown as
// a simple horizontal bar rather than borrowed from an existing Analytics chart.
function ContentPipelineChart({ published, drafts, scheduled, notSynced, loading, fullWidth = false }) {
  const categories = ["Published", "Drafts", "Scheduled", "Not synced"];
  const values = [published ?? 0, drafts ?? 0, scheduled ?? 0, notSynced ?? 0];
  const colors = ["#008060", "#8a8a8a", "#005bd3", "#e67e22"];

  const options = {
    chart: {
      type: "bar",
      toolbar: { show: false },
      fontFamily: "-apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
    },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 4,
        distributed: true,
        barHeight: "55%",
      },
    },
    colors,
    dataLabels: {
      enabled: true,
      style: { fontWeight: 600 },
    },
    legend: { show: false },
    xaxis: {
      categories,
      labels: { style: { colors: "#6d7175" } },
    },
    yaxis: {
      labels: { style: { colors: "#202223", fontWeight: 500 } },
    },
    grid: { borderColor: "#e1e3e5" },
    tooltip: {
      theme: "light",
      y: { formatter: (val) => `${val} article${val === 1 ? "" : "s"}` },
    },
  };

  return (
    <Card>
      <Box padding="400" minHeight={fullWidth ? "300px" : "360px"}>
        <BlockStack gap="300">
          <Text variant="headingMd" as="h3">Content Pipeline</Text>
          <Divider />
          {loading ? (
            <SkeletonBodyText lines={4} />
          ) : (
            <div role="img" aria-label={`Content pipeline: ${categories.map((c, i) => `${c} ${values[i]}`).join(", ")}`}>
              <ReactApexChart options={options} series={[{ name: "Articles", data: values }]} type="bar" height={fullWidth ? 200 : 260} />
            </div>
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}

// ─── Quick action tile — plain Polaris Card + Icon + Text, no bespoke styling ───────────────────
function QuickAction({ icon, label, onClick }) {
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => e.key === "Enter" && onClick()} style={{ cursor: "pointer", height: "100%" }}>
      <Card>
        <Box padding="400">
          <BlockStack gap="200" inlineAlign="center">
            <Icon source={icon} tone="base" />
            <Text variant="bodySm" fontWeight="semibold" alignment="center">
              {label}
            </Text>
          </BlockStack>
        </Box>
      </Card>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [extras, setExtras] = useState(null);
  const [extrasLoading, setExtrasLoading] = useState(true);
  const [shopInfo, setShopInfo] = useState(null);
  const [setupStatus, setSetupStatus] = useState(null);
  const [setupLoading, setSetupLoading] = useState(true);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [showRefreshBadge, setShowRefreshBadge] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  // Mirrors SetupGuide's dismissal flag: while the guide is visible it already
  // contains the enable-tracking step, so the banner would be a duplicate prompt. Uses
  // sessionStorage (not localStorage) so an incomplete requirement resurfaces on the merchant's
  // next admin session rather than staying hidden forever once dismissed once.
  const [setupDismissed] = useState(
    () => sessionStorage.getItem("blogger_setup_dismissed") === "1"
  );

  const fetchAnalytics = async ({ silent = false } = {}) => {
    if (!silent) setAnalyticsLoading(true);
    try {
      const from = toISODateString(PULSE_RANGE.start);
      const to = toISODateString(PULSE_RANGE.end);
      const res = await fetch(`/api/posts/analytics/summary?from=${from}&to=${to}`);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
        setLastLoadedAt(Date.now());
      }
    } catch {
    } finally {
      if (!silent) setAnalyticsLoading(false);
    }
  };

  const fetchExtras = async ({ silent = false } = {}) => {
    if (!silent) setExtrasLoading(true);
    try {
      const res = await fetch("/api/posts/meta/dashboard-extras");
      if (res.ok) {
        const data = await res.json();
        setExtras(data);
      }
    } catch {
    } finally {
      if (!silent) setExtrasLoading(false);
    }
  };

  // Not using Polaris <Toast> — it requires a <Frame> ancestor this app's provider tree doesn't
  // have (see pages/analytics.jsx for the full explanation); a Frame-independent badge instead.
  const handleManualRefresh = () => {
    setManualRefreshing(true);
    Promise.all([
      fetchAnalytics({ silent: true }),
      fetchExtras({ silent: true }),
    ]).finally(() => {
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
    fetchAnalytics();
    fetchExtras();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A merchant enabling an app embed happens in the theme editor, a separate tab — re-check
  // silently (no loading flash) whenever they switch back to this one, so a completed step
  // ticks off on its own instead of requiring a manual page reload.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        fetchSetupStatus({ silent: true });
        fetchExtras({ silent: true });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    const tickTimer = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(tickTimer);
  }, []);

  const freshnessLabel = (() => {
    if (!lastLoadedAt) return null;
    const secs = Math.max(0, Math.round((nowTick - lastLoadedAt) / 1000));
    if (secs < 60) return "Updated just now";
    return `Updated ${Math.round(secs / 60)}m ago`;
  })();

  const stats = analytics?.stats;
  const advancedLocked = !!analytics?.advancedLocked;
  const planUsage = extras?.planUsage;
  const usagePct = planUsage?.limit ? Math.min(100, Math.round((planUsage.used / planUsage.limit) * 100)) : 0;
  const atLimit = planUsage?.limit != null && planUsage.used >= planUsage.limit;
  const nearLimit = planUsage?.limit != null && !atLimit && usagePct >= 80;
  const isNewShop = !setupLoading && !analyticsLoading && (stats?.totalPosts ?? 0) === 0;

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
          { content: "View full analytics", onAction: () => navigate("/analytics") },
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

          {/* ── Get Started — prominent for new/unconfigured shops, still available (collapsed
               by SetupGuide's own internal state) once everything's done ────────────────── */}
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

          {/* ── Tracking not active — empty-state guidance ──────────── */}
          {!setupLoading && setupDismissed && (
            <Layout.Section>
              <EmbedRequirementBanner
                active={setupStatus?.analyticsTracker?.active}
                themeSupportsAppEmbeds={setupStatus?.themeSupportsAppEmbeds}
                activateUrl={analyticsTrackerActivateUrl(shopInfo?.domain || "")}
                featureName="Storefront tracking"
                whatBreaks="Views, visitors, and the chart below will stay at zero."
              />
            </Layout.Section>
          )}

          {/* ── Quick actions ────────────────────────────────────────── */}
          <Layout.Section>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">Quick actions</Text>
                <InlineStack gap="200" blockAlign="center">
                  {showRefreshBadge ? (
                    <Badge tone="success" icon={CheckCircleIcon}>Updated</Badge>
                  ) : (
                    freshnessLabel && (
                      <Text tone="subdued" variant="bodySm">{freshnessLabel}</Text>
                    )
                  )}
                  <Button
                    onClick={handleManualRefresh}
                    icon={RefreshIcon}
                    accessibilityLabel="Refresh dashboard"
                    loading={manualRefreshing}
                    size="slim"
                  >
                    Refresh
                  </Button>
                </InlineStack>
              </InlineStack>
              <Grid columns={{ xs: 2, sm: 3, md: 6, lg: 6, xl: 6 }} gap={{ xs: "8px", sm: "12px", md: "16px" }}>
                <Grid.Cell><QuickAction icon={PlusIcon} label="New article" onClick={() => navigate("/posts/new")} /></Grid.Cell>
                <Grid.Cell><QuickAction icon={ImportIcon} label="Import posts" onClick={() => navigate("/posts/import")} /></Grid.Cell>
                <Grid.Cell><QuickAction icon={BlogIcon} label="Templates" onClick={() => navigate("/templates")} /></Grid.Cell>
                <Grid.Cell><QuickAction icon={ChartVerticalIcon} label="Analytics" onClick={() => navigate("/analytics")} /></Grid.Cell>
                <Grid.Cell><QuickAction icon={ChatIcon} label="Comments" onClick={() => navigate("/comments")} /></Grid.Cell>
                <Grid.Cell><QuickAction icon={SettingsIcon} label="Settings" onClick={() => navigate("/settings")} /></Grid.Cell>
              </Grid>
            </BlockStack>
          </Layout.Section>

          {/* ── Action-needed strip ─────────────────────────────────────────────────
               Same KpiRow used everywhere else in the app — one consistent KPI card style, not
               a bespoke tile component. Each cell is clickable straight into the matching
               filtered view. */}
          {!isNewShop && (
            <Layout.Section>
              <KpiRow
                loading={extrasLoading}
                items={[
                  { label: "Published", value: stats?.published ?? 0, onClick: () => navigate("/posts?status=published") },
                  { label: "Drafts", value: extras?.drafts ?? 0, onClick: () => navigate("/posts?status=draft") },
                  { label: "Scheduled", value: extras?.scheduled ?? 0, onClick: () => navigate("/posts?status=scheduled") },
                  { label: "Not synced to Shopify", value: extras?.notSynced ?? 0, onClick: () => navigate("/posts?syncStatus=not_synced") },
                ]}
              />
            </Layout.Section>
          )}

          {/* ── Plan usage ────────────────────────────────────────────────────────
               A single full-width horizontal bar (plan badge + usage text + progress bar +
               action, all in one row) instead of a narrow card squeezed beside the KPI row —
               the old side-by-side layout gave Plan usage roughly a third of the row's width
               regardless of how little it needed, which is what made it look mismatched next to
               the 3-column KPI row. This is the same "usage bar" pattern billing-aware SaaS
               dashboards (Stripe, Notion, etc.) use for exactly this kind of at-a-glance status. */}
          <Layout.Section>
            <Card>
              <Box padding="400">
                {extrasLoading ? (
                  <SkeletonBodyText lines={1} />
                ) : (
                  <InlineStack align="space-between" blockAlign="center" gap="400" wrap={false}>
                    <div style={{ flexShrink: 0 }}>
                      <InlineStack gap="200" blockAlign="center">
                        <Text variant="bodyMd" fontWeight="semibold">Plan usage</Text>
                        <Badge tone={atLimit ? "critical" : nearLimit ? "warning" : "success"}>
                          {(planUsage?.plan || "free").toUpperCase()}
                        </Badge>
                      </InlineStack>
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <BlockStack gap="100">
                        <InlineStack align="space-between">
                          <Text variant="bodySm" tone="subdued">Articles</Text>
                          <Text variant="bodySm" fontWeight="semibold">
                            {planUsage?.used ?? 0}{planUsage?.limit != null ? ` / ${planUsage.limit}` : " / Unlimited"}
                          </Text>
                        </InlineStack>
                        {planUsage?.limit != null && (
                          <ProgressBar
                            progress={usagePct}
                            size="small"
                            tone={atLimit ? "critical" : nearLimit ? "warning" : "primary"}
                          />
                        )}
                      </BlockStack>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      <Button
                        size="slim"
                        tone={atLimit ? "critical" : undefined}
                        variant={atLimit || nearLimit ? "primary" : "plain"}
                        onClick={() => navigate("/plans")}
                      >
                        {atLimit || nearLimit ? "Upgrade plan" : "Manage plan"}
                      </Button>
                    </div>
                  </InlineStack>
                )}
              </Box>
            </Card>
          </Layout.Section>

          {/* ── Snapshot KPIs ────────────────────────────────────────── */}
          <Layout.Section>
            <BlockStack gap="200">
              <KpiRow
                loading={analyticsLoading}
                items={[
                  { label: "Total articles", value: stats?.totalPosts ?? 0 },
                  { label: "Views (30d)", value: (stats?.totalViews ?? 0).toLocaleString(), trend: analytics?.trends?.views },
                  { label: "Unique visitors (30d)", value: (stats?.totalUniqueVisitors ?? 0).toLocaleString() },
                ]}
              />
              <Button variant="plain" onClick={() => navigate("/analytics")}>
                View full analytics →
              </Button>
            </BlockStack>
          </Layout.Section>

          {/* ── Performance chart ────────────────────────────────────── */}
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
                title={advancedLocked ? "Blog performance — last 30 days (Views)" : "Blog performance — last 30 days"}
                period={analytics?.daily?.length || 1}
                showPeriodSelector={false}
                series={
                  advancedLocked
                    ? [{ key: "views", label: "Views", color: "#008060" }]
                    : [
                        { key: "views", label: "Views", color: "#008060" },
                        { key: "addToCart", label: "Add to cart", color: "#e67e22" },
                        { key: "conversions", label: "Conversions", color: "#005bd3" },
                      ]
                }
              />
            )}
          </Layout.Section>

          {/* ── Content pipeline ─────────────────────────────────────────
               Same full-width treatment as the performance chart above — a horizontal bar
               chart, a genuinely new chart type not borrowed from the Analytics pages (which
               only cover performance metrics via line/area/donut charts). Visualizes content
               status volume instead of a performance trend. */}
          <Layout.Section>
            <ContentPipelineChart
              loading={analyticsLoading || extrasLoading}
              published={stats?.published}
              drafts={extras?.drafts}
              scheduled={extras?.scheduled}
              notSynced={extras?.notSynced}
              fullWidth
            />
          </Layout.Section>

          {/* ── Top performing posts + Upcoming scheduled posts ─────────
               Top posts uses plain view counts — real data at every plan, no LockedOverlay
               needed here unlike the funnel this row replaced. */}
          <Layout.Section>
            <Grid columns={{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2 }} gap={{ xs: "12px", sm: "16px", md: "16px" }}>
              <Grid.Cell>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="headingMd" as="h3">Top performing posts</Text>
                        <Button variant="plain" onClick={() => navigate("/analytics")}>
                          View all
                        </Button>
                      </InlineStack>
                      <Divider />
                      {analyticsLoading ? (
                        <SkeletonBodyText lines={4} />
                      ) : analytics?.topPosts?.length > 0 ? (
                        <BlockStack gap="300">
                          {analytics.topPosts.slice(0, 5).map((post) => (
                            <div
                              key={post.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => navigate(`/analytics/${post.id}`)}
                              onKeyDown={(e) => e.key === "Enter" && navigate(`/analytics/${post.id}`)}
                              style={{ cursor: "pointer" }}
                            >
                              <InlineStack align="space-between" blockAlign="center" wrap={false} gap="200">
                                {/* minWidth:0 is load-bearing here: a flex/grid item defaults to
                                    min-width:auto (refuses to shrink below its content's natural
                                    width), so without this the title ignores `truncate` entirely
                                    and overflows past the card edge instead — pushing the views
                                    text off to the side, exactly the cropping this fixes. */}
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <BlockStack gap="025">
                                    <Text variant="bodySm" fontWeight="semibold" truncate>
                                      {post.title || "Untitled"}
                                    </Text>
                                    <Badge tone={post.status === "published" ? "success" : "info"}>
                                      {post.status}
                                    </Badge>
                                  </BlockStack>
                                </div>
                                <div style={{ flexShrink: 0 }}>
                                  <Text variant="bodySm" tone="subdued">
                                    {(post.views || 0).toLocaleString()} views
                                  </Text>
                                </div>
                              </InlineStack>
                            </div>
                          ))}
                        </BlockStack>
                      ) : (
                        <Text tone="subdued" variant="bodySm">
                          {setupStatus?.analyticsTracker?.active
                            ? "No performance data yet for this period."
                            : "No performance data yet. Enable storefront tracking above to start collecting it."}
                        </Text>
                      )}
                    </BlockStack>
                  </Box>
                </Card>
              </Grid.Cell>

              <Grid.Cell>
                <Card>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="headingMd" as="h3">Upcoming scheduled posts</Text>
                        <Button variant="plain" onClick={() => navigate("/posts?status=scheduled")}>
                          View all
                        </Button>
                      </InlineStack>
                      <Divider />
                      {extrasLoading ? (
                        <SkeletonBodyText lines={3} />
                      ) : extras?.upcoming?.length > 0 ? (
                        <BlockStack gap="300">
                          {extras.upcoming.map((post) => (
                            <div
                              key={post.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => navigate(`/posts/${post.id}/edit`)}
                              onKeyDown={(e) => e.key === "Enter" && navigate(`/posts/${post.id}/edit`)}
                              style={{ cursor: "pointer" }}
                            >
                              <InlineStack align="space-between" blockAlign="center" wrap={false} gap="200">
                                {/* Same minWidth:0 fix as Top performing posts above — without
                                    it a long title ignores `truncate` and overflows the card. */}
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <Text variant="bodySm" fontWeight="semibold" truncate>
                                    {post.title || "Untitled"}
                                  </Text>
                                </div>
                                <div style={{ flexShrink: 0 }}>
                                  <Badge tone="info">
                                    {new Date(post.publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                  </Badge>
                                </div>
                              </InlineStack>
                            </div>
                          ))}
                        </BlockStack>
                      ) : (
                        <Text tone="subdued" variant="bodySm">
                          Nothing scheduled. Write a post and set a future publish date to see it here.
                        </Text>
                      )}
                    </BlockStack>
                  </Box>
                </Card>
              </Grid.Cell>
            </Grid>
          </Layout.Section>
        </Layout>
      </Page>
    </>
  );
}

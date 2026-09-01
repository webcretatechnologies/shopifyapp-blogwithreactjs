import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PlanUsageMeters from "../components/PlanUsageMeters";
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
  Tooltip,
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
import TopPerformingPostsList from "../components/analytics/TopPerformingPostsList";
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

// ─── Publish Cadence — vertical bar chart ──────────────────────────────────────────────────────
// A chart type not used anywhere else in the app (Analytics uses line/area for trends and a
// donut for device split). This used to show current-moment counts (Published/Drafts/Scheduled/
// Not synced) — but that was just the Action-needed KPI row's exact same four numbers redrawn as
// bars, no new information. Replaced with a real time-series instead: articles published per
// week over the last 8 weeks, from the new `publishCadence` field on GET
// /api/posts/meta/dashboard-extras — genuinely new information not shown anywhere else.
function PublishCadenceChart({ cadence, loading, fullWidth = false }) {
  const weeks = cadence || [];
  const categories = weeks.map((w) =>
    new Date(w.weekStart).toLocaleDateString(undefined, { month: "short", day: "numeric" })
  );
  const values = weeks.map((w) => w.count);
  const totalInWindow = values.reduce((sum, v) => sum + v, 0);

  const options = {
    chart: {
      type: "bar",
      toolbar: { show: false },
      fontFamily: "-apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: "45%",
      },
    },
    colors: ["#008060"],
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      categories,
      title: { text: "Week starting", style: { color: "#6d7175", fontSize: "12px" } },
      labels: { style: { colors: "#6d7175" } },
    },
    yaxis: {
      title: { text: "Articles published", style: { color: "#6d7175", fontSize: "12px" } },
      labels: { formatter: (val) => Math.round(val) },
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
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="headingMd" as="h3">Publish cadence</Text>
            <Text variant="bodySm" tone="subdued">{totalInWindow} in last 8 weeks</Text>
          </InlineStack>
          <Divider />
          {loading ? (
            <SkeletonBodyText lines={4} />
          ) : totalInWindow === 0 ? (
            <Text tone="subdued" variant="bodySm">
              No articles published in the last 8 weeks. Write and publish a post to start
              building a cadence.
            </Text>
          ) : (
            <div role="img" aria-label={`Publish cadence over the last 8 weeks: ${categories.map((c, i) => `week of ${c}, ${values[i]} articles`).join("; ")}`}>
              <ReactApexChart options={options} series={[{ name: "Published", data: values }]} type="bar" height={fullWidth ? 200 : 260} />
            </div>
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}

// ─── Quick action tile — plain Polaris Card + Icon + Text, no bespoke styling ───────────────────
// `disabled` matches the same at-article-limit treatment posts/index.jsx already uses for its own
// "New Article" action — this tile was still navigating straight to the create-article page while
// the shop was at its plan's article limit, since it had its own onClick with no limit awareness.
function QuickAction({ icon, label, onClick, disabled = false, disabledTooltip }) {
  const content = (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => !disabled && e.key === "Enter" && onClick()}
      style={{ cursor: disabled ? "not-allowed" : "pointer", height: "100%", opacity: disabled ? 0.5 : 1 }}
    >
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
  return disabled && disabledTooltip ? <Tooltip content={disabledTooltip}>{content}</Tooltip> : content;
}

// ─── Main Dashboard ──────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [extras, setExtras] = useState(null);
  const [extrasLoading, setExtrasLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState(null);
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

  // Real renewal date for the Plan Usage card's subtitle — Free has no billing cycle at all
  // (billingCycle stays null), matched by the card itself falling back to a generic subtitle.
  const fetchBillingCycle = async () => {
    try {
      const res = await fetch("/api/billing/check");
      if (res.ok) {
        const data = await res.json();
        setBillingCycle(data.billingCycle || null);
      }
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
    fetchBillingCycle();
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
  // Second plan cap on the same card: templates the merchant has saved of their own.
  const templatesUsed = planUsage?.templatesUsed ?? 0;
  const templatesLimit = planUsage?.templatesLimit ?? null;
  // Same decoupling as SetupGuide below: post count is available from dashboard-extras
  // (extrasLoading) without waiting on the separately-fetched, slower analytics summary.
  const isNewShop = !setupLoading && !extrasLoading && (extras?.planUsage?.used ?? 0) === 0;

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
          disabled: atLimit,
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
               by SetupGuide's own internal state) once everything's done ──────────────────
               Gated on setup + extras loading only, NOT analyticsLoading — this card's own data
               (setupStatus, post count via dashboard-extras) has no dependency on the 30-day
               analytics fetch, which can be meaningfully slower. Previously waiting on both
               delayed the single most important card for a brand-new merchant for no reason. */}
          {!extrasLoading && !setupLoading && (
            <Layout.Section>
              <SetupGuide
                shop={shopInfo?.domain}
                isExtensionActive={setupStatus?.analyticsTracker?.active}
                isMetaRobotsActive={setupStatus?.metaRobots?.active}
                themeSupportsAppEmbeds={setupStatus?.themeSupportsAppEmbeds}
                hasPosts={(extras?.planUsage?.used ?? 0) > 0}
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
                <Grid.Cell>
                  <QuickAction
                    icon={PlusIcon}
                    label="New article"
                    onClick={() => navigate("/posts/new")}
                    disabled={atLimit}
                    disabledTooltip={`You've reached your ${planUsage?.limit ?? ""}-article limit. Upgrade your plan to add more.`}
                  />
                </Grid.Cell>
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
               Header row (title + billing-period subtitle, plan badge + upgrade/manage action)
               above a metrics row — currently a single "Articles" metric block since that's the
               only plan-gated resource this app tracks today, but the layout is built to hold
               more than one block side-by-side if a second metered resource is added later. */}
          <Layout.Section>
            <Card>
              <Box padding="400">
                {extrasLoading ? (
                  <SkeletonBodyText lines={3} />
                ) : (
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="start" gap="400" wrap={false}>
                      <BlockStack gap="050">
                        <Text variant="headingSm" as="h3">Plan usage</Text>
                        <Text variant="bodySm" tone="subdued">
                          {billingCycle?.renewsOn
                            ? `Current billing period · resets ${new Date(billingCycle.renewsOn).toLocaleDateString("en-GB")}`
                            : "Free plan · no active billing period"}
                        </Text>
                      </BlockStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Badge tone={atLimit ? "critical" : nearLimit ? "warning" : "success"}>
                          {`${(planUsage?.plan || "free").replace(/^\w/, (c) => c.toUpperCase())} plan`}
                        </Badge>
                        <Button
                          size="slim"
                          tone={atLimit ? "critical" : undefined}
                          variant={atLimit || nearLimit ? "primary" : "secondary"}
                          onClick={() => navigate("/plans")}
                        >
                          {atLimit || nearLimit ? "Upgrade" : "Manage plan"}
                        </Button>
                      </InlineStack>
                    </InlineStack>

                    <PlanUsageMeters
                      meters={[
                        { label: "Articles", used: planUsage?.used ?? 0, limit: planUsage?.limit ?? null },
                        { label: "Saved templates", used: templatesUsed, limit: templatesLimit },
                        { label: "AI generations", used: planUsage?.aiUsed ?? 0, limit: planUsage?.aiLimit ?? null },
                      ]}
                    />
                  </BlockStack>
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
                title={advancedLocked ? "Blog performance — last 30 days (views)" : "Blog performance — last 30 days"}
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

          {/* ── Publish cadence ───────────────────────────────────────────
               Same full-width treatment as the performance chart above — a bar chart, a
               genuinely new chart type not borrowed from the Analytics pages (which only cover
               performance metrics via line/area/donut charts). Shows a real weekly trend, not a
               restatement of the Action-needed KPI row's current-moment counts (which is what
               this card used to duplicate). */}
          <Layout.Section>
            <PublishCadenceChart
              loading={extrasLoading}
              cadence={extras?.publishCadence}
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
                        <TopPerformingPostsList
                          posts={analytics.topPosts.slice(0, 5)}
                          onSelectPost={(post) => navigate(`/analytics/${post.id}`)}
                        />
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

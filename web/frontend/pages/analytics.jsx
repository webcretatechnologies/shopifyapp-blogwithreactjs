/**
 * Analytics Dashboard — Dedicated analytics page with ApexCharts.
 * Shows comprehensive metrics: views, add-to-cart, conversions, funnel, sources, devices, countries.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Page,
  Layout,
  Card,
  Text,
  Box,
  Spinner,
  InlineStack,
  BlockStack,
  Badge,
  Divider,
  Button,
  IndexTable,
  Icon,
  Banner,
} from "@shopify/polaris";
import {
  ExportIcon,
  CartIcon,
  CheckCircleIcon,
  RefreshIcon,
} from "@shopify/polaris-icons";
import KpiRow from "../components/common/KpiRow";
import AnalyticsChart from "../components/analytics/AnalyticsChart";
import DeviceChart from "../components/analytics/DeviceChart";
import TopSources from "../components/analytics/TopSources";
import FunnelChart from "../components/analytics/FunnelChart";
import CountryBreakdown from "../components/analytics/CountryBreakdown";
import DateRangePicker, { toISODateString } from "../components/analytics/DateRangePicker";
import { downloadAnalyticsCsv, roundMoney } from "../utils/analyticsCsv";
import EmbedRequirementBanner from "../components/EmbedRequirementBanner";
import { analyticsTrackerActivateUrl } from "../utils/themeEmbedUtils";

const DEFAULT_RANGE = (() => {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { start, end };
})();

// ─── Main Page ────────────────────────────────────────────────────────────
export default function Analytics() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState(DEFAULT_RANGE);
  const [showComparison, setShowComparison] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [shopDomain, setShopDomain] = useState(null);
  const [setupStatus, setSetupStatus] = useState(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [showRefreshToast, setShowRefreshToast] = useState(false);

  const fetchSetupStatus = () => {
    fetch("/api/shop/setup-status").then((r) => r.json()).then(setSetupStatus).catch(() => {});
  };

  useEffect(() => {
    fetch("/api/shop").then((r) => r.json()).then((d) => setShopDomain(d.shop?.domain)).catch(() => {});
    fetchSetupStatus();
  }, []);

  // Re-check silently when the merchant switches back from the theme editor tab, so the banner
  // above clears itself the moment the embed is actually turned on — no manual reload needed.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchSetupStatus();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const loadAnalytics = (range, { silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    const from = toISODateString(range.start);
    const to = toISODateString(range.end);
    return fetch(`/api/posts/analytics/summary?from=${from}&to=${to}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json();
      })
      .then((d) => {
        setAnalytics(d);
        setLoading(false);
        setLastLoadedAt(Date.now());
        if (silent) setError(null);
      })
      .catch((err) => {
        if (!silent) {
          setError(err.message || "Failed to load analytics");
          setLoading(false);
        }
        // Silent background refreshes fail quietly — the last good data stays on screen rather
        // than flashing an error banner over an otherwise-working page.
      });
  };

  // Manual refresh button — silent (no full-page spinner, matches the auto-refresh behavior),
  // but a merchant clicking a refresh button expects SOME visible confirmation it did something,
  // otherwise it's indistinguishable from a dead button. Spinner replaces the icon while in
  // flight, then a brief "Updated" badge confirms completion.
  // Not using Polaris <Toast> here — it requires a <Frame> ancestor, and this app's provider
  // tree (PolarisProvider.jsx) has none, so Toast throws "No Frame context was provided" and
  // crashes the page the moment it's rendered. That's a pre-existing, app-wide gap (every other
  // <Toast> usage in this codebase — settings, sync, posts, comments — has the same landmine,
  // just not yet triggered); out of scope to fix everywhere from here, so this uses a
  // Frame-independent confirmation instead.
  const handleManualRefresh = () => {
    setManualRefreshing(true);
    loadAnalytics(dateRange, { silent: true }).finally(() => {
      setManualRefreshing(false);
      setShowRefreshToast(true);
      setTimeout(() => setShowRefreshToast(false), 2500);
    });
  };

  useEffect(() => {
    loadAnalytics(dateRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  // Background refresh every 60s (no loading flash) so numbers stay current without a manual
  // reload, plus a 1/min tick to keep the "Updated Xs ago" label live.
  useEffect(() => {
    const refreshTimer = setInterval(() => loadAnalytics(dateRange, { silent: true }), 60000);
    const tickTimer = setInterval(() => setNowTick(Date.now()), 60000);
    return () => {
      clearInterval(refreshTimer);
      clearInterval(tickTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange]);

  const freshnessLabel = (() => {
    if (!lastLoadedAt) return null;
    const secs = Math.max(0, Math.round((nowTick - lastLoadedAt) / 1000));
    if (secs < 60) return "Updated just now";
    const mins = Math.round(secs / 60);
    return `Updated ${mins}m ago`;
  })();

  const stats = analytics?.stats;

  const hasExportData = !!analytics?.daily?.length;

  const exportCSV = () => {
    if (!hasExportData) return;
    const s = analytics.stats || {};
    const from = toISODateString(dateRange.start);
    const to = toISODateString(dateRange.end);
    const formatTrend = (t) => (t === null || t === undefined ? "—" : `${t > 0 ? "+" : ""}${t}%`);

    downloadAnalyticsCsv(`blog-analytics_${from}_to_${to}.csv`, [
      {
        title: "Report",
        headers: ["Field", "Value"],
        rows: [
          ["Shop", shopDomain || ""],
          ["Date range", `${from} to ${to}`],
          ["Generated", new Date().toLocaleString()],
        ],
      },
      {
        title: "Summary",
        headers: ["Metric", "Value", "vs. previous period"],
        rows: [
          ["Total Views", s.totalViews || 0, formatTrend(analytics.trends?.views)],
          ["Unique Visitors", s.totalUniqueVisitors || 0, "—"],
          ["Add to Cart", s.totalAddToCart || 0, "—"],
          ["Checkouts", s.totalCheckouts || 0, "—"],
          ["Conversions", s.totalConversions || 0, "—"],
          ["Revenue", roundMoney(s.totalRevenue), formatTrend(analytics.trends?.revenue)],
          ["Add to Cart Rate", `${s.addToCartRate ?? "0.00"}%`, "—"],
          ["Checkout Rate", `${s.checkoutRate ?? "0.00"}%`, "—"],
          ["Conversion Rate", `${s.conversionRate ?? "0.00"}%`, formatTrend(analytics.trends?.conversionRate)],
        ],
      },
      {
        title: "Daily Totals",
        headers: ["Date", "Views", "Unique Visitors", "Add to Cart", "Checkouts", "Conversions", "Revenue"],
        rows: analytics.daily.map((d) => [
          d.date, d.views || 0, d.uniqueVisitors || 0, d.addToCart || 0, d.checkouts || 0, d.conversions || 0, roundMoney(d.revenue),
        ]),
      },
      {
        title: "Top Posts",
        headers: ["Title", "Status", "Views", "Unique Visitors", "Add to Cart", "Add to Cart Rate", "Conversions", "Conversion Rate", "Revenue"],
        rows: (analytics.topPosts || []).map((p) => [
          p.title, p.status, p.views || 0, p.uniqueVisitors || 0, p.addToCart || 0, `${p.addToCartRate ?? "0.00"}%`, p.conversions || 0, `${p.conversionRate ?? "0.00"}%`, roundMoney(p.revenue),
        ]),
      },
      {
        title: "Device Breakdown",
        headers: ["Device", "Count"],
        rows: [
          ["Desktop", analytics.deviceBreakdown?.desktop || 0],
          ["Mobile", analytics.deviceBreakdown?.mobile || 0],
          ["Tablet", analytics.deviceBreakdown?.tablet || 0],
        ],
      },
      {
        title: "Traffic Sources",
        headers: ["Source", "Count"],
        rows: (analytics.topSources || []).map((s2) => [s2.name, s2.count]),
      },
      {
        title: "Top Countries",
        headers: ["Country", "Count"],
        rows: (analytics.topCountries || []).map((c) => [c.code || "Unknown", c.count]),
      },
    ]);
  };

  return (
    <Page
      title="Analytics"
      subtitle="Comprehensive insights into your blog's performance — views, conversions, and more"
      backAction={{ content: "Dashboard", onAction: () => navigate("/dashboard") }}
      secondaryActions={[
        { content: "Export CSV", icon: ExportIcon, onAction: exportCSV, disabled: !hasExportData },
      ]}
    >
      <Box paddingBlockEnd="400">
        <InlineStack align="end" gap="300" blockAlign="center">
          {showRefreshToast && (
            <Badge tone="success" icon={CheckCircleIcon}>
              Updated
            </Badge>
          )}
          {freshnessLabel && (
            <Text tone="subdued" variant="bodySm">
              {freshnessLabel}
            </Text>
          )}
          <Button
            icon={RefreshIcon}
            accessibilityLabel="Refresh analytics"
            onClick={handleManualRefresh}
            disabled={loading}
            loading={manualRefreshing}
          />
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </InlineStack>
      </Box>

      {error && (
        <Box paddingBlockEnd="400">
          <Banner
            tone="critical"
            title="Couldn't load analytics"
            action={{ content: "Retry", onAction: () => loadAnalytics(dateRange) }}
          >
            <Text>{error}</Text>
          </Banner>
        </Box>
      )}

      {loading ? (
        <Box padding="800" align="center">
          <Spinner />
        </Box>
      ) : error ? null : (
        <BlockStack gap="500">
          {shopDomain && setupStatus && !setupStatus.analyticsTracker?.active && (
            <EmbedRequirementBanner
              active={setupStatus.analyticsTracker?.active}
              themeSupportsAppEmbeds={setupStatus.themeSupportsAppEmbeds}
              activateUrl={analyticsTrackerActivateUrl(shopDomain)}
              featureName="Revenue and conversion tracking"
              whatBreaks="Revenue, Add to Cart, Checkouts, and Conversions below will show as zero until this is enabled."
            />
          )}
          <Layout>
            {/* ── KPI Summary ────────────────────────────────────────── */}
            <Layout.Section>
              <KpiRow
                loading={loading}
                items={[
                  { label: "Total Views", value: (stats?.totalViews ?? 0).toLocaleString(), trend: analytics?.trends?.views },
                  { label: "Unique Visitors", value: (stats?.totalUniqueVisitors ?? 0).toLocaleString() },
                  {
                    label: "Revenue",
                    value: `$${(stats?.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    trend: analytics?.trends?.revenue,
                  },
                  { label: "Overall Conv. Rate", value: `${stats?.conversionRate ?? "0.00"}%`, trend: analytics?.trends?.conversionRate },
                ]}
              />
            </Layout.Section>
          </Layout>

          <Layout>
            {/* ── Conversion Comparison Table ────────────────────────── */}
            <Layout.Section>
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd">Conversion Metrics Comparison</Text>
                    <Divider />
                    <IndexTable
                      resourceName={{ singular: "metric", plural: "metrics" }}
                      itemCount={3}
                      selectable={false}
                      headings={[
                        { title: "Funnel Stage" },
                        { title: "Total Count" },
                        { title: "Conversion Rate" },
                      ]}
                    >
                      <IndexTable.Row id="add-to-cart" position={0}>
                        <IndexTable.Cell><Text fontWeight="bold" as="span">Add to Cart</Text></IndexTable.Cell>
                        <IndexTable.Cell>{(stats?.totalAddToCart ?? 0).toLocaleString()}</IndexTable.Cell>
                        <IndexTable.Cell>{stats?.addToCartRate ?? "0.00"}%</IndexTable.Cell>
                      </IndexTable.Row>
                      <IndexTable.Row id="checkouts" position={1}>
                        <IndexTable.Cell><Text fontWeight="bold" as="span">Checkouts</Text></IndexTable.Cell>
                        <IndexTable.Cell>{(stats?.totalCheckouts ?? 0).toLocaleString()}</IndexTable.Cell>
                        <IndexTable.Cell>{stats?.checkoutRate ?? "0.00"}%</IndexTable.Cell>
                      </IndexTable.Row>
                      <IndexTable.Row id="conversions" position={2}>
                        <IndexTable.Cell><Text fontWeight="bold" as="span">Successful Conversions</Text></IndexTable.Cell>
                        <IndexTable.Cell>{(stats?.totalConversions ?? 0).toLocaleString()}</IndexTable.Cell>
                        <IndexTable.Cell>{stats?.conversionRate ?? "0.00"}%</IndexTable.Cell>
                      </IndexTable.Row>
                    </IndexTable>
                  </BlockStack>
                </Box>
              </Card>
            </Layout.Section>
          </Layout>

          <Layout>
            {/* ── Multi-Series Chart (Views + Add to Cart + Conversions) ─── */}
            <Layout.Section>
              <AnalyticsChart
                data={analytics?.daily || []}
                title="Daily Performance — Views, Add to Cart & Conversions"
                series={[
                  { key: "views", label: "Views", color: "#008060" },
                  { key: "addToCart", label: "Add to Cart", color: "#e67e22" },
                  { key: "conversions", label: "Conversions", color: "#005bd3" },
                ]}
                showPeriodSelector={false}
                controlledPeriod={analytics?.daily?.length || 1}
                showComparison={showComparison}
                onToggleComparison={setShowComparison}
                compareData={analytics?.previousDaily || []}
              />
            </Layout.Section>
          </Layout>

          {/* ── Funnel + Device + Sources ────────────────────────────── */}
          {/* Plain flexbox instead of Polaris <Layout>: Layout's own CSS sets
              align-items: flex-start (confirmed in its stylesheet), so sibling cards in a
              Layout row can never match height regardless of minHeight — that only raises a
              floor, it doesn't equalize against whichever card ends up tallest. Flexbox's default
              align-items: stretch does this for free. (CSS Grid's auto-fit was tried first but can
              silently collapse a phantom empty track and eat one of the gaps — flex-wrap avoids
              that edge case entirely while still wrapping responsively.) */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "stretch" }}>
            <div style={{ flex: "1 1 280px" }}><FunnelChart funnel={analytics?.funnel || []} /></div>
            <div style={{ flex: "1 1 280px" }}><DeviceChart breakdown={analytics?.deviceBreakdown} /></div>
            <div style={{ flex: "1 1 280px" }}><TopSources sources={analytics?.topSources || []} /></div>
          </div>

          {/* ── Top Posts & Countries ─────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "stretch" }}>
            <div style={{ flex: "1 1 320px" }}>
              <Card>
                <Box padding="400" minHeight="240px">
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">Top performing posts</Text>
                    <Divider />
                    {(!analytics?.topPosts || analytics.topPosts.length === 0) && (
                      <Text tone="subdued" variant="bodySm">
                        No data yet. Views & events are tracked from the
                        storefront automatically.
                      </Text>
                    )}
                    <div style={{ maxHeight: 420, overflowY: "auto" }}>
                    {analytics?.topPosts?.map((p, i) => (
                      <div
                        key={p.id}
                        onClick={() => navigate(`/analytics/${p.id}`)}
                        style={{ cursor: "pointer" }}
                        role="link"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") navigate(`/analytics/${p.id}`);
                        }}
                      >
                        <InlineStack align="space-between" blockAlign="center">
                          <InlineStack gap="200" blockAlign="center">
                            <Box
                              background={i === 0 ? "bg-caution-strong" : "bg-subdued"}
                              borderRadius="full"
                              minWidth="24px"
                              minHeight="24px"
                            >
                              <InlineStack align="center" blockAlign="center">
                                <Text
                                  variant="bodyXs"
                                  fontWeight="bold"
                                  tone={i === 0 ? "text-inverse" : "subdued"}
                                >
                                  {i + 1}
                                </Text>
                              </InlineStack>
                            </Box>
                            <BlockStack gap="025">
                              <Text variant="bodySm" fontWeight="semibold">
                                {p.title?.substring(0, 35) || "Untitled"}
                                {p.title?.length > 35 ? "…" : ""}
                              </Text>
                              <Badge tone={p.status === "published" ? "success" : "info"}>
                                {p.status}
                              </Badge>
                            </BlockStack>
                          </InlineStack>
                          <Text variant="bodySm" tone="subdued">
                            {(p.views || 0).toLocaleString()} views
                          </Text>
                        </InlineStack>
                        {p.addToCart > 0 && (
                          <div style={{ marginTop: 6, paddingLeft: 34 }}>
                            <InlineStack gap="300" blockAlign="center">
                              <InlineStack gap="050" blockAlign="center">
                                <Icon source={CartIcon} tone="subdued" />
                                <Text variant="bodyXs" tone="subdued">
                                  {p.addToCart} cart
                                </Text>
                              </InlineStack>
                              {p.conversions > 0 && (
                                <InlineStack gap="050" blockAlign="center">
                                  <Icon source={CheckCircleIcon} tone="success" />
                                  <Text variant="bodyXs" tone="success">
                                    {p.conversions} conv
                                  </Text>
                                </InlineStack>
                              )}
                              {p.addToCartRate !== "0.00" && (
                                <Text variant="bodyXs" tone="subdued">
                                  {p.addToCartRate}% cart rate
                                </Text>
                              )}
                              {p.revenue > 0 && (
                                <Text variant="bodyXs" tone="subdued">
                                  ${Number(p.revenue).toFixed(2)}
                                </Text>
                              )}
                            </InlineStack>
                          </div>
                        )}
                        {i < analytics.topPosts.length - 1 && (
                          <div style={{ margin: "8px 0" }}>
                            <Divider />
                          </div>
                        )}
                      </div>
                    ))}
                    </div>
                  </BlockStack>
                </Box>
              </Card>
            </div>

            <div style={{ flex: "1 1 320px" }}><CountryBreakdown countries={analytics?.topCountries || []} /></div>
          </div>
        </BlockStack>
      )}
    </Page>
  );
}

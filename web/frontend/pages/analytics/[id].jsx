/**
 * Per-post Analytics drill-down — same metrics as the shop-wide dashboard
 * (pages/analytics.jsx), scoped to a single post.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { smartBackAction } from "../../utils/smartBack";
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
  Button,
  Banner,
} from "@shopify/polaris";
import { ExportIcon, RefreshIcon, CheckCircleIcon } from "@shopify/polaris-icons";
import KpiRow from "../../components/common/KpiRow";
import AnalyticsChart from "../../components/analytics/AnalyticsChart";
import DeviceChart from "../../components/analytics/DeviceChart";
import TopSources from "../../components/analytics/TopSources";
import FunnelChart from "../../components/analytics/FunnelChart";
import CountryBreakdown from "../../components/analytics/CountryBreakdown";
import LockedOverlay from "../../components/analytics/LockedOverlay";
import DateRangePicker, { toISODateString } from "../../components/analytics/DateRangePicker";
import { downloadAnalyticsCsv, roundMoney, formatMoney } from "../../utils/analyticsCsv";
import EmbedRequirementBanner from "../../components/EmbedRequirementBanner";
import { analyticsTrackerActivateUrl } from "../../utils/themeEmbedUtils";

const DEFAULT_RANGE = (() => {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { start, end };
})();

export default function PostAnalytics() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState(DEFAULT_RANGE);
  const [showComparison, setShowComparison] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [shopDomain, setShopDomain] = useState(null);
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [setupStatus, setSetupStatus] = useState(null);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [showRefreshToast, setShowRefreshToast] = useState(false);

  const fetchSetupStatus = () => {
    fetch("/api/shop/setup-status").then((r) => r.json()).then(setSetupStatus).catch(() => {});
  };

  useEffect(() => {
    fetch("/api/shop").then((r) => r.json()).then((d) => setShopDomain(d.shop?.domain)).catch(() => {});
    fetch("/api/posts/shopify/store").then((r) => r.json()).then((d) => d.currencyCode && setCurrencyCode(d.currencyCode)).catch(() => {});
    fetchSetupStatus();
  }, []);

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
    return fetch(`/api/posts/${id}/analytics?from=${from}&to=${to}`)
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
      });
  };

  // Not using Polaris <Toast> — it requires a <Frame> ancestor this app's provider tree doesn't
  // have (see pages/analytics.jsx for the full explanation); a Frame-independent badge instead.
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
  }, [id, dateRange]);

  useEffect(() => {
    const refreshTimer = setInterval(() => loadAnalytics(dateRange, { silent: true }), 60000);
    const tickTimer = setInterval(() => setNowTick(Date.now()), 60000);
    return () => {
      clearInterval(refreshTimer);
      clearInterval(tickTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, dateRange]);

  const freshnessLabel = (() => {
    if (!lastLoadedAt) return null;
    const secs = Math.max(0, Math.round((nowTick - lastLoadedAt) / 1000));
    if (secs < 60) return "Updated just now";
    return `Updated ${Math.round(secs / 60)}m ago`;
  })();

  const stats = analytics?.stats;
  const advancedLocked = !!analytics?.advancedLocked;
  const post = analytics?.post;

  const hasExportData = !!analytics?.daily?.length;

  const exportCSV = () => {
    if (!hasExportData) return;
    const s = analytics.stats || {};
    const from = toISODateString(dateRange.start);
    const to = toISODateString(dateRange.end);
    const formatTrend = (t) => (t === null || t === undefined ? "—" : `${t > 0 ? "+" : ""}${t}%`);
    const postSlug = (post?.title || `post-${id}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    downloadAnalyticsCsv(`analytics_${postSlug}_${from}_to_${to}.csv`, [
      {
        title: "Report",
        headers: ["Field", "Value"],
        rows: [
          ["Shop", shopDomain || ""],
          ["Post", post?.title || ""],
          ["Status", post?.status || ""],
          ["Date range", `${from} to ${to}`],
          ["Generated", new Date().toLocaleString()],
        ],
      },
      {
        title: "Summary",
        headers: ["Metric", "Value", "vs. previous period"],
        rows: [
          ["Views", s.totalViews || 0, formatTrend(analytics.trends?.views)],
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
      title={post?.title || "Post analytics"}
      titleMetadata={post?.status && <Badge tone={post.status === "published" ? "success" : "info"}>{post.status}</Badge>}
      subtitle="Views, funnel, devices, and traffic sources for this post"
      backAction={smartBackAction(navigate, location, "/analytics", "Analytics")}
      secondaryActions={[
        advancedLocked
          ? { content: "Export CSV", icon: ExportIcon, disabled: true, helpText: "Upgrade to Pro to export your analytics" }
          : { content: "Export CSV", icon: ExportIcon, onAction: exportCSV, disabled: !hasExportData },
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
              whatBreaks="Revenue, Add to Cart, and Conversions for this post below will show as zero until this is enabled."
            />
          )}
          <Layout>
            <Layout.Section>
              <KpiRow
                items={[
                  { label: "Views", value: (stats?.totalViews ?? 0).toLocaleString(), trend: analytics?.trends?.views },
                  { label: "Unique Visitors", value: (stats?.totalUniqueVisitors ?? 0).toLocaleString() },
                  { label: "Add to Cart", value: (stats?.totalAddToCart ?? 0).toLocaleString(), locked: advancedLocked },
                  {
                    label: "Revenue",
                    value: formatMoney(stats?.totalRevenue ?? 0, currencyCode),
                    trend: analytics?.trends?.revenue,
                    locked: advancedLocked,
                  },
                  { label: "Conv. Rate", value: `${stats?.conversionRate ?? "0.00"}%`, trend: analytics?.trends?.conversionRate, locked: advancedLocked },
                ]}
              />
            </Layout.Section>
          </Layout>

          <Layout>
            <Layout.Section>
              <AnalyticsChart
                data={analytics?.daily || []}
                title={advancedLocked ? "Daily Performance — Views" : "Daily Performance — Views, Add to Cart & Conversions"}
                series={
                  advancedLocked
                    ? [{ key: "views", label: "Views", color: "#008060" }]
                    : [
                        { key: "views", label: "Views", color: "#008060" },
                        { key: "addToCart", label: "Add to Cart", color: "#e67e22" },
                        { key: "conversions", label: "Conversions", color: "#005bd3" },
                      ]
                }
                showPeriodSelector={false}
                controlledPeriod={analytics?.daily?.length || 1}
                showComparison={showComparison}
                comparisonDisabled={advancedLocked}
                onToggleComparison={setShowComparison}
                compareData={analytics?.previousDaily || []}
              />
            </Layout.Section>
          </Layout>

          {/* Plain flexbox instead of Polaris <Layout>: Layout's own CSS sets
              align-items: flex-start, so sibling cards in a Layout row never match height
              regardless of minHeight. Flexbox's default align-items: stretch does this for free
              without CSS Grid auto-fit's phantom-empty-track gap quirk. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "stretch" }}>
            <div style={{ flex: "1 1 280px" }}>
              <LockedOverlay locked={advancedLocked} message="Upgrade to Pro to unlock the conversion funnel">
                <FunnelChart funnel={analytics?.funnel || []} />
              </LockedOverlay>
            </div>
            <div style={{ flex: "1 1 280px" }}><DeviceChart breakdown={analytics?.deviceBreakdown} /></div>
            <div style={{ flex: "1 1 280px" }}>
              <LockedOverlay locked={advancedLocked} message="Upgrade to Pro to unlock traffic sources">
                <TopSources sources={analytics?.topSources || []} />
              </LockedOverlay>
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "stretch" }}>
            <div style={{ flex: "1 1 320px" }}>
              <LockedOverlay locked={advancedLocked} message="Upgrade to Pro to unlock country breakdown">
                <CountryBreakdown countries={analytics?.topCountries || []} />
              </LockedOverlay>
            </div>
          </div>
        </BlockStack>
      )}
    </Page>
  );
}

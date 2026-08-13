/**
 * Per-post Analytics drill-down — same metrics as the shop-wide dashboard
 * (pages/analytics.jsx), scoped to a single post.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import DateRangePicker, { toISODateString } from "../../components/analytics/DateRangePicker";
import { downloadAnalyticsCsv } from "../../utils/analyticsCsv";
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
  const post = analytics?.post;

  const exportCSV = () => {
    if (!analytics?.daily?.length) return;
    downloadAnalyticsCsv(`post-${id}-analytics.csv`, [
      {
        title: "Daily Totals",
        headers: ["Date", "Views", "Unique Visitors", "Add to Cart", "Checkouts", "Conversions", "Revenue"],
        rows: analytics.daily.map((d) => [
          d.date, d.views || 0, d.uniqueVisitors || 0, d.addToCart || 0, d.checkouts || 0, d.conversions || 0, d.revenue || 0,
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
        rows: (analytics.topSources || []).map((s) => [s.name, s.count]),
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
      backAction={{ content: "Analytics", onAction: () => navigate("/analytics") }}
      secondaryActions={[
        { content: "Export CSV", icon: ExportIcon, onAction: exportCSV },
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
                  { label: "Add to Cart", value: (stats?.totalAddToCart ?? 0).toLocaleString() },
                  {
                    label: "Revenue",
                    value: `$${(stats?.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    trend: analytics?.trends?.revenue,
                  },
                  { label: "Conv. Rate", value: `${stats?.conversionRate ?? "0.00"}%`, trend: analytics?.trends?.conversionRate },
                ]}
              />
            </Layout.Section>
          </Layout>

          <Layout>
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

          <Layout>
            <Layout.Section variant="oneThird">
              <FunnelChart funnel={analytics?.funnel || []} />
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <DeviceChart breakdown={analytics?.deviceBreakdown} />
            </Layout.Section>
            <Layout.Section variant="oneThird">
              <TopSources sources={analytics?.topSources || []} />
            </Layout.Section>
          </Layout>

          <Layout>
            <Layout.Section variant="oneHalf">
              <CountryBreakdown countries={analytics?.topCountries || []} />
            </Layout.Section>
          </Layout>
        </BlockStack>
      )}
    </Page>
  );
}

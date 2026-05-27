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
  ProgressBar,
  IndexTable,
} from "@shopify/polaris";
import { ExportIcon } from "@shopify/polaris-icons";
import StatsCard from "../components/analytics/StatsCard";
import AnalyticsChart from "../components/analytics/AnalyticsChart";
import DeviceChart from "../components/analytics/DeviceChart";
import TopSources from "../components/analytics/TopSources";

// ─── Funnel Chart ─────────────────────────────────────────────────────────
function FunnelChart({ funnel = [] }) {
  if (!funnel.length) return null;
  const maxCount = Math.max(...funnel.map((f) => f.count), 1);

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="300">
          <Text variant="headingMd">🔄 Conversion Funnel</Text>
          <Divider />
          <BlockStack gap="200">
            {funnel.map((stage, i) => {
              const pct = (stage.count / maxCount) * 100;
              const dropPct =
                i > 0 && funnel[i - 1].count > 0
                  ? ((1 - stage.count / funnel[i - 1].count) * 100).toFixed(1)
                  : null;
              const arrow = i < funnel.length - 1 ? "↓" : "";
              return (
                <div key={stage.stage}>
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="200" blockAlign="center">
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: "8px",
                          background: i === 3 ? "#008060" : i === 0 ? "#005bd3" : "#e1e3e5",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "13px",
                          color: i >= 3 ? "#fff" : "#202223",
                          fontWeight: "700",
                        }}
                      >
                        {["👁", "🛒", "💳", "✅"][i] || "•"}
                      </div>
                      <BlockStack gap="025">
                        <Text variant="bodySm" fontWeight="semibold">
                          {stage.stage}
                        </Text>
                        {dropPct && parseFloat(dropPct) > 0 && (
                          <Text variant="bodyXs" tone="critical">
                            {arrow} {dropPct}% drop
                          </Text>
                        )}
                      </BlockStack>
                    </InlineStack>
                    <Text variant="bodySm" fontWeight="bold">
                      {stage.count.toLocaleString()}
                    </Text>
                  </InlineStack>
                  <div style={{ marginTop: 6 }}>
                    <ProgressBar
                      progress={Math.round(pct)}
                      size="small"
                      tone={i === 3 ? "success" : i === 0 ? "primary" : "subdued"}
                    />
                  </div>
                </div>
              );
            })}
          </BlockStack>
        </BlockStack>
      </Box>
    </Card>
  );
}

// ─── Top Countries Table ──────────────────────────────────────────────────
function CountryBreakdown({ countries = [] }) {
  if (!countries.length) return null;
  const total = countries.reduce((s, c) => s + c.count, 0);

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="300">
          <Text variant="headingMd">🌍 Top Countries</Text>
          <Divider />
          {countries.slice(0, 8).map(({ code, count }) => {
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
            const flag = code
              ? code
                  .toUpperCase()
                  .replace(/./g, (c) =>
                    String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)
                  )
              : "🌐";
            return (
              <InlineStack key={code} align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <span style={{ fontSize: "16px" }}>{flag}</span>
                  <Text variant="bodySm">{code || "Unknown"}</Text>
                </InlineStack>
                <Text variant="bodySm" fontWeight="semibold">
                  {count.toLocaleString()} ({pct}%)
                </Text>
              </InlineStack>
            );
          })}
        </BlockStack>
      </Box>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function Analytics() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/posts/analytics/summary")
      .then((r) => r.json())
      .then((d) => {
        setAnalytics(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const stats = analytics?.stats;

  const exportCSV = () => {
    const data = analytics?.daily;
    if (!data?.length) return;
    const headers = [
      "Date",
      "Views",
      "Unique Visitors",
      "Add to Cart",
      "Checkouts",
      "Conversions",
      "Revenue",
    ];
    const rows = [headers];
    data.forEach((d) => {
      rows.push([
        d.date,
        d.views || 0,
        d.uniqueVisitors || 0,
        d.addToCart || 0,
        d.checkouts || 0,
        d.conversions || 0,
        d.revenue || 0,
      ]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "blog-analytics.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Page
      title="Analytics"
      subtitle="Comprehensive insights into your blog's performance — views, conversions, and more"
      backAction={{ content: "Dashboard", onAction: () => navigate("/dashboard") }}
      secondaryActions={[
        { content: "Export CSV", icon: ExportIcon, onAction: exportCSV },
      ]}
    >
      {loading ? (
        <Box padding="800" align="center">
          <Spinner />
        </Box>
      ) : (
        <Layout>
          {/* ── Stats Cards Row ────────────────────────────────────── */}
          <Layout.Section>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "16px",
              }}
            >
              <StatsCard
                title="Total Views"
                value={(stats?.totalViews ?? 0).toLocaleString()}
                icon="👁"
                color="#005bd3"
              />
              <StatsCard
                title="Unique Visitors"
                value={(stats?.totalUniqueVisitors ?? 0).toLocaleString()}
                icon="👤"
                color="#9c27b0"
              />
              <StatsCard
                title="Revenue"
                value={`$${(stats?.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon="💰"
                color="#f39c12"
              />
              <StatsCard
                title="Overall Conv. Rate"
                value={`${stats?.conversionRate ?? "0.00"}%`}
                icon="🏆"
                color="#008060"
              />
            </div>
          </Layout.Section>

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
            />
          </Layout.Section>

          {/* ── Funnel + Device + Sources ────────────────────────────── */}
          <Layout.Section variant="oneThird">
            <FunnelChart funnel={analytics?.funnel || []} />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <DeviceChart breakdown={analytics?.deviceBreakdown} />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <TopSources sources={analytics?.topSources || []} />
          </Layout.Section>

          {/* ── Top Posts & Countries ─────────────────────────────────────────────── */}
          <Layout.Section variant="oneHalf">
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd">🏆 Top Performing Posts</Text>
                  <Divider />
                  {(!analytics?.topPosts || analytics.topPosts.length === 0) && (
                    <Text tone="subdued" variant="bodySm">
                      No data yet. Views & events are tracked from the
                      storefront automatically.
                    </Text>
                  )}
                  {analytics?.topPosts?.map((p, i) => (
                    <div key={p.id}>
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <div
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: "50%",
                              background: i === 0 ? "#f5a623" : "#e1e3e5",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "11px",
                              fontWeight: "700",
                              color: i === 0 ? "#fff" : "#6d7175",
                              flexShrink: 0,
                            }}
                          >
                            {i + 1}
                          </div>
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
                          <InlineStack gap="300">
                            <Text variant="bodyXs" tone="subdued">
                              🛒 {p.addToCart} cart
                            </Text>
                            {p.conversions > 0 && (
                              <Text variant="bodyXs" tone="success">
                                ✅ {p.conversions} conv
                              </Text>
                            )}
                            {p.addToCartRate !== "0.00" && (
                              <Text variant="bodyXs" tone="subdued">
                                {p.addToCartRate}% cart rate
                              </Text>
                            )}
                            {p.revenue > 0 && (
                              <Text variant="bodyXs" tone="subdued">
                                💰 ${Number(p.revenue).toFixed(2)}
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
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            <CountryBreakdown countries={analytics?.topCountries || []} />
          </Layout.Section>
        </Layout>
      )}
    </Page>
  );
}

/**
 * Analytics Dashboard — Dedicated analytics page with ApexCharts.
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
} from "@shopify/polaris";
import { ArrowLeftIcon, ExportIcon } from "@shopify/polaris-icons";
import StatsCard from "../components/analytics/StatsCard";
import AnalyticsChart from "../components/analytics/AnalyticsChart";
import DeviceChart from "../components/analytics/DeviceChart";
import TopSources from "../components/analytics/TopSources";

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
    if (!analytics?.dailyViews?.length) return;
    const rows = [
      ["Date", "Views"],
      ...analytics.dailyViews.map((d) => [d.date, d.views]),
    ];
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
      subtitle="Insights into your blog's performance"
      backAction={{ content: "Dashboard", onAction: () => navigate("/posts") }}
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
          {/* Stats */}
          <Layout.Section>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
                gap: "16px",
              }}
            >
              <StatsCard
                title="Total Articles"
                value={stats?.totalPosts ?? 0}
                icon="📝"
                color="#008060"
              />
              <StatsCard
                title="Published"
                value={stats?.published ?? 0}
                icon="✅"
                color="#00a97c"
              />
              <StatsCard
                title="Drafts"
                value={stats?.drafts ?? 0}
                icon="📋"
                color="#6d7175"
              />
              <StatsCard
                title="Total Views (30d)"
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
            </div>
          </Layout.Section>

          {/* Views Chart */}
          <Layout.Section>
            <AnalyticsChart
              data={analytics?.dailyViews || []}
              title="Daily Blog Views"
              color="#008060"
            />
          </Layout.Section>

          {/* Device Breakdown + Top Sources */}
          <Layout.Section variant="oneThird">
            <DeviceChart breakdown={analytics?.deviceBreakdown} />
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <TopSources sources={analytics?.topSources || []} />
          </Layout.Section>

          {/* Top Posts */}
          <Layout.Section variant="oneThird">
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd">🏆 Top Performing Posts</Text>
                  <Divider />
                  {analytics?.topPosts?.length === 0 && (
                    <Text tone="subdued" variant="bodySm">
                      No view data yet. Views are tracked when posts are
                      visited.
                    </Text>
                  )}
                  {analytics?.topPosts?.map((p, i) => (
                    <InlineStack
                      key={p.id}
                      align="space-between"
                      blockAlign="center"
                    >
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
                          }}
                        >
                          {i + 1}
                        </div>
                        <BlockStack gap="025">
                          <Text variant="bodySm" fontWeight="semibold">
                            {p.title?.substring(0, 40) || "Untitled"}
                            {p.title?.length > 40 ? "…" : ""}
                          </Text>
                          <Badge
                            tone={p.status === "published" ? "success" : "info"}
                          >
                            {p.status}
                          </Badge>
                        </BlockStack>
                      </InlineStack>
                      <Text variant="bodySm" tone="subdued">
                        {(p.totalViews || 0).toLocaleString()} views
                      </Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>

          {/* Tips */}
          <Layout.Section variant="oneThird">
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd">💡 Grow Your Reach</Text>
                  <Divider />
                  {[
                    "Publish consistently — aim for 2+ posts/week",
                    "Use SEO meta titles for better discoverability",
                    "Add featured images to increase CTR",
                    "Link related products inside posts",
                    "Share published posts on social media",
                  ].map((tip, i) => (
                    <InlineStack key={i} gap="200" blockAlign="start">
                      <Text variant="bodySm" tone="success">
                        ✓
                      </Text>
                      <Text variant="bodySm">{tip}</Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        </Layout>
      )}
    </Page>
  );
}

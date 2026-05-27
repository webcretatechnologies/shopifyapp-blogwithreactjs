import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Spinner,
  Box,
  InlineStack,
  BlockStack,
  Divider,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { RefreshIcon } from "@shopify/polaris-icons";
import StatsCard from "../components/analytics/StatsCard";
import AnalyticsChart from "../components/analytics/AnalyticsChart";

export default function Dashboard() {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [shopInfo, setShopInfo] = useState(null);

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch("/api/posts/analytics/summary");
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch {
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const fetchShop = async () => {
    try {
      const res = await fetch("/api/shop");
      const data = await res.json();
      setShopInfo(data.shop);
    } catch {}
  };

  useEffect(() => {
    fetchAnalytics();
    fetchShop();
  }, []);

  const stats = analytics?.stats;

  return (
    <>
      <TitleBar title="Dashboard" />
      <Page
        title="Dashboard"
        subtitle={
          shopInfo
            ? `${shopInfo.domain} · Plan: ${shopInfo.planKey?.toUpperCase() || "FREE"}`
            : ""
        }
      >
        <Layout>
          {/* ─── Stats Cards ─── */}
          <Layout.Section>
            {analyticsLoading ? (
              <Box padding="400" align="center">
                <Spinner />
              </Box>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
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
              </div>
            )}
          </Layout.Section>

          {/* ─── Analytics Chart ─── */}
          <Layout.Section>
            <AnalyticsChart
              data={analytics?.dailyViews || []}
              title="Blog Views — Last 30 Days"
              color="#008060"
            />
          </Layout.Section>

          {/* ─── Top Posts + Quick Actions ─── */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* Quick Actions */}
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd">Quick Actions</Text>
                    <Divider />
                    <Button
                      variant="primary"
                      fullWidth
                      onClick={() => navigate("/posts/new")}
                    >
                      ✍️ &nbsp; Write New Article
                    </Button>
                    <Button fullWidth onClick={() => navigate("/posts")}>
                      📋 &nbsp; Manage Articles
                    </Button>
                    <Button fullWidth onClick={() => navigate("/posts/import")}>
                      📥 &nbsp; Import from Shopify
                    </Button>
                    <Button fullWidth onClick={() => navigate("/posts/wizard")}>
                      🧙 &nbsp; Article Setup Wizard
                    </Button>
                    <Button
                      fullWidth
                      onClick={() => {
                        fetchAnalytics();
                      }}
                      icon={RefreshIcon}
                    >
                      Refresh Data
                    </Button>
                  </BlockStack>
                </Box>
              </Card>

              {/* Top Posts */}
              {analytics?.topPosts?.length > 0 && (
                <Card>
                  <Box padding="400">
                    <BlockStack gap="300">
                      <Text variant="headingMd">🏆 Top Posts</Text>
                      <Divider />
                      {analytics.topPosts.map((p) => (
                        <InlineStack
                          key={p.id}
                          align="space-between"
                          blockAlign="center"
                        >
                          <BlockStack gap="050">
                            <Text
                              variant="bodySm"
                              fontWeight="semibold"
                              truncate
                              style={{ maxWidth: "180px" }}
                            >
                              {p.title || "Untitled"}
                            </Text>
                            <Badge
                              tone={
                                p.status === "published" ? "success" : "info"
                              }
                            >
                              {p.status}
                            </Badge>
                          </BlockStack>
                          <Text variant="bodySm" tone="subdued">
                            {p.totalViews.toLocaleString()} views
                          </Text>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  </Box>
                </Card>
              )}
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
    </>
  );
}

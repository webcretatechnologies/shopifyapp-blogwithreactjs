import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
  ProgressBar,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { RefreshIcon } from "@shopify/polaris-icons";
import StatsCard from "../components/analytics/StatsCard";
import AnalyticsChart from "../components/analytics/AnalyticsChart";
import SetupGuide from "../components/SetupGuide";

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
            <div style={{ marginTop: 4 }}>
              <ProgressBar
                progress={Math.round(pct)}
                size="small"
                tone={i === 3 ? "success" : i === 0 ? "primary" : "highlight"}
              />
            </div>
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

  useEffect(() => {
    fetchAnalytics();
    fetchShop();
    fetchExtensionStatus();
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
      >
        <Layout>
          {/* ── Setup Guide ─────────────────────────────────────────── */}
          {!analyticsLoading && !extensionLoading && (
            <Layout.Section>
              <SetupGuide 
                shop={shopInfo?.domain} 
                isExtensionActive={extensionActive} 
                hasPosts={stats?.totalPosts > 0} 
              />
            </Layout.Section>
          )}

          {/* ── Quick Actions Banner ────────────────────────────────── */}
          <Layout.Section>
            <Card>
              <Box padding="400">
                <InlineStack align="space-between" blockAlign="center" wrap={false}>
                  <InlineStack gap="400" blockAlign="center">
                    <Text variant="headingMd" as="h2">Quick Actions</Text>
                    <InlineStack gap="200">
                      <Button variant="primary" onClick={() => navigate("/posts/new")}>
                        ✍️ Write New Article
                      </Button>
                      <Button onClick={() => navigate("/posts")}>
                        📋 Manage Articles
                      </Button>
                      <Button onClick={() => navigate("/posts/import")}>
                        📥 Import Posts
                      </Button>
                    </InlineStack>
                  </InlineStack>
                  <Button onClick={fetchAnalytics} icon={RefreshIcon} size="slim">
                    Refresh
                  </Button>
                </InlineStack>
              </Box>
            </Card>
          </Layout.Section>

          {/* ── Stats Cards ────────────────────────────────────────── */}
          <Layout.Section>
            {analyticsLoading ? (
              <Box padding="400" align="center">
                <Spinner />
              </Box>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
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
                  title="Views (30d)"
                  value={(stats?.totalViews ?? 0).toLocaleString()}
                  icon="👁"
                  color="#005bd3"
                />
                <StatsCard
                  title="Revenue"
                  value={`$${(stats?.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  icon="💰"
                  color="#f39c12"
                />
                <StatsCard
                  title="Conversion Rate"
                  value={`${stats?.conversionRate ?? "0.00"}%`}
                  icon="🏆"
                  color="#008060"
                />
              </div>
            )}
          </Layout.Section>

          {/* ── Multi-Series Chart ─────────────────────────────────── */}
          <Layout.Section>
            <AnalyticsChart
              data={analytics?.daily || []}
              title="Blog Performance — Last 30 Days"
              series={[
                { key: "views", label: "Views", color: "#008060" },
                { key: "addToCart", label: "Add to Cart", color: "#e67e22" },
                { key: "conversions", label: "Conversions", color: "#005bd3" },
              ]}
            />
          </Layout.Section>

          {/* ── Funnel + Top Posts ──────────────────── */}
          <Layout.Section variant="oneHalf">
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd">🔄 Conversion Funnel</Text>
                  <Divider />
                  {analytics?.funnel?.length ? (
                    <MiniFunnel funnel={analytics.funnel} />
                  ) : (
                    <Text tone="subdued" variant="bodySm">
                      No funnel data yet.
                    </Text>
                  )}
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneHalf">
            {analytics?.topPosts?.length > 0 ? (
              <Card>
                <Box padding="400">
                  <BlockStack gap="300">
                    <Text variant="headingMd">🏆 Top Posts</Text>
                    <Divider />
                    <BlockStack gap="300">
                      {analytics.topPosts.slice(0, 5).map((p, index) => (
                        <div key={p.id}>
                          <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="050">
                              <Text variant="bodySm" fontWeight="semibold" truncate style={{ maxWidth: "200px" }}>
                                {p.title || "Untitled"}
                              </Text>
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
                    <Text variant="headingMd">🏆 Top Posts</Text>
                    <Divider />
                    <Text tone="subdued" variant="bodySm">No performance data yet.</Text>
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

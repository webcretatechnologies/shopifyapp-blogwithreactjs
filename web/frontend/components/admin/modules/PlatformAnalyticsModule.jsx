import { useState, useEffect, useCallback } from "react";
import { Card, Box, Text, BlockStack, InlineStack, Grid, IndexTable } from "@shopify/polaris";
import AnalyticsChart from "../../analytics/AnalyticsChart";
import AdminDonutChart from "../../analytics/AdminDonutChart";

function KpiCard({ label, value }) {
  return (
    <Card>
      <Box padding="500">
        <Text variant="headingSm" tone="subdued">{label}</Text>
        <Box paddingBlockStart="200">
          <Text variant="heading2xl" as="p">{value}</Text>
        </Box>
      </Box>
    </Card>
  );
}

/** Platform Analytics — cross-shop traffic/revenue, reusing the same aggregation core the
 * merchant-facing analytics page uses (buildAnalyticsPayload with no shopId filter), plus
 * net-new top-shops/top-posts rankings. */
export default function PlatformAnalyticsModule({ active, adminFetch, setError }) {
  const [overview, setOverview] = useState(null);
  const [topShops, setTopShops] = useState([]);
  const [topPosts, setTopPosts] = useState([]);

  const load = useCallback(async () => {
    try {
      const [overviewData, topShopsData, topPostsData] = await Promise.all([
        adminFetch("/admin-api/analytics/overview"),
        adminFetch("/admin-api/analytics/top-shops?limit=10"),
        adminFetch("/admin-api/analytics/top-posts?limit=10"),
      ]);
      setOverview(overviewData);
      setTopShops(topShopsData.shops || []);
      setTopPosts(topPostsData.posts || []);
    } catch (err) {
      setError(err.message);
    }
  }, [adminFetch, setError]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  if (!active) return null;

  const stats = overview?.stats;

  return (
    <BlockStack gap="500">
      <Grid>
        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
          <KpiCard label="Total Views" value={(stats?.totalViews ?? 0).toLocaleString()} />
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
          <KpiCard label="Conversions" value={(stats?.totalConversions ?? 0).toLocaleString()} />
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
          <KpiCard label="Revenue" value={`$${(stats?.totalRevenue ?? 0).toFixed(2)}`} />
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
          <KpiCard label="Conversion Rate" value={`${stats?.conversionRate ?? "0.00"}%`} />
        </Grid.Cell>
      </Grid>

      <Grid>
        <Grid.Cell columnSpan={{ xs: 6, sm: 8, md: 8, lg: 8 }}>
          <AnalyticsChart
            data={overview?.daily || []}
            title="Platform Views & Revenue"
            series={[
              { key: "views", label: "Views", color: "#008060" },
              { key: "revenue", label: "Revenue", color: "#5C6AC4" },
            ]}
            compareData={overview?.previousDaily}
            showComparison
          />
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
          {/* Fixed px height (not "100%") so this always matches the chart card's height
              regardless of legend/comparison-row differences between the two chart types —
              CSS Grid's row-stretch doesn't reliably resolve percentage heights on children. */}
          <div style={{ height: "420px" }}>
            <AdminDonutChart
              title="Device Breakdown"
              data={[
                { label: "Desktop", value: overview?.deviceBreakdown?.desktop ?? 0, color: "#008060" },
                { label: "Mobile", value: overview?.deviceBreakdown?.mobile ?? 0, color: "#5C6AC4" },
                { label: "Tablet", value: overview?.deviceBreakdown?.tablet ?? 0, color: "#EEC200" },
              ]}
              height={260}
            />
          </div>
        </Grid.Cell>
      </Grid>

      <Grid>
        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
          <Card>
            <Box padding="500">
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Top Stores by Views</Text>
                <div style={{ minHeight: "340px", maxHeight: "340px", overflowY: "auto" }}>
                  <IndexTable
                    resourceName={{ singular: "store", plural: "stores" }}
                    itemCount={topShops.length}
                    headings={[{ title: "Store" }, { title: "Views" }, { title: "Conversions" }, { title: "Revenue" }]}
                    selectable={false}
                  >
                    {topShops.map((s, index) => (
                      <IndexTable.Row id={String(s.shopId)} key={s.shopId} position={index}>
                        <IndexTable.Cell><Text fontWeight="bold">{s.domain}</Text></IndexTable.Cell>
                        <IndexTable.Cell>{s.views.toLocaleString()}</IndexTable.Cell>
                        <IndexTable.Cell>{s.conversions.toLocaleString()}</IndexTable.Cell>
                        <IndexTable.Cell>${s.revenue.toFixed(2)}</IndexTable.Cell>
                      </IndexTable.Row>
                    ))}
                  </IndexTable>
                </div>
              </BlockStack>
            </Box>
          </Card>
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
          <Card>
            <Box padding="500">
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Top Posts Platform-wide</Text>
                <div style={{ minHeight: "340px", maxHeight: "340px", overflowY: "auto" }}>
                  <IndexTable
                    resourceName={{ singular: "post", plural: "posts" }}
                    itemCount={topPosts.length}
                    headings={[{ title: "Post" }, { title: "Store" }, { title: "Views" }, { title: "Conv. Rate" }, { title: "Revenue" }]}
                    selectable={false}
                  >
                    {topPosts.map((p, index) => (
                      <IndexTable.Row id={String(p.id)} key={p.id} position={index}>
                        <IndexTable.Cell><Text fontWeight="bold">{p.title}</Text></IndexTable.Cell>
                        <IndexTable.Cell>{p.shopDomain}</IndexTable.Cell>
                        <IndexTable.Cell>{p.views.toLocaleString()}</IndexTable.Cell>
                        <IndexTable.Cell>{p.conversionRate}%</IndexTable.Cell>
                        <IndexTable.Cell>${p.revenue.toFixed(2)}</IndexTable.Cell>
                      </IndexTable.Row>
                    ))}
                  </IndexTable>
                </div>
              </BlockStack>
            </Box>
          </Card>
        </Grid.Cell>
      </Grid>
    </BlockStack>
  );
}

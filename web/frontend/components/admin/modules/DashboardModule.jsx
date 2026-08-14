import { useState, useEffect, useCallback } from "react";
import { Card, Box, Text, BlockStack, InlineStack, Grid, IndexTable, Badge, Button, ProgressBar } from "@shopify/polaris";
import { Download, Info } from "lucide-react";
import { downloadAdminFile } from "../../../utils/adminApi";

const DownloadIcon = (props) => <Download size={16} {...props} />;

const PLAN_ROWS = [
  { key: "free", label: "Free Plan", color: "#9ca3af", tone: "default" },
  { key: "starter", label: "Blogger Starter ($4.99)", color: "#60a5fa", tone: "info" },
  { key: "pro", label: "Blogger Pro ($9.99)", color: "#10b981", tone: "success" },
  { key: "business", label: "Blogger Business ($19.99)", color: "#a78bfa", tone: "attention" },
];

/** Dashboard Overview — KPI cards, plan distribution, monthly churn/signups, recent onboarding. */
export default function DashboardModule({ active, token, adminFetch, setError }) {
  const [metrics, setMetrics] = useState({
    totalShops: 0, activeShops: 0, deactivatedShops: 0,
    newThisMonth: 0, churnedThisMonth: 0, mrr: 0, arr: 0,
    planBreakdown: { free: 0, starter: 0, pro: 0, business: 0 },
  });
  const [monthlyChartData, setMonthlyChartData] = useState([]);
  const [recentShops, setRecentShops] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);

  const load = useCallback(async () => {
    try {
      const data = await adminFetch("/admin-api/dashboard");
      setMetrics(data.metrics);
      setMonthlyChartData(data.monthlyChartData || []);
      setRecentShops(data.recentShops || []);
      setRecentActivities(data.recentActivities || []);
    } catch (err) {
      setError(err.message);
    }
  }, [adminFetch, setError]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const handleExportRevenueCsv = () => {
    downloadAdminFile(token, "/admin-api/revenue/export", `revenue-${new Date().getFullYear()}.csv`)
      .catch((err) => setError(err.message));
  };

  if (!active) return null;

  return (
    <BlockStack gap="500">
      <Grid>
        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4 }}>
          <Card>
            <Box padding="500">
              <Text variant="headingSm" tone="subdued">Active / Total Stores</Text>
              <Box paddingBlockStart="200">
                <Text variant="heading2xl" as="p">
                  <span style={{ color: "#10b981", fontWeight: 700 }}>{metrics.activeShops}</span>
                  <span style={{ color: "#6b7280", fontSize: "16px", marginLeft: "6px" }}>
                    / {metrics.totalShops} stores
                  </span>
                </Text>
              </Box>
            </Box>
          </Card>
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4 }}>
          <Card>
            <Box padding="500">
              <Text variant="headingSm" tone="subdued">New Installs / Churns (This Month)</Text>
              <Box paddingBlockStart="200">
                <Text variant="heading2xl" as="p">
                  <span style={{ color: "#3b82f6", fontWeight: 700 }}>+{metrics.newThisMonth}</span>
                  <span style={{ color: "#ef4444", fontWeight: 700, marginLeft: "12px" }}>
                    -{metrics.churnedThisMonth}
                  </span>
                </Text>
              </Box>
            </Box>
          </Card>
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4 }}>
          <Card>
            <Box padding="500">
              <Text variant="headingSm" tone="subdued">Monthly Recurring Revenue (MRR)</Text>
              <Box paddingBlockStart="200">
                <Text variant="heading2xl" as="p">
                  <span style={{ color: "#202223", fontWeight: 700 }}>${metrics.mrr.toFixed(2)}</span>
                  <span style={{ color: "#6b7280", fontSize: "14px", marginLeft: "8px" }}>
                    ARR: ${metrics.arr.toFixed(2)}
                  </span>
                </Text>
              </Box>
            </Box>
          </Card>
        </Grid.Cell>
      </Grid>

      <Grid>
        <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
          <Card>
            <Box padding="500">
              <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Active Plan Distributions</Text>
                {PLAN_ROWS.map((p) => {
                  const val = metrics.planBreakdown[p.key] || 0;
                  const total = metrics.activeShops || 1;
                  const pct = Math.round((val / total) * 100);
                  return (
                    <BlockStack gap="100" key={p.key}>
                      <InlineStack align="space-between">
                        <Text variant="bodySm" fontWeight="bold">{p.label}</Text>
                        <Text variant="bodySm" tone="subdued">{val} stores ({pct}%)</Text>
                      </InlineStack>
                      <ProgressBar progress={pct} size="small" tone={p.tone} />
                    </BlockStack>
                  );
                })}
              </BlockStack>
            </Box>
          </Card>
        </Grid.Cell>

        <Grid.Cell columnSpan={{ xs: 6, sm: 8, md: 8, lg: 8 }}>
          <Card>
            <Box padding="500">
              <BlockStack gap="300">
                <InlineStack align="space-between" alignY="center">
                  <Text variant="headingMd" as="h3">
                    Monthly Churn & Signups ({new Date().getFullYear()})
                  </Text>
                  <Button icon={DownloadIcon} onClick={handleExportRevenueCsv} size="slim">
                    Export Revenue Report
                  </Button>
                </InlineStack>
                <IndexTable
                  resourceName={{ singular: "row", plural: "rows" }}
                  itemCount={monthlyChartData.length}
                  headings={[
                    { title: "Month" },
                    { title: "New Installs" },
                    { title: "Churned Stores" },
                    { title: "Estimated Revenue" },
                  ]}
                  selectable={false}
                >
                  {monthlyChartData.map((row, index) => (
                    <IndexTable.Row id={String(index)} key={index} position={index}>
                      <IndexTable.Cell>
                        <Text variant="bodyMd" fontWeight="bold">{row.month}</Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <span style={{ color: "#60a5fa", fontWeight: 600 }}>+{row.installs}</span>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <span style={{ color: "#f87171", fontWeight: 600 }}>-{row.churned}</span>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <Text fontWeight="bold">${row.revenue.toFixed(2)}</Text>
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              </BlockStack>
            </Box>
          </Card>
        </Grid.Cell>
      </Grid>

      <Grid>
        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
          <Card>
            <Box padding="500">
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Recent Merchant Onboarding</Text>
                <IndexTable
                  resourceName={{ singular: "store", plural: "stores" }}
                  itemCount={recentShops.length}
                  headings={[
                    { title: "Domain" },
                    { title: "Email" },
                    { title: "Plan" },
                    { title: "Installed" },
                  ]}
                  selectable={false}
                >
                  {recentShops.map((shop, index) => (
                    <IndexTable.Row id={String(shop.id)} key={shop.id} position={index}>
                      <IndexTable.Cell>
                        <Text variant="bodyMd" fontWeight="bold">{shop.domain}</Text>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{shop.email}</IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={shop.planKey === "free" ? "default" : "info"}>{shop.planKey}</Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        {new Date(shop.installedAt).toLocaleDateString()}
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  ))}
                </IndexTable>
              </BlockStack>
            </Box>
          </Card>
        </Grid.Cell>

        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
          <Card>
            <Box padding="500">
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Supervisor Activity Log Feed</Text>
                <div style={{ maxHeight: "280px", overflowY: "auto" }}>
                  <BlockStack gap="300">
                    {recentActivities.length === 0 ? (
                      <Text tone="subdued">No recent system activities found.</Text>
                    ) : (
                      recentActivities.map((act) => (
                        <div
                          key={act.id}
                          style={{ display: "flex", gap: "12px", borderBottom: "1px solid #e1e3e5", paddingBottom: "10px" }}
                        >
                          <Info size={16} color="#008060" style={{ flexShrink: 0, marginTop: "2px" }} />
                          <div>
                            <Text variant="bodySm" tone="subdued">
                              {new Date(act.createdAt).toLocaleString()}
                            </Text>
                            <Text variant="bodyMd">{act.action}</Text>
                          </div>
                        </div>
                      ))
                    )}
                  </BlockStack>
                </div>
              </BlockStack>
            </Box>
          </Card>
        </Grid.Cell>
      </Grid>
    </BlockStack>
  );
}

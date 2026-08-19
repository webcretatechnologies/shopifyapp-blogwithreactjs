import { useState, useEffect, useCallback } from "react";
import { Card, Box, Text, BlockStack, InlineStack, Grid, IndexTable, Badge, Button, ProgressBar } from "@shopify/polaris";
import { Download, Info } from "lucide-react";
import { downloadAdminFile } from "../../../utils/adminApi";
import AnalyticsChart from "../../analytics/AnalyticsChart";
import AdminDonutChart from "../../analytics/AdminDonutChart";

const DownloadIcon = (props) => <Download size={16} {...props} />;

const EVENT_BADGE_TONE = {
  Activated: "success",
  Upgraded: "info",
  Downgraded: "attention",
  Cancelled: "critical",
  Updated: "default",
};

// Always renders the sublabel slot (even blank) so every KPI card in a row has the identical
// DOM structure/height — a card with a 2-line sublabel and one without used to make rows uneven.
function KpiCard({ label, value, sublabel }) {
  return (
    <div style={{ height: "100%" }}>
      <Card>
        <Box padding="500" minHeight="100%">
          <BlockStack gap="200">
            <Text variant="headingSm" tone="subdued">{label}</Text>
            <Text variant="heading2xl" as="p">{value}</Text>
            <Text variant="bodySm" tone="subdued">{sublabel || " "}</Text>
          </BlockStack>
        </Box>
      </Card>
    </div>
  );
}

/** Dashboard Overview — KPI cards, plan distribution, monthly churn/signups, recent onboarding. */
export default function DashboardModule({ active, token, adminFetch, setError }) {
  const [metrics, setMetrics] = useState({
    totalShops: 0, activeShops: 0, deactivatedShops: 0,
    newThisMonth: 0, churnedThisMonth: 0, mrr: 0, arr: 0,
    planDistribution: [],
  });
  const [monthlyChartData, setMonthlyChartData] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);

  const [growth, setGrowth] = useState(null);
  const [storeMovement, setStoreMovement] = useState([]);
  const [recentInstalls, setRecentInstalls] = useState([]);
  const [recentUninstalls, setRecentUninstalls] = useState([]);
  const [subscriptionEvents, setSubscriptionEvents] = useState([]);
  const [uninstallFeedback, setUninstallFeedback] = useState({ breakdown: [], recent: [] });

  const load = useCallback(async () => {
    try {
      const data = await adminFetch("/admin-api/dashboard");
      setMetrics(data.metrics);
      setMonthlyChartData(data.monthlyChartData || []);
      setRecentActivities(data.recentActivities || []);

      const [
        growthData, movementData, installsData, uninstallsData, eventsData, feedbackData,
      ] = await Promise.all([
        adminFetch("/admin-api/growth/overview"),
        adminFetch("/admin-api/growth/store-movement"),
        adminFetch("/admin-api/growth/recent-installs"),
        adminFetch("/admin-api/growth/recent-uninstalls"),
        adminFetch("/admin-api/growth/subscription-events"),
        adminFetch("/admin-api/growth/uninstall-feedback"),
      ]);
      setGrowth(growthData);
      setStoreMovement(movementData.daily || []);
      setRecentInstalls(installsData.shops || []);
      setRecentUninstalls(uninstallsData.shops || []);
      setSubscriptionEvents(eventsData.events || []);
      setUninstallFeedback({ breakdown: feedbackData.breakdown || [], recent: feedbackData.recent || [] });
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
          <KpiCard
            label="Active / Total Stores"
            value={
              <>
                <span style={{ color: "#10b981", fontWeight: 700 }}>{metrics.activeShops}</span>
                <span style={{ color: "#6b7280", fontSize: "16px", marginLeft: "6px" }}>
                  / {metrics.totalShops} stores
                </span>
              </>
            }
            sublabel="All-time installs vs. currently active"
          />
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4 }}>
          <KpiCard
            label="New Installs / Churns (This Month)"
            value={
              <>
                <span style={{ color: "#3b82f6", fontWeight: 700 }}>+{metrics.newThisMonth}</span>
                <span style={{ color: "#ef4444", fontWeight: 700, marginLeft: "12px" }}>
                  -{metrics.churnedThisMonth}
                </span>
              </>
            }
            sublabel="Installs vs. uninstalls this month"
          />
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4 }}>
          <KpiCard
            label="Monthly Recurring Revenue (MRR)"
            value={
              <>
                <span style={{ color: "#202223", fontWeight: 700 }}>${metrics.mrr.toFixed(2)}</span>
                <span style={{ color: "#6b7280", fontSize: "14px", marginLeft: "8px" }}>
                  ARR: ${metrics.arr.toFixed(2)}
                </span>
              </>
            }
            sublabel="Estimated from plan pricing, not real payout data"
          />
        </Grid.Cell>
      </Grid>

      <Grid>
        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
          <KpiCard label="Total Installed" value={growth?.totalInstalled ?? 0} sublabel="Lifetime installs" />
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
          <KpiCard label="Paying Stores" value={growth?.payingStores ?? 0} sublabel="Active, non-free plan" />
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
          <KpiCard label="Installs (7d)" value={growth?.installs7d ?? 0} sublabel="New installs this week" />
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
          <KpiCard label="Uninstalls (mo)" value={growth?.uninstallsThisMonth ?? 0} sublabel="Churned this month" />
        </Grid.Cell>
      </Grid>

      <Grid>
        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
          <KpiCard label="Retained 7 days" value={`${growth?.retention7 ?? 0}%`} sublabel="Still active after 7 days" />
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
          <KpiCard label="Retained 30 days" value={`${growth?.retention30 ?? 0}%`} sublabel="Still active after 30 days" />
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
          <KpiCard label="Retained 180 days" value={`${growth?.retention180 ?? 0}%`} sublabel="Still active after 180 days" />
        </Grid.Cell>
        <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
          <KpiCard label="Churn Rate" value={`${growth?.churnRatePct ?? 0}%`} sublabel="This month" />
        </Grid.Cell>
      </Grid>

      <AnalyticsChart
        data={storeMovement}
        title="Store Movement"
        series={[
          { key: "installs", label: "Installs", color: "#008060" },
          { key: "uninstalls", label: "Uninstalls", color: "#DE3618" },
        ]}
        chartType="line"
        showPeriodSelector={false}
      />

      <InlineStack align="end">
        <Button icon={DownloadIcon} onClick={handleExportRevenueCsv} size="slim">
          Export Revenue Report
        </Button>
      </InlineStack>
      <Grid>
        <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
          {/* Fixed px height (not "100%") so this reliably matches the chart card's height —
              CSS Grid's row-stretch doesn't consistently resolve percentage heights here. */}
          <div style={{ height: "420px" }}>
            <AdminDonutChart
              title="Active Plan Distribution"
              data={metrics.planDistribution.map((p) => ({
                label: p.price > 0 ? `${p.label} ($${p.price.toFixed(2)})` : p.label,
                value: p.count,
              }))}
              height={260}
            />
          </div>
        </Grid.Cell>

        <Grid.Cell columnSpan={{ xs: 6, sm: 8, md: 8, lg: 8 }}>
          <div style={{ height: "420px" }}>
            <AnalyticsChart
              data={monthlyChartData}
              title={`Installs, Churn & Revenue (${new Date().getFullYear()})`}
              series={[
                { key: "installs", label: "Installs", color: "#008060" },
                { key: "churned", label: "Churned", color: "#DE3618" },
                { key: "revenue", label: "Revenue", color: "#5C6AC4" },
              ]}
              chartType="line"
              showPeriodSelector={false}
            />
          </div>
        </Grid.Cell>
      </Grid>

      <Grid>
        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
          <Card>
            <Box padding="500">
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">Recent Installs</Text>
                {/* minHeight matches maxHeight so a short list (or Polaris's own empty-state
                    illustration, which is taller than a single data row) always occupies the
                    same space as its paired card, instead of collapsing to fit its content. */}
                <div style={{ minHeight: "320px", maxHeight: "320px", overflowY: "auto" }}>
                  <IndexTable
                    resourceName={{ singular: "store", plural: "stores" }}
                    itemCount={recentInstalls.length}
                    headings={[{ title: "Domain" }, { title: "Plan" }, { title: "Installed" }]}
                    selectable={false}
                  >
                    {recentInstalls.map((shop, index) => (
                      <IndexTable.Row id={String(shop.id)} key={shop.id} position={index}>
                        <IndexTable.Cell>
                          <Text variant="bodyMd" fontWeight="bold">{shop.domain}</Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Badge tone={shop.planKey === "free" ? "default" : "info"}>{shop.planKey}</Badge>
                        </IndexTable.Cell>
                        <IndexTable.Cell>{new Date(shop.installedAt).toLocaleDateString()}</IndexTable.Cell>
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
                <Text variant="headingMd" as="h3">Recent Uninstalls</Text>
                <div style={{ minHeight: "320px", maxHeight: "320px", overflowY: "auto" }}>
                  <IndexTable
                    resourceName={{ singular: "store", plural: "stores" }}
                    itemCount={recentUninstalls.length}
                    headings={[{ title: "Domain" }, { title: "Plan" }, { title: "Uninstalled" }]}
                    selectable={false}
                  >
                    {recentUninstalls.map((shop, index) => (
                      <IndexTable.Row id={String(shop.id)} key={shop.id} position={index}>
                        <IndexTable.Cell>
                          <Text variant="bodyMd" fontWeight="bold">{shop.domain}</Text>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          <Badge tone={shop.planKey === "free" ? "default" : "info"}>{shop.planKey}</Badge>
                        </IndexTable.Cell>
                        <IndexTable.Cell>{new Date(shop.uninstalledAt).toLocaleDateString()}</IndexTable.Cell>
                      </IndexTable.Row>
                    ))}
                  </IndexTable>
                </div>
              </BlockStack>
            </Box>
          </Card>
        </Grid.Cell>
      </Grid>

      <Grid>
        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
          <div style={{ height: "100%" }}>
            <Card>
              <Box padding="500">
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">Subscription Events</Text>
                  <div style={{ minHeight: "280px", maxHeight: "280px", overflowY: "auto" }}>
                    <BlockStack gap="300">
                      {subscriptionEvents.length === 0 ? (
                        <Text tone="subdued">No subscription events yet.</Text>
                      ) : (
                        subscriptionEvents.map((ev, i) => (
                          <div
                            key={`${ev.shopDomain}-${ev.createdAt}-${i}`}
                            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", borderBottom: "1px solid #e1e3e5", paddingBottom: "10px" }}
                          >
                            <div>
                              <Text variant="bodySm" tone="subdued">{new Date(ev.createdAt).toLocaleString()}</Text>
                              <Text variant="bodyMd" fontWeight="bold">{ev.shopDomain}</Text>
                              <Text variant="bodySm" tone="subdued">{ev.planKey}</Text>
                            </div>
                            <Badge tone={EVENT_BADGE_TONE[ev.event] || "default"}>{ev.event}</Badge>
                          </div>
                        ))
                      )}
                    </BlockStack>
                  </div>
                </BlockStack>
              </Box>
            </Card>
          </div>
        </Grid.Cell>

        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6 }}>
          <div style={{ height: "100%" }}>
            <Card>
              <Box padding="500">
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h3">Why They Uninstall</Text>
                  <div style={{ minHeight: "280px", maxHeight: "280px", overflowY: "auto" }}>
                    <BlockStack gap="400">
                      {uninstallFeedback.breakdown.length === 0 ? (
                        <Text tone="subdued">No uninstall feedback collected yet.</Text>
                      ) : (
                        uninstallFeedback.breakdown.map((b) => (
                          <BlockStack gap="100" key={b.reason}>
                            <InlineStack align="space-between">
                              <Text variant="bodySm" fontWeight="bold">{b.reason}</Text>
                              <Text variant="bodySm" tone="subdued">{b.count} ({b.pct}%)</Text>
                            </InlineStack>
                            <ProgressBar progress={b.pct} size="small" />
                          </BlockStack>
                        ))
                      )}
                    </BlockStack>
                  </div>
                </BlockStack>
              </Box>
            </Card>
          </div>
        </Grid.Cell>
      </Grid>

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
    </BlockStack>
  );
}

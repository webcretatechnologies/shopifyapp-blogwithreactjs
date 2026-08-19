import { useState, useEffect, useCallback } from "react";
import { Card, Box, Text, BlockStack, InlineStack, IndexTable, Button, TextField, Select } from "@shopify/polaris";
import AnalyticsChart from "../../analytics/AnalyticsChart";

const TARGET_TYPE_OPTIONS = [
  { label: "All types", value: "" },
  { label: "Shop", value: "shop" },
  { label: "Coupon", value: "coupon" },
  { label: "Feature", value: "feature" },
  { label: "Plan", value: "plan" },
];

/** Supervisor Activity — filterable, paginated audit log of every admin action. */
export default function ActivityModule({ active, adminFetch, setError }) {
  const [activities, setActivities] = useState([]);
  const [activitiesTotal, setActivitiesTotal] = useState(0);
  const [activitiesPage, setActivitiesPage] = useState(1);
  const [dailyVolume, setDailyVolume] = useState([]);
  const [search, setSearch] = useState("");
  const [targetType, setTargetType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(activitiesPage), limit: "20" });
      if (search) params.set("search", search);
      if (targetType) params.set("targetType", targetType);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const data = await adminFetch(`/admin-api/activities?${params.toString()}`);
      setActivities(data.activities || []);
      setActivitiesTotal(data.total || 0);
      setDailyVolume(data.dailyVolume || []);
    } catch (err) {
      setError(err.message);
    }
  }, [adminFetch, activitiesPage, search, targetType, dateFrom, dateTo, setError]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  useEffect(() => {
    setActivitiesPage(1);
  }, [search, targetType, dateFrom, dateTo]);

  if (!active) return null;

  return (
    <BlockStack gap="400">
      {dailyVolume.length > 0 && (
        <AnalyticsChart
          data={dailyVolume}
          title="Activity Volume"
          chartType="bar"
          series={[{ key: "count", label: "Actions", color: "#008060" }]}
          showPeriodSelector={false}
          height={160}
        />
      )}

      <Card>
        <Box padding="500">
          <BlockStack gap="400">
            <InlineStack gap="300" wrap>
              <div style={{ minWidth: "220px" }}>
                <TextField
                  label="Search action"
                  labelHidden
                  placeholder="Search action…"
                  value={search}
                  onChange={setSearch}
                  autoComplete="off"
                />
              </div>
              <div style={{ minWidth: "180px" }}>
                <Select label="Target type" labelHidden options={TARGET_TYPE_OPTIONS} value={targetType} onChange={setTargetType} />
              </div>
              <div style={{ minWidth: "160px" }}>
                <TextField label="From" labelHidden type="date" value={dateFrom} onChange={setDateFrom} autoComplete="off" />
              </div>
              <div style={{ minWidth: "160px" }}>
                <TextField label="To" labelHidden type="date" value={dateTo} onChange={setDateTo} autoComplete="off" />
              </div>
            </InlineStack>

            <div style={{ overflowX: "auto", width: "100%", borderTop: "1px solid #e1e3e5" }}>
              <IndexTable
                resourceName={{ singular: "log", plural: "logs" }}
                itemCount={activities.length}
                headings={[
                  { title: "Date & Time" }, { title: "Action" }, { title: "Type" }, { title: "ID" },
                ]}
                selectable={false}
              >
                {activities.map((a, index) => (
                  <IndexTable.Row id={String(a.id)} key={a.id} position={index}>
                    <IndexTable.Cell>{new Date(a.createdAt).toLocaleString()}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text variant="bodyMd" fontWeight="bold">{a.action}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{a.targetType || "setting"}</IndexTable.Cell>
                    <IndexTable.Cell>{a.targetId || "N/A"}</IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            </div>

            {activitiesTotal > 20 && (
              <InlineStack align="center" gap="400">
                <Button disabled={activitiesPage === 1} onClick={() => setActivitiesPage((p) => Math.max(p - 1, 1))}>
                  Prev
                </Button>
                <Text variant="bodyMd">Page {activitiesPage} of {Math.ceil(activitiesTotal / 20)}</Text>
                <Button disabled={activitiesPage * 20 >= activitiesTotal} onClick={() => setActivitiesPage((p) => p + 1)}>
                  Next
                </Button>
              </InlineStack>
            )}
          </BlockStack>
        </Box>
      </Card>
    </BlockStack>
  );
}

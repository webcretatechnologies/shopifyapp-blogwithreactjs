import { useState, useEffect, useCallback } from "react";
import { Card, Box, Text, BlockStack, InlineStack, IndexTable, Button } from "@shopify/polaris";

/** Supervisor Activity — paginated audit log of every admin action. */
export default function ActivityModule({ active, adminFetch, setError }) {
  const [activities, setActivities] = useState([]);
  const [activitiesTotal, setActivitiesTotal] = useState(0);
  const [activitiesPage, setActivitiesPage] = useState(1);

  const load = useCallback(async () => {
    try {
      const data = await adminFetch(`/admin-api/activities?page=${activitiesPage}&limit=20`);
      setActivities(data.activities || []);
      setActivitiesTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    }
  }, [adminFetch, activitiesPage, setError]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  if (!active) return null;

  return (
    <Card>
      <Box padding="500">
        <BlockStack gap="400">
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
  );
}

import { useState, useEffect, useCallback } from "react";
import {
  Card, Box, Text, BlockStack, InlineStack, Grid, IndexTable, Badge, Button,
  TextField, Select, Modal, FormLayout,
} from "@shopify/polaris";
import { Download, Trash2 } from "lucide-react";
import ConfirmActionModal from "../../ConfirmActionModal";
import { downloadAdminFile } from "../../../utils/adminApi";

const DownloadIcon = (props) => <Download size={16} {...props} />;
const TrashIcon = (props) => <Trash2 size={16} {...props} />;

/** Stores Auditor — searchable/filterable store list, per-store actions, and 2 modals
 * (plan override, store detail). */
export default function StoresModule({ active, token, adminFetch, showToast, setError }) {
  const [stores, setStores] = useState([]);
  const [storesTotal, setStoresTotal] = useState(0);
  const [storesSearch, setStoresSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy] = useState("installedAt");
  const [sortDir] = useState("desc");
  const [storesPage, setStoresPage] = useState(1);

  const [overrideModalActive, setOverrideModalActive] = useState(false);
  const [selectedStoreDomain, setSelectedStoreDomain] = useState("");
  const [overridePlan, setOverridePlan] = useState("Pro Plan");
  const [overrideExpiry, setOverrideExpiry] = useState("");

  const [detailModalActive, setDetailModalActive] = useState(false);
  const [storeDetail, setStoreDetail] = useState(null);
  const [storeLogs, setStoreLogs] = useState([]);

  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const queryParams = new URLSearchParams({
        search: storesSearch, statusFilter, planFilter, dateFrom, dateTo,
        sortBy, sortDir, page: storesPage.toString(), limit: "20",
      });
      const data = await adminFetch(`/admin-api/stores?${queryParams.toString()}`);
      setStores(data.stores || []);
      setStoresTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    }
  }, [adminFetch, storesSearch, statusFilter, planFilter, dateFrom, dateTo, sortBy, sortDir, storesPage, setError]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const handleExportStoresCsv = () => {
    downloadAdminFile(token, "/admin-api/stores/export", `stores-${new Date().toISOString().split("T")[0]}.csv`)
      .catch((err) => setError(err.message));
  };

  const handleOverrideSubmit = async () => {
    try {
      await adminFetch(`/admin-api/stores/${selectedStoreDomain}/override`, {
        method: "POST",
        body: JSON.stringify({ plan: overridePlan, expiresAt: overrideExpiry || null }),
      });
      setOverrideModalActive(false);
      showToast(`Overrode plan for ${selectedStoreDomain} successfully`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReactivateStore = async (domain) => {
    try {
      await adminFetch(`/admin-api/stores/${domain}/reactivate`, { method: "POST" });
      showToast(`Reactivated store ${domain} and sent confirmation email`);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSoftDeactivateStore = (domain) => {
    setConfirmAction({
      title: `Deactivate ${domain}?`,
      body: "This will set the store as uninstalled and send a deactivation notification email.",
      confirmText: "Deactivate store",
      confirmTone: "warning",
      onConfirm: async () => {
        await adminFetch(`/admin-api/stores/${domain}/deactivate`, { method: "POST" });
        showToast(`Soft deactivated ${domain}`);
        load();
      },
    });
  };

  const handleForceDeleteStore = (domain) => {
    setConfirmAction({
      title: `Force delete ${domain}?`,
      body: (
        <BlockStack gap="200">
          <Text as="p" variant="bodyMd">This permanently removes the store from the app database.</Text>
          <Text as="p" variant="bodyMd">It will also cascade delete all posts, sessions, plan entries, overrides, and related configurations.</Text>
          <Text as="p" variant="bodyMd" tone="critical" fontWeight="bold">This cannot be undone.</Text>
        </BlockStack>
      ),
      confirmText: "Force delete",
      confirmTone: "critical",
      onConfirm: async () => {
        await adminFetch(`/admin-api/stores/${domain}/delete`, { method: "POST" });
        showToast(`Force deleted store ${domain} from app database`);
        load();
      },
    });
  };

  const runConfirmedAction = async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      await confirmAction.onConfirm();
      setConfirmAction(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleViewStoreDetail = async (domain) => {
    try {
      const data = await adminFetch(`/admin-api/stores/${domain}`);
      setStoreDetail(data.store);
      setStoreLogs(data.logs || []);
      setDetailModalActive(true);
    } catch (err) {
      setError(err.message);
    }
  };

  if (!active) return null;

  return (
    <>
      <Card>
        <Box padding="500">
          <BlockStack gap="400">
            <Grid>
              <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 2 }}>
                <TextField
                  placeholder="Domain keyword..."
                  value={storesSearch}
                  onChange={(val) => { setStoresSearch(val); setStoresPage(1); }}
                  autoComplete="off"
                  label="Search Stores"
                />
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 2 }}>
                <Select
                  label="Status"
                  options={[
                    { label: "All Stores", value: "all" },
                    { label: "Active", value: "active" },
                    { label: "Deactivated", value: "deactivated" },
                  ]}
                  value={statusFilter}
                  onChange={(val) => { setStatusFilter(val); setStoresPage(1); }}
                />
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 2, md: 2, lg: 2 }}>
                <Select
                  label="Plan Key"
                  options={[
                    { label: "All Plans", value: "all" },
                    { label: "Free tier", value: "free" },
                    { label: "Starter Plan", value: "Starter Plan" },
                    { label: "Pro Plan", value: "Pro Plan" },
                    { label: "Business Plan", value: "Business Plan" },
                  ]}
                  value={planFilter}
                  onChange={(val) => { setPlanFilter(val); setStoresPage(1); }}
                />
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                <InlineStack gap="200" align="space-between">
                  <div style={{ width: "47%" }}>
                    <TextField
                      label="Date From"
                      type="date"
                      value={dateFrom}
                      onChange={(val) => { setDateFrom(val); setStoresPage(1); }}
                      autoComplete="off"
                    />
                  </div>
                  <div style={{ width: "47%" }}>
                    <TextField
                      label="Date To"
                      type="date"
                      value={dateTo}
                      onChange={(val) => { setDateTo(val); setStoresPage(1); }}
                      autoComplete="off"
                    />
                  </div>
                </InlineStack>
              </Grid.Cell>
              <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                <div style={{ display: "flex", height: "100%", alignItems: "flex-end", gap: "10px" }}>
                  <Button icon={DownloadIcon} onClick={handleExportStoresCsv}>Export CSV</Button>
                  <Button onClick={load} variant="primary">Apply</Button>
                </div>
              </Grid.Cell>
            </Grid>

            <div style={{ overflowX: "auto", width: "100%", borderTop: "1px solid #e1e3e5" }}>
              <IndexTable
                resourceName={{ singular: "store", plural: "stores" }}
                itemCount={stores.length}
                headings={[
                  { title: "Domain" }, { title: "Email" }, { title: "Plan" },
                  { title: "Override" }, { title: "Installed" }, { title: "Status" }, { title: "Actions" },
                ]}
                selectable={false}
              >
                {stores.map((s, index) => (
                  <IndexTable.Row id={String(s.id)} key={s.id} position={index}>
                    <IndexTable.Cell>
                      <Text variant="bodyMd" fontWeight="bold">{s.domain}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{s.email}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={s.planKey === "free" ? "default" : "info"}>{s.planKey}</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      {s.hasOverride ? (
                        <Badge tone="attention">Yes ({s.overridePlan})</Badge>
                      ) : (
                        <Text tone="subdued">None</Text>
                      )}
                    </IndexTable.Cell>
                    <IndexTable.Cell>{new Date(s.installedAt).toLocaleDateString()}</IndexTable.Cell>
                    <IndexTable.Cell>
                      {s.uninstalledAt ? (
                        <Badge tone="critical">
                          Deactivated ({new Date(s.uninstalledAt).toLocaleDateString()})
                        </Badge>
                      ) : (
                        <Badge tone="success">Active</Badge>
                      )}
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <InlineStack gap="150">
                        <Button size="slim" onClick={() => handleViewStoreDetail(s.domain)}>Detail</Button>
                        <Button
                          size="slim"
                          onClick={() => {
                            setSelectedStoreDomain(s.domain);
                            setOverridePlan(s.planKey);
                            setOverrideExpiry(
                              s.overrideExpiresAt ? new Date(s.overrideExpiresAt).toISOString().split("T")[0] : "",
                            );
                            setOverrideModalActive(true);
                          }}
                        >
                          Override
                        </Button>
                        {s.uninstalledAt ? (
                          <Button size="slim" tone="success" onClick={() => handleReactivateStore(s.domain)}>
                            Reactivate
                          </Button>
                        ) : (
                          <Button size="slim" tone="destructive" onClick={() => handleSoftDeactivateStore(s.domain)}>
                            Deactivate
                          </Button>
                        )}
                        <Button
                          size="slim"
                          tone="destructive"
                          variant="primary"
                          icon={TrashIcon}
                          onClick={() => handleForceDeleteStore(s.domain)}
                        />
                      </InlineStack>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            </div>

            {storesTotal > 20 && (
              <InlineStack align="center" gap="400">
                <Button disabled={storesPage === 1} onClick={() => setStoresPage((p) => Math.max(p - 1, 1))}>
                  Prev
                </Button>
                <Text variant="bodyMd">Page {storesPage} of {Math.ceil(storesTotal / 20)}</Text>
                <Button disabled={storesPage * 20 >= storesTotal} onClick={() => setStoresPage((p) => p + 1)}>
                  Next
                </Button>
              </InlineStack>
            )}
          </BlockStack>
        </Box>
      </Card>

      <Modal
        open={overrideModalActive}
        onClose={() => setOverrideModalActive(false)}
        title={`Override Plan Gating for ${selectedStoreDomain}`}
        primaryAction={{ content: "Save Override Configuration", onAction: handleOverrideSubmit }}
        secondaryActions={[{ content: "Cancel", onAction: () => setOverrideModalActive(false) }]}
      >
        <Modal.Section>
          <FormLayout>
            <Select
              label="Target Custom Gating Plan Level"
              options={[
                { label: "Starter Plan", value: "Starter Plan" },
                { label: "Pro Plan", value: "Pro Plan" },
                { label: "Business Plan", value: "Business Plan" },
                { label: "Free tier", value: "free" },
              ]}
              value={overridePlan}
              onChange={setOverridePlan}
            />
            <TextField
              label="Bypass Expiry Date (YYYY-MM-DD)"
              value={overrideExpiry}
              onChange={setOverrideExpiry}
              placeholder="e.g. 2026-12-31"
              autoComplete="off"
              helpText="Leave completely blank for permanent indefinite overrides."
            />
          </FormLayout>
        </Modal.Section>
      </Modal>

      <Modal
        open={detailModalActive}
        onClose={() => { setDetailModalActive(false); setStoreDetail(null); }}
        title={`Auditing Domain details: ${storeDetail?.domain || ""}`}
        primaryAction={{ content: "Close details", onAction: () => { setDetailModalActive(false); setStoreDetail(null); } }}
      >
        <Modal.Section>
          {storeDetail && (
            <BlockStack gap="400">
              <Grid>
                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                  <Card>
                    <Box padding="300">
                      <Text variant="headingSm" tone="subdued">DB Primary ID</Text>
                      <Text variant="headingMd">{storeDetail.id}</Text>
                    </Box>
                  </Card>
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                  <Card>
                    <Box padding="300">
                      <Text variant="headingSm" tone="subdued">Active Tier</Text>
                      <Text variant="headingMd">{storeDetail.planKey}</Text>
                    </Box>
                  </Card>
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                  <Card>
                    <Box padding="300">
                      <Text variant="headingSm" tone="subdued">Owner Email</Text>
                      <Text variant="headingMd">{storeDetail.email}</Text>
                    </Box>
                  </Card>
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3 }}>
                  <Card>
                    <Box padding="300">
                      <Text variant="headingSm" tone="subdued">Onboard Date</Text>
                      <Text variant="headingMd">{new Date(storeDetail.installedAt).toLocaleDateString()}</Text>
                    </Box>
                  </Card>
                </Grid.Cell>
              </Grid>

              <Grid>
                <Grid.Cell columnSpan={{ xs: 6, sm: 4, md: 4, lg: 4 }}>
                  <Card>
                    <Box padding="300">
                      <Text variant="bodyMd" fontWeight="bold">Published Content Metrics</Text>
                      <Box paddingBlockStart="200">
                        <BlockStack gap="150">
                          <InlineStack align="space-between">
                            <Text>Total Posts Count:</Text>
                            <Text fontWeight="bold">{storeDetail.postsCount}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text>Total Categories Count:</Text>
                            <Text fontWeight="bold">{storeDetail.categoriesCount}</Text>
                          </InlineStack>
                          <InlineStack align="space-between">
                            <Text>Total Tag references:</Text>
                            <Text fontWeight="bold">{storeDetail.tagsCount}</Text>
                          </InlineStack>
                        </BlockStack>
                      </Box>
                    </Box>
                  </Card>
                </Grid.Cell>
                <Grid.Cell columnSpan={{ xs: 6, sm: 8, md: 8, lg: 8 }}>
                  <Card>
                    <Box padding="300">
                      <Text variant="bodyMd" fontWeight="bold">Recent Specific Audit Log</Text>
                      <Box paddingBlockStart="200">
                        {storeLogs.length === 0 ? (
                          <Text tone="subdued">No supervisor logs recorded for this store.</Text>
                        ) : (
                          storeLogs.map((log) => (
                            <div key={log.id} style={{ borderBottom: "1px solid #e1e3e5", paddingBottom: "6px", marginBottom: "6px" }}>
                              <Text variant="bodySm" tone="subdued">{new Date(log.createdAt).toLocaleString()}</Text>
                              <Text>{log.action}</Text>
                            </div>
                          ))
                        )}
                      </Box>
                    </Box>
                  </Card>
                </Grid.Cell>
              </Grid>
            </BlockStack>
          )}
        </Modal.Section>
      </Modal>


      {confirmAction && (
        <ConfirmActionModal
          open={!!confirmAction}
          title={confirmAction.title}
          body={confirmAction.body}
          confirmText={confirmAction.confirmText}
          confirmTone={confirmAction.confirmTone}
          loading={confirmLoading}
          onConfirm={runConfirmedAction}
          onCancel={() => !confirmLoading && setConfirmAction(null)}
        />
      )}
    </>
  );
}

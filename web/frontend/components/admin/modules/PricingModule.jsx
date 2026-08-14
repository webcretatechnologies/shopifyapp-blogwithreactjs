import { useState, useEffect, useCallback } from "react";
import { Card, Box, Text, BlockStack, InlineStack, Banner, Divider, Button, DataTable, Badge } from "@shopify/polaris";
import { RefreshCw } from "lucide-react";
import ConfirmActionModal from "../../ConfirmActionModal";
import PlanCard from "../PlanCard";
import EditPlanCoreModal from "../EditPlanCoreModal";
import SyncFeaturesModal from "../SyncFeaturesModal";
import SyncLimitsModal from "../SyncLimitsModal";
import { planFeatureBucket } from "../planLimitKeys";

const RefreshIcon = (props) => <RefreshCw size={16} {...props} />;

const BLANK_PLAN = {
  name: "", title: "", price: "0.00", currency: "USD", interval: "EVERY_30_DAYS",
  trialDays: 0, description: "", isActive: true, sortOrder: 0,
};

/** Pricing & Billing — the card-per-plan Plans & Billing grid. */
export default function PricingModule({ active, adminFetch, showToast, setError }) {
  const [features, setFeatures] = useState([]);
  const [dynamicPlans, setDynamicPlans] = useState([]);
  const [comparisonRows, setComparisonRows] = useState([]);
  const [planLabels, setPlanLabels] = useState(["Free", "Starter", "Pro"]);

  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [syncFeaturesPlan, setSyncFeaturesPlan] = useState(null);
  const [syncLimitsPlan, setSyncLimitsPlan] = useState(null);

  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const featuresData = await adminFetch("/admin-api/pricing/features");
      setFeatures(featuresData.features || []);
      const plansData = await adminFetch("/admin-api/pricing/plans");
      setDynamicPlans(plansData.plans || []);
      const comparisonData = await adminFetch("/admin-api/pricing/comparison");
      setComparisonRows(comparisonData.rows || []);
      setPlanLabels(comparisonData.planLabels || ["Free", "Starter", "Pro"]);
    } catch (err) {
      setError(err.message);
    }
  }, [adminFetch, setError]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  // Sync Features/Sync Limits both submit as one batch (matching the reference UI's single
  // "Sync ..." action) instead of a per-row Save — fire every changed row's request, then refetch
  // and toast once so the count in the toast matches what the admin actually changed.
  const handleFeatureBatchSync = async (changes) => {
    try {
      await Promise.all(changes.map((c) =>
        adminFetch(`/admin-api/pricing/features/${c.id}`, {
          method: "POST",
          body: JSON.stringify({ enabled: c.enabled, limit: c.limit }),
        })
      ));
      showToast(`${changes.length} feature${changes.length === 1 ? "" : "s"} updated successfully`);
      load();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const handleResetFeatures = () => {
    setConfirmAction({
      title: "Restore default feature limits?",
      body: "All custom feature rules will be overwritten and restored to system defaults.",
      confirmText: "Restore defaults",
      confirmTone: "critical",
      onConfirm: async () => {
        await adminFetch("/admin-api/pricing/features/reset", { method: "POST" });
        showToast("Plan features restored to system defaults");
        load();
      },
    });
  };

  const handleSavePlan = async () => {
    if (!editingPlan.name || !editingPlan.title) {
      setError("Name and Title are required.");
      return;
    }
    setSavingPlan(true);
    try {
      const isNew = !editingPlan.id;
      const url = isNew ? "/admin-api/pricing/plans" : `/admin-api/pricing/plans/${editingPlan.id}`;
      const method = isNew ? "POST" : "PUT";
      // `features` (the merchant-facing marketing bullet list) is intentionally never sent here —
      // this modal no longer edits it, and the backend leaves an omitted `features` key untouched
      // on PUT, so existing values survive a Core edit unchanged.
      const payload = {
        ...editingPlan,
        price: parseFloat(editingPlan.price),
        trialDays: parseInt(editingPlan.trialDays, 10) || 0,
      };
      await adminFetch(url, { method, body: JSON.stringify(payload) });
      showToast(`Plan ${isNew ? "created" : "updated"} successfully`);
      setShowPlanModal(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPlan(false);
    }
  };

  const handleDeletePlan = (plan) => {
    const subscriberNote = plan.subscriberCount > 0
      ? ` ${plan.subscriberCount} store${plan.subscriberCount === 1 ? " is" : "s are"} currently on this plan — they keep their existing Shopify subscription; this only removes it from being offered to new/upgrading merchants.`
      : "";
    setConfirmAction({
      title: `Delete "${plan.title}"?`,
      body: `This action is irreversible and the plan will be permanently removed.${subscriberNote}`,
      confirmText: "Delete plan",
      confirmTone: "critical",
      onConfirm: async () => {
        await adminFetch(`/admin-api/pricing/plans/${plan.id}`, { method: "DELETE" });
        showToast("Plan deleted successfully");
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

  if (!active) return null;

  return (
    <BlockStack gap="500">
      <Card>
        <Box padding="500">
          <BlockStack gap="400">
            <InlineStack align="space-between" alignY="center">
              <div>
                <Text variant="headingLg" as="h3">SaaS App Plans Configuration</Text>
                <Text variant="bodySm" tone="subdued">
                  Manage every plan's pricing, trial, features, and limits — everything here is
                  live-synced with the merchant billing page.
                </Text>
              </div>
              <InlineStack gap="200">
                <Button tone="critical" onClick={handleResetFeatures} icon={RefreshIcon}>
                  Reset Features to Defaults
                </Button>
                <Button variant="primary" onClick={() => { setEditingPlan(BLANK_PLAN); setShowPlanModal(true); }}>
                  Add Billing Plan
                </Button>
              </InlineStack>
            </InlineStack>
            <Banner tone="info">
              <Text as="p" variant="bodySm">
                <strong>Live-synced with the merchant billing page.</strong> Editing a plan here
                updates <code>/plans</code> immediately. Plans created here dynamically appear in
                the merchant portal.
              </Text>
            </Banner>
            <Divider />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
              {dynamicPlans.map((plan) => (
                <div key={plan.id} style={{ flex: "1 1 300px", minWidth: "280px" }}>
                  <PlanCard
                    plan={plan}
                    features={features}
                    onEditCore={(p) => {
                      setEditingPlan({ ...p });
                      setShowPlanModal(true);
                    }}
                    onSyncFeatures={setSyncFeaturesPlan}
                    onSyncLimits={setSyncLimitsPlan}
                    onDelete={handleDeletePlan}
                  />
                </div>
              ))}
            </div>
          </BlockStack>
        </Box>
      </Card>

      <Card>
        <Box padding="500">
          <BlockStack gap="400">
            <div>
              <Text variant="headingLg" as="h3">Feature Comparison</Text>
              <Text variant="bodySm" tone="subdued">
                Every cell reads live off the same Sync Features/Sync Limits data above — edit a
                toggle there and this table (and the merchant pricing page) updates immediately.
              </Text>
            </div>
            <DataTable
              columnContentTypes={["text", "text", "text", "text"]}
              headings={["Feature", ...planLabels]}
              rows={comparisonRows.map((row) => [
                `${row.number}. ${row.feature}`,
                ...row.cells.map((cell) => (
                  <InlineStack gap="150" blockAlign="center" wrap={false}>
                    <Badge tone={cell.icon === "yes" ? "success" : cell.icon === "partial" ? "attention" : undefined}>
                      {cell.icon === "yes" ? "✅" : cell.icon === "partial" ? "⚙️" : "❌"}
                    </Badge>
                    {cell.text && <Text as="span" variant="bodySm">{cell.text}</Text>}
                  </InlineStack>
                )),
              ])}
            />
          </BlockStack>
        </Box>
      </Card>

      {showPlanModal && editingPlan && (
        <EditPlanCoreModal
          open={showPlanModal}
          plan={editingPlan}
          onChange={setEditingPlan}
          onSave={handleSavePlan}
          onClose={() => setShowPlanModal(false)}
          saving={savingPlan}
        />
      )}

      {syncFeaturesPlan && (
        <SyncFeaturesModal
          open={!!syncFeaturesPlan}
          planKey={planFeatureBucket(syncFeaturesPlan.name)}
          planTitle={syncFeaturesPlan.title}
          features={features}
          onSync={handleFeatureBatchSync}
          onClose={() => setSyncFeaturesPlan(null)}
        />
      )}

      {syncLimitsPlan && (
        <SyncLimitsModal
          open={!!syncLimitsPlan}
          planKey={planFeatureBucket(syncLimitsPlan.name)}
          planTitle={syncLimitsPlan.title}
          features={features}
          onSync={handleFeatureBatchSync}
          onClose={() => setSyncLimitsPlan(null)}
        />
      )}

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
    </BlockStack>
  );
}

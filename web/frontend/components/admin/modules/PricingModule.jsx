import { useState, useEffect, useCallback } from "react";
import { Card, Box, Text, BlockStack, InlineStack, Banner, Divider, Button } from "@shopify/polaris";
import ConfirmActionModal from "../../ConfirmActionModal";
import PlanCard from "../PlanCard";
import EditPlanCoreModal from "../EditPlanCoreModal";
import SyncFeaturesModal from "../SyncFeaturesModal";
import SyncLimitsModal from "../SyncLimitsModal";
import { planFeatureBucket } from "../planLimitKeys";

const BLANK_PLAN = {
  name: "", title: "", price: "0.00", currency: "USD", interval: "EVERY_30_DAYS",
  trialDays: 0, description: "", isActive: true, sortOrder: 0,
};

/** Pricing & Billing — the card-per-plan Plans & Billing grid. */
export default function PricingModule({ active, adminFetch, showToast, setError }) {
  const [features, setFeatures] = useState([]);
  const [dynamicPlans, setDynamicPlans] = useState([]);

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

  const handleSavePlan = async () => {
    if (!editingPlan.name || !editingPlan.title) {
      setError("Name and Title are required.");
      return;
    }
    // A cleared price field (parseFloat("") => NaN) used to sail straight through to the backend
    // as JSON `null` on a non-nullable column, surfacing a raw Prisma error. Same story for a
    // negative price or trial length — nothing anywhere stopped either. Caught here, before the
    // request, on top of the matching backend guard in superAdmin.js (defense in depth: this modal
    // isn't the only possible caller of that route).
    const priceNum = Number(editingPlan.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError("Price must be a number of 0 or greater.");
      return;
    }
    const trialDaysNum = parseInt(editingPlan.trialDays, 10);
    if (editingPlan.trialDays !== "" && editingPlan.trialDays != null && (!Number.isFinite(trialDaysNum) || trialDaysNum < 0)) {
      setError("Trial period must be 0 or more days.");
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
        price: priceNum,
        trialDays: Number.isFinite(trialDaysNum) ? trialDaysNum : 0,
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
              <Button variant="primary" onClick={() => { setEditingPlan(BLANK_PLAN); setShowPlanModal(true); }}>
                Add Billing Plan
              </Button>
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

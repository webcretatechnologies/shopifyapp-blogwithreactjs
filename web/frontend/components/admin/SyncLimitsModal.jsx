import { useState, useEffect } from "react";
import { Modal, Text, BlockStack, FormLayout, TextField } from "@shopify/polaris";
import { isLimitKey } from "./planLimitKeys";

// Human-readable label per numeric-limit featureKey — falls back to the raw key for anything not
// listed here, so a future limit key still renders (just unlabeled) instead of breaking.
const LIMIT_KEY_LABELS = {
  article_limit: "Article Limit",
  template_limit: "Saved Template Limit",
  ai_credits: "AI Generations (lifetime)",
};

/**
 * Numeric usage caps for one plan (article_limit and template_limit — the enforced caps in the
 * app) — the "Sync Limits" action on a plan card. Plain labeled number fields with one
 * batch "Sync Limits" action, same posture as Sync Features. Same underlying PlanFeature rows/
 * API, just the numeric-limit partition instead of the boolean-toggle one — `enabled` isn't
 * exposed here since a limit row is always active; "unlimited" is already expressed by leaving
 * the field blank.
 */
export default function SyncLimitsModal({ open, planKey, planTitle, features, onSync, onClose }) {
  const rows = features.filter((f) => f.plan === planKey && isLimitKey(f.featureKey));
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(Object.fromEntries(rows.map((f) => [f.id, f.limit === null ? "" : String(f.limit)])));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planKey]);

  const handleSync = async () => {
    const changed = rows.filter((f) => {
      const draftVal = draft[f.id] ?? "";
      const currentVal = f.limit === null ? "" : String(f.limit);
      return draftVal !== currentVal;
    });
    if (changed.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSync(changed.map((f) => ({
        id: f.id,
        enabled: f.enabled,
        limit: draft[f.id].trim() === "" ? null : parseInt(draft[f.id], 10),
      })));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Sync Limits: ${planTitle}`}
      primaryAction={{ content: "Sync Limits", onAction: handleSync, loading: saving }}
      secondaryActions={[{ content: "Cancel", onAction: onClose, disabled: saving }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <Text tone="subdued" variant="bodySm">
            Set numeric caps for this plan (blank = unlimited). Changes apply instantly, including
            to the merchant's billing page usage card and the saved-template gate.
          </Text>
          <FormLayout>
            {rows.map((f) => (
              <TextField
                key={f.id}
                label={LIMIT_KEY_LABELS[f.featureKey] || f.featureKey}
                placeholder="Unlimited"
                value={draft[f.id] ?? ""}
                onChange={(v) => setDraft((d) => ({ ...d, [f.id]: v }))}
                type="number"
                autoComplete="off"
              />
            ))}
          </FormLayout>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

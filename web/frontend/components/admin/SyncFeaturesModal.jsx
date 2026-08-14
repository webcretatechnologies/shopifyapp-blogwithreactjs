import { useState, useEffect } from "react";
import { Modal, Text, BlockStack, InlineGrid, Checkbox } from "@shopify/polaris";
import { isLimitKey } from "./planLimitKeys";

/**
 * Boolean block-feature toggles (heading, text, image, faq, product, hero, custom_css, ...) for
 * one plan — the "Sync Features" action on a plan card. A plain checkbox grid with one batch
 * "Sync Features" action, not a per-row Save — matches how this is edited everywhere else in the
 * admin (one commit per screen, not one per field). `features` is the full, unfiltered
 * PlanFeature list for every plan; this component does its own plan/key filtering so callers
 * don't need to precompute it.
 */
export default function SyncFeaturesModal({ open, planKey, planTitle, features, onSync, onClose }) {
  const rows = features.filter((f) => f.plan === planKey && !isLimitKey(f.featureKey));
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  // Re-seed the draft from the live rows every time the modal opens (not on every `features`
  // refetch) so mid-edit state survives the load() that follows an unrelated save elsewhere.
  useEffect(() => {
    if (open) setDraft(Object.fromEntries(rows.map((f) => [f.id, f.enabled])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planKey]);

  const handleSync = async () => {
    const changed = rows.filter((f) => draft[f.id] !== f.enabled);
    if (changed.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSync(changed.map((f) => ({ id: f.id, enabled: draft[f.id], limit: f.limit })));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Sync Features: ${planTitle}`}
      large
      primaryAction={{ content: "Sync Features", onAction: handleSync, loading: saving }}
      secondaryActions={[{ content: "Cancel", onAction: onClose, disabled: saving }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <Text tone="subdued" variant="bodySm">
            Enable or disable individual block types for this plan. Changes apply instantly across
            the app — no restart needed.
          </Text>
          <InlineGrid columns={2} gap="300">
            {rows.map((f) => (
              <Checkbox
                key={f.id}
                label={f.featureKey}
                checked={draft[f.id] ?? f.enabled}
                onChange={(v) => setDraft((d) => ({ ...d, [f.id]: v }))}
              />
            ))}
          </InlineGrid>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

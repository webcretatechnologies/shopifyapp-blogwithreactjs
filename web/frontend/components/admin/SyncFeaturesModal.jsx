import { useState, useEffect } from "react";
import { Modal, Text, BlockStack, InlineGrid, Checkbox } from "@shopify/polaris";
import { CUMULATIVE_TIER_BULLETS } from "./planLimitKeys";

/**
 * Boolean feature toggles for one plan — the "Sync Features" action on a plan card. Every plan's
 * modal shows the same universal feature list (CUMULATIVE_TIER_BULLETS, built from
 * PlanFeatureService.js's TIER_ROWS, deduped across tiers) — not just the bullets that originated
 * on that specific tier's own pricing card. This is deliberate: a feature's current tier is just
 * whatever its PlanFeature rows happen to say today, not a hardcoded ceiling, so an admin needs to
 * be able to add or remove *any* feature on *any* plan from here — e.g. moving "Multi Language
 * Translation" down from Pro to Starter just means checking its box on Starter's own modal. Also
 * not a dump of every raw PlanFeature row that exists in the DB — a pile of block-editor keys like
 * Countdown/Reviews/Announcement were never marketed on the pricing page and were never checked by
 * any gate; showing those was the original confusion this fixes. A bullet backed by more than one
 * underlying row (e.g. "Shopify Product Blocks" covers 6 block-type keys) is ONE checkbox that
 * toggles every row behind it together, matching how it's sold as one line item. A bullet with no
 * backing gate at all (e.g. "Drag & Drop Builder" — always on, nothing to toggle) renders as a
 * checked, disabled row so the full pricing list is still visible without pretending it's
 * editable. A plain checkbox grid with one batch "Sync Features" action, not a per-row Save —
 * matches how this is edited everywhere else in the admin. `features` is the full, unfiltered
 * PlanFeature list for every plan; this component does its own plan/key filtering so callers
 * don't need to precompute it.
 */
export default function SyncFeaturesModal({ open, planKey, planTitle, features, onSync, onClose }) {
  const bullets = CUMULATIVE_TIER_BULLETS[planKey] || [];
  const rowsByKey = Object.fromEntries(
    features.filter((f) => f.plan === planKey).map((f) => [f.featureKey, f])
  );

  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  // Draft is keyed by bullet index (not featureKey) since a bullet can cover several keys at
  // once — re-seeded from the live rows every time the modal opens (not on every `features`
  // refetch) so mid-edit state survives the load() that follows an unrelated save elsewhere.
  useEffect(() => {
    if (open) {
      setDraft(Object.fromEntries(
        bullets.map((b, i) => [i, b.keys.length === 0 ? true : (rowsByKey[b.keys[0]]?.enabled ?? false)])
      ));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planKey]);

  const handleSync = async () => {
    const changes = [];
    bullets.forEach((b, i) => {
      if (b.keys.length === 0) return; // no backing gate — nothing to write
      const newEnabled = draft[i];
      b.keys.forEach((key) => {
        const row = rowsByKey[key];
        if (row && row.enabled !== newEnabled) {
          changes.push({ id: row.id, enabled: newEnabled, limit: row.limit });
        }
      });
    });
    if (changes.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSync(changes);
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
            Every feature that exists across every plan — check or uncheck any of them to add or
            remove it from this specific plan, including moving a feature to a different tier than
            it's on today. Grayed-out items are always included at every tier and aren't
            individually toggleable. Changes apply instantly across the app — no restart needed.
          </Text>
          <InlineGrid columns={2} gap="300">
            {bullets.map((b, i) => (
              <Checkbox
                key={b.label}
                label={b.label}
                checked={draft[i] ?? (b.keys.length === 0)}
                disabled={b.keys.length === 0}
                onChange={(v) => setDraft((d) => ({ ...d, [i]: v }))}
              />
            ))}
          </InlineGrid>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

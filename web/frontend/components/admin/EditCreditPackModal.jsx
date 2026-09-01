import { Modal, FormLayout, TextField, Checkbox } from "@shopify/polaris";

/**
 * Add/Edit an AI credit pack (Super Admin's Pricing module). Mirrors EditPlanCoreModal's shape:
 * `pack` is the draft object, `onChange(updatedPack)` replaces it wholesale, `onSave` persists via
 * POST/PUT `/admin-api/ai-credit-packs[/:id]`.
 *
 * `key` is only editable when creating a new pack — once a pack exists, AiCreditPurchase rows can
 * already reference it by that key, so renaming it here would orphan their label (same reasoning
 * SubscriptionPlan's slug field documents for existing subscribers).
 */
export default function EditCreditPackModal({ open, pack, onChange, onSave, onClose, saving }) {
  if (!pack) return null;

  const set = (field) => (value) => onChange({ ...pack, [field]: value });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={pack.id ? `Edit Credit Pack: ${pack.credits} AI Credits` : "Add AI Credit Pack"}
      primaryAction={{ content: "Save Pack", onAction: onSave, loading: saving }}
      secondaryActions={[{ content: "Cancel", onAction: onClose, disabled: saving }]}
    >
      <Modal.Section>
        <FormLayout>
          <FormLayout.Group>
            <TextField
              label="Key (unique identifier)"
              value={pack.key}
              onChange={set("key")}
              autoComplete="off"
              disabled={!!pack.id}
              helpText={
                pack.id
                  ? "Can't be changed once purchases may reference it."
                  : "Lowercase, no spaces — e.g. 'small', 'medium', 'large'."
              }
            />
            <TextField
              label="Credits"
              value={String(pack.credits ?? "")}
              onChange={set("credits")}
              type="number"
              min={1}
              autoComplete="off"
              error={
                pack.credits === "" || pack.credits == null
                  ? "Credits are required"
                  : Number.isInteger(Number(pack.credits)) && Number(pack.credits) > 0
                    ? undefined
                    : "Must be a whole number greater than 0"
              }
            />
          </FormLayout.Group>
          <FormLayout.Group>
            <TextField
              label="Price"
              value={String(pack.price ?? "")}
              onChange={set("price")}
              type="number"
              min={0}
              step={0.01}
              autoComplete="off"
              prefix="$"
              error={
                pack.price === "" || pack.price == null
                  ? "Price is required"
                  : Number.isFinite(Number(pack.price)) && Number(pack.price) > 0
                    ? undefined
                    : "Price must be greater than 0"
              }
            />
            <TextField
              label="Sort Order"
              value={String(pack.sortOrder ?? 0)}
              onChange={(v) => onChange({ ...pack, sortOrder: parseInt(v, 10) || 0 })}
              type="number"
              autoComplete="off"
            />
          </FormLayout.Group>
          <FormLayout.Group>
            <Checkbox
              label="Best Value / Highlight Pack in UI"
              checked={!!pack.isRecommended}
              onChange={set("isRecommended")}
              helpText="Shows the “Best value” badge on the merchant billing page. Only one pack can be highlighted at a time — checking this un-checks it on every other pack."
            />
            <Checkbox
              label="Active (purchasable by merchants)"
              checked={pack.isActive}
              onChange={set("isActive")}
            />
          </FormLayout.Group>
        </FormLayout>
      </Modal.Section>
    </Modal>
  );
}

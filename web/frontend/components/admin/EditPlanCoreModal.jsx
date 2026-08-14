import { Modal, FormLayout, TextField, Checkbox } from "@shopify/polaris";

/**
 * "Edit Core" — the plan's own fields (name/title/price/currency/interval/trial/description/
 * active/sort order). Controlled by the parent: `plan` is the draft object, `onChange(updatedPlan)`
 * replaces it wholesale (same shape `setEditingPlan` used before this was extracted), `onSave`
 * persists via the existing POST/PUT `/admin-api/pricing/plans[/:id]` logic.
 *
 * The merchant-facing marketing "features" bullet list intentionally isn't editable here — it
 * lived in this same modal as a raw one-per-line textarea, easy to confuse with the separate
 * "Sync Features"/"Sync Limits" actions (which gate real functionality, not just copy). Existing
 * values are preserved untouched (the save payload omits `features` entirely); how that list gets
 * authored going forward is a follow-up, not part of this cleanup.
 */
export default function EditPlanCoreModal({ open, plan, onChange, onSave, onClose, saving }) {
  if (!plan) return null;

  const set = (field) => (value) => onChange({ ...plan, [field]: value });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={plan.id ? `Edit Billing Plan: ${plan.title || plan.name}` : "Add Billing Plan"}
      primaryAction={{ content: "Save Plan Settings", onAction: onSave, loading: saving }}
      secondaryActions={[{ content: "Cancel", onAction: onClose, disabled: saving }]}
    >
      <Modal.Section>
        <FormLayout>
          <FormLayout.Group>
            <TextField
              label="Plan Name"
              value={plan.title}
              onChange={set("title")}
              autoComplete="off"
              helpText="Merchant-facing display name, e.g. 'Starter'"
            />
            <TextField
              label="Slug (Unique GraphQL Identifier)"
              value={plan.name}
              onChange={set("name")}
              autoComplete="off"
              helpText="Must match Shopify's subscription name — also what Shop.planKey is set to"
            />
          </FormLayout.Group>
          <FormLayout.Group>
            <TextField
              label="Price (in USD)"
              value={String(plan.price)}
              onChange={set("price")}
              type="number"
              autoComplete="off"
              prefix="$"
            />
            <TextField
              label="Currency"
              value={plan.currency}
              onChange={set("currency")}
              autoComplete="off"
            />
          </FormLayout.Group>
          <FormLayout.Group>
            <TextField
              label="Billing Interval"
              value={plan.interval}
              onChange={set("interval")}
              autoComplete="off"
              helpText="EVERY_30_DAYS or ANNUAL"
            />
            <TextField
              label="Trial Period (Days)"
              value={String(plan.trialDays ?? 0)}
              onChange={set("trialDays")}
              type="number"
              autoComplete="off"
              helpText="0 = no free trial"
            />
          </FormLayout.Group>
          <TextField
            label="Sort Order"
            value={String(plan.sortOrder ?? 0)}
            onChange={(v) => onChange({ ...plan, sortOrder: parseInt(v, 10) || 0 })}
            type="number"
            autoComplete="off"
          />
          <TextField
            label="Description"
            value={plan.description || ""}
            onChange={set("description")}
            multiline={2}
            autoComplete="off"
          />
          <Checkbox label="Active (visible to merchants)" checked={plan.isActive} onChange={set("isActive")} />
        </FormLayout>
      </Modal.Section>
    </Modal>
  );
}

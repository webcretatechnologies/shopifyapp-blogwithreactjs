import { Modal, FormLayout, TextField, Select, Checkbox } from "@shopify/polaris";

const BILLING_INTERVAL_OPTIONS = [
  { label: "Every 30 Days", value: "EVERY_30_DAYS" },
  { label: "Annual", value: "ANNUAL" },
];

/**
 * "Edit Core" — the plan's own fields (name/title/price/interval/trial/description/active/sort
 * order). Controlled by the parent: `plan` is the draft object, `onChange(updatedPlan)` replaces
 * it wholesale (same shape `setEditingPlan` used before this was extracted), `onSave` persists via
 * the existing POST/PUT `/admin-api/pricing/plans[/:id]` logic.
 *
 * No currency field — every plan is USD-only by design (PricingModule.jsx's BLANK_PLAN already
 * defaults new plans to "USD", and the backend still accepts/stores whatever's on the plan
 * record), so there's nothing here for an admin to misconfigure. Billing Interval is a Select, not
 * free text — Shopify's appSubscriptionCreate only accepts exactly "EVERY_30_DAYS" or "ANNUAL"
 * (billing.js), and a typo'd interval would silently fail at real charge time with no validation
 * anywhere before that.
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
              helpText={
                plan.id && plan.subscriberCount > 0
                  ? `${plan.subscriberCount} store${plan.subscriberCount === 1 ? "" : "s"} already subscribed under the current slug — renaming it won't change their existing Shopify subscription name, which can affect plan-feature matching for them.`
                  : "Must match Shopify's subscription name — also what Shop.planKey is set to"
              }
            />
          </FormLayout.Group>
          <FormLayout.Group>
            <TextField
              label="Price (in USD)"
              value={String(plan.price)}
              onChange={set("price")}
              type="number"
              min={0}
              step={0.01}
              autoComplete="off"
              prefix="$"
              error={
                plan.price === "" || plan.price === null
                  ? "Price is required"
                  : Number.isFinite(Number(plan.price)) && Number(plan.price) >= 0
                    ? undefined
                    : "Price must be 0 or greater"
              }
            />
            <Select
              label="Billing Interval"
              options={BILLING_INTERVAL_OPTIONS}
              value={plan.interval}
              onChange={set("interval")}
            />
          </FormLayout.Group>
          <FormLayout.Group>
            <TextField
              label="Trial Period (Days)"
              value={String(plan.trialDays ?? 0)}
              onChange={set("trialDays")}
              type="number"
              min={0}
              autoComplete="off"
              helpText="0 = no free trial"
              error={Number(plan.trialDays) < 0 ? "Trial period can't be negative" : undefined}
            />
            <TextField
              label="Sort Order"
              value={String(plan.sortOrder ?? 0)}
              onChange={(v) => onChange({ ...plan, sortOrder: parseInt(v, 10) || 0 })}
              type="number"
              autoComplete="off"
            />
          </FormLayout.Group>
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

import { useState, useEffect, useCallback } from "react";
import {
  Card, Box, Text, BlockStack, InlineStack, Banner, Button, IndexTable, Badge,
  FormLayout, TextField, Select, Checkbox,
} from "@shopify/polaris";
import { Download, ArrowLeft } from "lucide-react";
import ConfirmActionModal from "../../ConfirmActionModal";
import { downloadAdminFile } from "../../../utils/adminApi";

const DownloadIcon = (props) => <Download size={16} {...props} />;

// A real "back" affordance for the Form/Usage sub-views — a round icon button + contextual
// title, the same shape Shopify's own nested admin pages use, so leaving a sub-view never
// depends on remembering the button-group exists.
function BackHeader({ title, onBack }) {
  return (
    <InlineStack gap="300" blockAlign="center">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to Coupons"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: "32px", height: "32px", borderRadius: "50%", border: "1px solid #c9cccf",
          background: "#fff", cursor: "pointer", padding: 0, flexShrink: 0,
        }}
      >
        <ArrowLeft size={16} />
      </button>
      <Text variant="headingLg" as="h3">{title}</Text>
    </InlineStack>
  );
}

const BLANK_COUPON = {
  code: "", discountType: "PERCENTAGE", percentOff: "10", amountOff: "",
  durationMonths: "1", description: "", active: true, startsAt: "", endsAt: "",
  totalUses: "", usesPerStore: "1", appliesTo: "ALL_PAID_PLANS", planIds: [], shopDomains: [],
};

function couponDiscountLabel(coupon) {
  return coupon.discountType === "PERCENTAGE"
    ? `${Number(coupon.percentOff)}% off`
    : `$${Number(coupon.amountOff).toFixed(2)} off`;
}

function appliesToLabel(coupon) {
  if (coupon.appliesTo === "SPECIFIC_PLANS") {
    return { primary: "Selected plans", secondary: `${coupon.plans?.length || 0} plan apply` };
  }
  if (coupon.appliesTo === "SPECIFIC_STORES") {
    return { primary: "Selected stores", secondary: `${coupon.shops?.length || 0} store apply` };
  }
  return { primary: "All paid plans", secondary: null };
}

function claimWindowLabel(coupon) {
  if (!coupon.startsAt && !coupon.endsAt) return "Always open";
  const fmt = (d) => new Date(d).toLocaleDateString();
  if (coupon.startsAt && coupon.endsAt) return `${fmt(coupon.startsAt)} – ${fmt(coupon.endsAt)}`;
  if (coupon.startsAt) return `From ${fmt(coupon.startsAt)}`;
  return `Until ${fmt(coupon.endsAt)}`;
}

const STATUS_BADGE_TONE = { APPROVED: "success", PENDING: "attention", DECLINED: "critical", CANCELLED: "critical", EXPIRED: undefined };

// A real pill switch, not a text button — plain <button>/<span> (not a block <div>) so it sits
// inline at the table row's natural height instead of stretching the row and colliding with the
// sticky header above it.
function StatusToggle({ active, onToggle }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      style={{
        display: "inline-flex", alignItems: "center", gap: "8px",
        border: "none", background: "transparent", cursor: "pointer", padding: 0, margin: 0,
      }}
    >
      <span
        style={{
          display: "inline-block", width: "36px", height: "20px", borderRadius: "999px",
          background: active ? "#008060" : "#c9cccf", position: "relative",
          transition: "background 0.15s ease", flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute", top: "2px", left: active ? "18px" : "2px",
            width: "16px", height: "16px", borderRadius: "50%", background: "#fff",
            transition: "left 0.15s ease", boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
          }}
        />
      </span>
      <Text as="span" variant="bodySm" fontWeight="medium" tone={active ? "success" : "subdued"}>
        {active ? "Active" : "Inactive"}
      </Text>
    </button>
  );
}

/** Billing Coupons — SaaS subscription discount codes, applied via the real Shopify Billing API. */
export default function CouponsModule({ active, token, adminFetch, showToast, setError }) {
  const [view, setView] = useState("list"); // "list" | "form" | "usage"

  const [coupons, setCoupons] = useState([]);
  const [plans, setPlans] = useState([]);
  const [stores, setStores] = useState([]);

  const [editingCoupon, setEditingCoupon] = useState(null);
  const [saving, setSaving] = useState(false);

  const [usageRows, setUsageRows] = useState([]);
  const [usageKpis, setUsageKpis] = useState(null);
  const [usageFilters, setUsageFilters] = useState({ from: "", to: "", couponId: "", status: "", search: "" });
  const [usageLoading, setUsageLoading] = useState(false);

  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const couponsData = await adminFetch("/admin-api/coupons");
      setCoupons(couponsData.coupons || []);
      const plansData = await adminFetch("/admin-api/pricing/plans");
      setPlans(plansData.plans || []);
      // Only currently-installed stores are worth offering a coupon to — a dropped store can't
      // claim anything anyway.
      const storesData = await adminFetch("/admin-api/stores?statusFilter=active&limit=500&sortBy=domain&sortDir=asc");
      setStores(storesData.stores || []);
    } catch (err) {
      setError(err.message);
    }
  }, [adminFetch, setError]);

  useEffect(() => {
    if (active) load();
  }, [active, load]);

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(usageFilters).forEach(([k, v]) => { if (v) params.set(k, v); });
      const data = await adminFetch(`/admin-api/coupons/usage?${params.toString()}`);
      setUsageRows(data.rows || []);
      setUsageKpis(data.kpis || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setUsageLoading(false);
    }
  }, [adminFetch, setError, usageFilters]);

  useEffect(() => {
    if (active && view === "usage") loadUsage();
  }, [active, view, loadUsage]);

  const openNewCoupon = () => {
    setEditingCoupon({ ...BLANK_COUPON });
    setView("form");
  };

  const openEditCoupon = (coupon) => {
    setEditingCoupon({
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      percentOff: coupon.percentOff !== null ? String(coupon.percentOff) : "",
      amountOff: coupon.amountOff !== null ? String(coupon.amountOff) : "",
      durationMonths: String(coupon.durationMonths),
      description: coupon.description || "",
      active: coupon.active,
      startsAt: coupon.startsAt ? coupon.startsAt.slice(0, 10) : "",
      endsAt: coupon.endsAt ? coupon.endsAt.slice(0, 10) : "",
      totalUses: coupon.totalUses !== null ? String(coupon.totalUses) : "",
      usesPerStore: String(coupon.usesPerStore),
      appliesTo: coupon.appliesTo,
      planIds: (coupon.plans || []).map((cp) => cp.planId),
      shopDomains: (coupon.shops || []).map((s) => s.shopDomain),
      claimCount: coupon._count?.claims ?? 0,
    });
    setView("form");
  };

  const openUsageForCoupon = (coupon) => {
    setUsageFilters({ from: "", to: "", couponId: String(coupon.id), status: "", search: "" });
    setView("usage");
  };

  const handleSaveCoupon = async () => {
    if (!editingCoupon.code.trim()) {
      setError("Coupon code is required.");
      return;
    }
    setSaving(true);
    try {
      const isNew = !editingCoupon.id;
      const url = isNew ? "/admin-api/coupons" : `/admin-api/coupons/${editingCoupon.id}`;
      const method = isNew ? "POST" : "PUT";
      await adminFetch(url, { method, body: JSON.stringify(editingCoupon) });
      showToast(`Coupon ${isNew ? "created" : "updated"} successfully`);
      setView("list");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (coupon) => {
    try {
      await adminFetch(`/admin-api/coupons/${coupon.id}/toggle`, { method: "POST" });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteCoupon = (coupon) => {
    const usesNote = coupon._count?.claims > 0
      ? ` This coupon has been claimed ${coupon._count.claims} time${coupon._count.claims === 1 ? "" : "s"} — those merchants keep their existing discount; this only stops new claims.`
      : "";
    setConfirmAction({
      title: `Delete coupon "${coupon.code}"?`,
      body: `This action is irreversible.${usesNote}`,
      confirmText: "Delete coupon",
      confirmTone: "critical",
      onConfirm: async () => {
        await adminFetch(`/admin-api/coupons/${coupon.id}`, { method: "DELETE" });
        showToast("Coupon deleted successfully");
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

  const handleExportUsageCsv = () => {
    const params = new URLSearchParams();
    Object.entries(usageFilters).forEach(([k, v]) => { if (v) params.set(k, v); });
    downloadAdminFile(token, `/admin-api/coupons/usage/export?${params.toString()}`, `coupon-usage-${Date.now()}.csv`)
      .catch((err) => setError(err.message));
  };

  if (!active) return null;

  const set = (field) => (value) => setEditingCoupon({ ...editingCoupon, [field]: value });

  const navButtons = (
    <InlineStack gap="200">
      <Button variant={view === "list" ? "primary" : "secondary"} onClick={() => setView("list")}>Coupons</Button>
      <Button
        variant={view === "usage" ? "primary" : "secondary"}
        onClick={() => { setUsageFilters({ from: "", to: "", couponId: "", status: "", search: "" }); setView("usage"); }}
      >
        Coupon Usage
      </Button>
      <Button variant={view === "form" ? "primary" : "secondary"} onClick={openNewCoupon}>Add New Coupon</Button>
    </InlineStack>
  );

  // ─── List view ────────────────────────────────────────────────────────────
  if (view === "list") {
    const rowMarkup = coupons.map((coupon, index) => {
      const applies = appliesToLabel(coupon);
      return (
        <IndexTable.Row id={String(coupon.id)} key={coupon.id} position={index}>
          <IndexTable.Cell>
            <BlockStack gap="050">
              <Text as="span" fontWeight="semibold">{coupon.code}</Text>
              {coupon.description && (
                <Text as="span" variant="bodySm" tone="subdued">{coupon.description}</Text>
              )}
            </BlockStack>
          </IndexTable.Cell>
          <IndexTable.Cell>{couponDiscountLabel(coupon)}</IndexTable.Cell>
          <IndexTable.Cell>
            <BlockStack gap="050">
              <Text as="span" variant="bodySm">{applies.primary}</Text>
              {applies.secondary && <Text as="span" variant="bodySm" tone="subdued">{applies.secondary}</Text>}
            </BlockStack>
          </IndexTable.Cell>
          <IndexTable.Cell>{coupon.durationMonths} months</IndexTable.Cell>
          <IndexTable.Cell>{claimWindowLabel(coupon)}</IndexTable.Cell>
          <IndexTable.Cell>
            <BlockStack gap="050">
              <Text as="span" variant="bodySm">
                {coupon._count?.claims ?? 0}{coupon.totalUses !== null ? ` / ${coupon.totalUses}` : ""}
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">{coupon.usesPerStore} per store</Text>
            </BlockStack>
          </IndexTable.Cell>
          <IndexTable.Cell>
            <StatusToggle active={coupon.active} onToggle={() => handleToggleActive(coupon)} />
          </IndexTable.Cell>
          <IndexTable.Cell>
            <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>
              <InlineStack gap="200">
                <Button size="slim" onClick={() => openEditCoupon(coupon)}>Edit</Button>
                <Button size="slim" onClick={() => openUsageForCoupon(coupon)}>Usage</Button>
                <Button size="slim" tone="critical" onClick={() => handleDeleteCoupon(coupon)}>Delete</Button>
              </InlineStack>
            </span>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    });

    return (
      <BlockStack gap="500">
        <InlineStack align="space-between" alignY="center">
          <Text variant="headingLg" as="h3">Coupons</Text>
          {navButtons}
        </InlineStack>

        <Card>
          <Box padding="500">
            <BlockStack gap="400">
              <Banner tone="info" title="How coupons work">
                <Text as="p" variant="bodySm">
                  A merchant enters the code on the plans page. The discount is sent to Shopify
                  with the subscription, so it appears on their real invoice and reverts to full
                  price automatically once the duration ends. A coupon only applies at the moment
                  a plan is purchased — it cannot be added to a subscription that already exists,
                  and the claim window / usage limits stop new claims only, never a discount
                  already running.
                </Text>
              </Banner>

              {coupons.length === 0 ? (
                <Text as="p" tone="subdued">No coupons yet.</Text>
              ) : (
                <IndexTable
                  itemCount={coupons.length}
                  headings={[
                    { title: "Code" }, { title: "Discount" }, { title: "Applies To" },
                    { title: "Duration" }, { title: "Claim Window" }, { title: "Used / Limits" },
                    { title: "Status" }, { title: "Action" },
                  ]}
                  selectable={false}
                >
                  {rowMarkup}
                </IndexTable>
              )}
            </BlockStack>
          </Box>
        </Card>

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

  // ─── Add/Edit coupon form view ────────────────────────────────────────────
  if (view === "form" && editingCoupon) {
    return (
      <BlockStack gap="500">
        <BackHeader
          title={editingCoupon.id ? `Edit coupon: ${editingCoupon.code || ""}` : "Create coupon"}
          onBack={() => setView("list")}
        />

        <Card>
          <Box padding="500">
            <BlockStack gap="400">
              <Text variant="headingMd" as="h3">Coupon Details</Text>
              <FormLayout>
                <FormLayout.Group>
                  <TextField
                    label="Coupon Code"
                    value={editingCoupon.code}
                    onChange={(v) => set("code")(v.toUpperCase())}
                    placeholder="FLAT10"
                    autoComplete="off"
                    helpText="Letters, numbers, dash and underscore only. Always stored uppercase — merchants can type it in any case."
                  />
                  <Select
                    label="Discount Type"
                    value={editingCoupon.discountType}
                    onChange={set("discountType")}
                    options={[
                      { label: "Percentage (%)", value: "PERCENTAGE" },
                      { label: "Fixed amount ($)", value: "FIXED_AMOUNT" },
                    ]}
                    helpText="Percentage scales with the plan price. Fixed amount takes a flat sum off every billing cycle."
                  />
                  {editingCoupon.discountType === "PERCENTAGE" ? (
                    <TextField
                      label="Value"
                      value={editingCoupon.percentOff}
                      onChange={set("percentOff")}
                      type="number"
                      suffix="%"
                      autoComplete="off"
                      helpText="Capped at 99% — Shopify rejects a $0 subscription."
                    />
                  ) : (
                    <TextField
                      label="Value"
                      value={editingCoupon.amountOff}
                      onChange={set("amountOff")}
                      type="number"
                      prefix="$"
                      autoComplete="off"
                      helpText="Amount off each billing cycle, in the plan's own currency."
                    />
                  )}
                </FormLayout.Group>
                <FormLayout.Group>
                  <TextField
                    label="Duration (months)"
                    value={editingCoupon.durationMonths}
                    onChange={set("durationMonths")}
                    type="number"
                    autoComplete="off"
                    helpText="How long the discount lasts once claimed. Shopify enforces it and reverts to full price on its own. Converted per cycle: 12 months = 12 monthly charges, or 1 yearly charge."
                  />
                  <TextField
                    label="Description"
                    value={editingCoupon.description}
                    onChange={set("description")}
                    placeholder="Internal note, e.g. Winback offer for churned stores"
                    autoComplete="off"
                    helpText="Shown in this list and to the merchant when the code is applied."
                  />
                </FormLayout.Group>
                <Checkbox
                  label="Active"
                  checked={editingCoupon.active}
                  onChange={set("active")}
                  helpText="Turn off to stop merchants claiming this code. Stores already on a discounted subscription keep their discount."
                />
              </FormLayout>
            </BlockStack>
          </Box>
        </Card>

        <Card>
          <Box padding="500">
            <BlockStack gap="400">
              <Text variant="headingMd" as="h3">Availability & Limits</Text>
              <Banner tone="warning" title="These only stop new claims">
                <Text as="p" variant="bodySm">
                  A store that claimed in time keeps its discount for the full duration set above
                  — Shopify owns that clock once the subscription exists, so an end date or a
                  filled limit only stops <strong>new</strong> claims, never a discount already
                  running.
                </Text>
              </Banner>
              <FormLayout>
                <FormLayout.Group>
                  <TextField
                    label="Start date"
                    value={editingCoupon.startsAt}
                    onChange={set("startsAt")}
                    type="date"
                    autoComplete="off"
                    helpText="Claimable from this date. Blank = immediately."
                  />
                  <TextField
                    label="End date"
                    value={editingCoupon.endsAt}
                    onChange={set("endsAt")}
                    type="date"
                    autoComplete="off"
                    helpText="Last day it can be claimed (inclusive). Blank = never expires."
                  />
                  <TextField
                    label="Total uses"
                    value={editingCoupon.totalUses}
                    onChange={set("totalUses")}
                    type="number"
                    placeholder="Unlimited"
                    autoComplete="off"
                    helpText="Across all stores, e.g. first 50 claims. Blank = unlimited."
                  />
                  <TextField
                    label="Uses per store"
                    value={editingCoupon.usesPerStore}
                    onChange={set("usesPerStore")}
                    type="number"
                    autoComplete="off"
                    helpText="How many times one store may claim this code. Counts approved charges only, so an abandoned checkout does not burn a use."
                  />
                </FormLayout.Group>
              </FormLayout>
              {editingCoupon.id && (
                <Text as="p" variant="bodySm">Claimed {editingCoupon.claimCount ?? 0} time(s)</Text>
              )}
            </BlockStack>
          </Box>
        </Card>

        <Card>
          <Box padding="500">
            <BlockStack gap="400">
              <Text variant="headingMd" as="h3">Plan Availability</Text>
              <Select
                label="Applies To"
                value={editingCoupon.appliesTo}
                onChange={set("appliesTo")}
                options={[
                  { label: "All paid plans", value: "ALL_PAID_PLANS" },
                  { label: "Specific plans only", value: "SPECIFIC_PLANS" },
                  { label: "Specific stores only", value: "SPECIFIC_STORES" },
                ]}
                helpText="Restrict by plan (e.g. only the Growth plan), or by store (e.g. a private offer for a hand-picked list of merchants) — not both at once."
              />
              <Text as="p" variant="bodySm" tone="subdued">The Free plan never accepts a coupon.</Text>

              {editingCoupon.appliesTo === "SPECIFIC_PLANS" && (
                <InlineStack gap="300" wrap>
                  {plans.map((p) => {
                    const checked = editingCoupon.planIds.includes(p.id);
                    return (
                      <div
                        key={p.id}
                        style={{
                          border: "1px solid #e1e3e5", borderRadius: "8px", padding: "12px 16px",
                          minWidth: "220px", cursor: "pointer",
                          background: checked ? "#f1f8f5" : "transparent",
                        }}
                        onClick={() => {
                          const planIds = checked
                            ? editingCoupon.planIds.filter((id) => id !== p.id)
                            : [...editingCoupon.planIds, p.id];
                          set("planIds")(planIds);
                        }}
                      >
                        <InlineStack gap="200" blockAlign="center">
                          <Checkbox checked={checked} onChange={() => {}} />
                          <BlockStack gap="0">
                            <InlineStack gap="150" blockAlign="center">
                              <Text as="span" fontWeight="semibold">{p.title}</Text>
                              <Badge>{p.name}</Badge>
                            </InlineStack>
                            <Text as="span" variant="bodySm" tone="subdued">
                              ${Number(p.price).toFixed(2)}/mo
                            </Text>
                          </BlockStack>
                        </InlineStack>
                      </div>
                    );
                  })}
                </InlineStack>
              )}

              {editingCoupon.appliesTo === "SPECIFIC_STORES" && (
                <BlockStack gap="200">
                  <Text as="span" variant="bodyMd" fontWeight="medium">Eligible stores</Text>
                  {stores.length === 0 ? (
                    <Text as="p" tone="subdued">No installed stores found.</Text>
                  ) : (
                    <div style={{ maxHeight: "320px", overflowY: "auto", border: "1px solid #e1e3e5", borderRadius: "8px" }}>
                      {stores.map((s) => {
                        const checked = editingCoupon.shopDomains.includes(s.domain);
                        return (
                          <div
                            key={s.domain}
                            style={{
                              display: "flex", alignItems: "center", gap: "12px",
                              padding: "10px 16px", cursor: "pointer",
                              borderBottom: "1px solid #f1f2f4",
                              background: checked ? "#f1f8f5" : "transparent",
                            }}
                            onClick={() => {
                              const shopDomains = checked
                                ? editingCoupon.shopDomains.filter((d) => d !== s.domain)
                                : [...editingCoupon.shopDomains, s.domain];
                              set("shopDomains")(shopDomains);
                            }}
                          >
                            <Checkbox checked={checked} onChange={() => {}} />
                            <BlockStack gap="0">
                              <Text as="span" fontWeight="medium">{s.domain}</Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                {s.email}{s.planKey ? ` · ${s.planKey}` : ""}
                              </Text>
                            </BlockStack>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <Text as="p" variant="bodySm" tone="subdued">
                    {editingCoupon.shopDomains.length} of {stores.length} stores selected
                  </Text>
                </BlockStack>
              )}
            </BlockStack>
          </Box>
        </Card>

        <InlineStack align="end" gap="200">
          <Button onClick={() => setView("list")} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={handleSaveCoupon} loading={saving}>Save</Button>
        </InlineStack>
      </BlockStack>
    );
  }

  // ─── Coupon usage analytics view ─────────────────────────────────────────
  if (view === "usage") {
    const kpiCards = [
      { label: "Claims", value: usageKpis?.claims ?? 0, help: "Approved charges" },
      { label: "Stores", value: usageKpis?.stores ?? 0, help: "Distinct stores" },
      { label: "Active discounts", value: usageKpis?.activeDiscounts ?? 0, help: "Still discounted" },
      { label: "Discount / month", value: `$${(usageKpis?.discountPerMonth ?? 0).toFixed(2)}`, help: "Current run rate" },
      { label: "Committed discount", value: `$${(usageKpis?.committedDiscount ?? 0).toFixed(2)}`, help: "Full term, all claims" },
    ];

    const usageRowMarkup = usageRows.map((row, index) => (
      <IndexTable.Row id={String(row.id)} key={row.id} position={index}>
        <IndexTable.Cell>{new Date(row.claimedAt).toLocaleDateString()}</IndexTable.Cell>
        <IndexTable.Cell><Text as="span" fontWeight="semibold">{row.couponCode}</Text></IndexTable.Cell>
        <IndexTable.Cell>{row.shopDomain}</IndexTable.Cell>
        <IndexTable.Cell>{row.planTier}</IndexTable.Cell>
        <IndexTable.Cell>{row.cycle}</IndexTable.Cell>
        <IndexTable.Cell>${row.price.toFixed(2)}</IndexTable.Cell>
        <IndexTable.Cell>${row.saving.toFixed(2)}</IndexTable.Cell>
        <IndexTable.Cell>{row.cycles}</IndexTable.Cell>
        <IndexTable.Cell>${row.total.toFixed(2)}</IndexTable.Cell>
        <IndexTable.Cell>{new Date(row.fullPriceFrom).toLocaleDateString()}</IndexTable.Cell>
        <IndexTable.Cell><Badge tone={STATUS_BADGE_TONE[row.status]}>{row.status}</Badge></IndexTable.Cell>
      </IndexTable.Row>
    ));

    const filteredCoupon = coupons.find((c) => String(c.id) === usageFilters.couponId);

    return (
      <BlockStack gap="500">
        <InlineStack align="space-between" alignY="center">
          <BackHeader
            title={filteredCoupon ? `Coupon Usage: ${filteredCoupon.code}` : "Coupon Usage"}
            onBack={() => setView("list")}
          />
          <Button variant="primary" onClick={openNewCoupon}>Add New Coupon</Button>
        </InlineStack>

        <Banner tone="info" title="How these numbers work">
          <Text as="p" variant="bodySm">
            Every row is one coupon claim. Totals count <strong>approved charges only</strong> — a
            checkout that was opened but never approved costs nothing, so it's listed but never
            counted. Discount / month is what the discounts still running are costing right now (a
            yearly discount counts as one twelfth per month). <strong>Committed discount</strong> is
            the full amount every claim will give away across its whole term, including cycles not
            yet billed. Figures come from the same calculation used to bill the store, so they
            match the merchant's invoice.
          </Text>
        </Banner>

        <InlineStack gap="400" wrap>
          {kpiCards.map((k) => (
            <div key={k.label} style={{ flex: "1 1 180px", minWidth: "160px" }}>
              <Card>
                <Box padding="400">
                  <BlockStack gap="150">
                    <Text as="span" variant="bodySm" tone="subdued">{k.label}</Text>
                    <Text as="span" variant="headingXl">{k.value}</Text>
                    <Text as="span" variant="bodySm" tone="subdued">{k.help}</Text>
                  </BlockStack>
                </Box>
              </Card>
            </div>
          ))}
        </InlineStack>

        <Card>
          <Box padding="500">
            <BlockStack gap="400">
              <InlineStack gap="300" wrap blockAlign="end">
                <TextField
                  label="From"
                  type="date"
                  value={usageFilters.from}
                  onChange={(v) => setUsageFilters({ ...usageFilters, from: v })}
                  autoComplete="off"
                />
                <TextField
                  label="To"
                  type="date"
                  value={usageFilters.to}
                  onChange={(v) => setUsageFilters({ ...usageFilters, to: v })}
                  autoComplete="off"
                />
                <Select
                  label="Coupon"
                  value={usageFilters.couponId}
                  onChange={(v) => setUsageFilters({ ...usageFilters, couponId: v })}
                  options={[{ label: "All coupons", value: "" }, ...coupons.map((c) => ({ label: c.code, value: String(c.id) }))]}
                />
                <Select
                  label="Status"
                  value={usageFilters.status}
                  onChange={(v) => setUsageFilters({ ...usageFilters, status: v })}
                  options={[
                    { label: "All statuses", value: "" },
                    { label: "Pending", value: "PENDING" },
                    { label: "Approved", value: "APPROVED" },
                    { label: "Declined", value: "DECLINED" },
                    { label: "Cancelled", value: "CANCELLED" },
                    { label: "Expired", value: "EXPIRED" },
                  ]}
                />
                <TextField
                  label="Search"
                  placeholder="Search store or code"
                  value={usageFilters.search}
                  onChange={(v) => setUsageFilters({ ...usageFilters, search: v })}
                  autoComplete="off"
                />
                <Button icon={DownloadIcon} onClick={handleExportUsageCsv}>Export CSV</Button>
              </InlineStack>

              {usageLoading ? (
                <Text as="p" tone="subdued">Loading…</Text>
              ) : usageRows.length === 0 ? (
                <Text as="p" tone="subdued">No claims match these filters.</Text>
              ) : (
                <>
                  <IndexTable
                    itemCount={usageRows.length}
                    headings={[
                      { title: "Claimed" }, { title: "Coupon" }, { title: "Store" }, { title: "Plan" },
                      { title: "Cycle" }, { title: "Price" }, { title: "Saving" }, { title: "Cycles" },
                      { title: "Total" }, { title: "Full Price From" }, { title: "Status" },
                    ]}
                    selectable={false}
                  >
                    {usageRowMarkup}
                  </IndexTable>
                  <Text as="p" variant="bodySm" tone="subdued">Showing {usageRows.length} of {usageRows.length} records</Text>
                </>
              )}
            </BlockStack>
          </Box>
        </Card>
      </BlockStack>
    );
  }

  return null;
}

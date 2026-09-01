import { useState, useEffect, useCallback } from "react";
import { Card, Box, Text, BlockStack, InlineStack, Banner, Button, IndexTable, Badge, Divider } from "@shopify/polaris";
import ConfirmActionModal from "../../ConfirmActionModal";
import EditCreditPackModal from "../EditCreditPackModal";

const BLANK_PACK = { key: "", credits: 10, price: "4.99", currency: "USD", isActive: true, isRecommended: false, sortOrder: 0 };

/**
 * AI Credit Packs — the one-time top-up packs merchants can buy on the Plans & Billing page
 * (frontend/pages/plans.jsx) when they want more AI credits without changing plans. Lives
 * inside PricingModule (same tab as SubscriptionPlan) since it's the other half of the same
 * "what merchants pay for" surface, rather than its own sidebar section.
 */
export default function AiCreditPacksSection({ adminFetch, showToast, setError }) {
  const [packs, setPacks] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [showPackModal, setShowPackModal] = useState(false);
  const [editingPack, setEditingPack] = useState(null);
  const [savingPack, setSavingPack] = useState(false);

  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await adminFetch("/admin-api/ai-credit-packs");
      setPacks(data.packs || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoaded(true);
    }
  }, [adminFetch, setError]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSavePack = async () => {
    if (!editingPack.key || !String(editingPack.key).trim()) {
      setError("Key is required.");
      return;
    }
    const creditsNum = parseInt(editingPack.credits, 10);
    if (!Number.isInteger(creditsNum) || creditsNum <= 0) {
      setError("Credits must be a whole number greater than 0.");
      return;
    }
    const priceNum = Number(editingPack.price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setError("Price must be a number greater than 0.");
      return;
    }
    setSavingPack(true);
    try {
      const isNew = !editingPack.id;
      const url = isNew ? "/admin-api/ai-credit-packs" : `/admin-api/ai-credit-packs/${editingPack.id}`;
      const method = isNew ? "POST" : "PUT";
      const payload = { ...editingPack, credits: creditsNum, price: priceNum };
      await adminFetch(url, { method, body: JSON.stringify(payload) });
      showToast(`Credit pack ${isNew ? "created" : "updated"} successfully`);
      setShowPackModal(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPack(false);
    }
  };

  const handleDeletePack = (pack) => {
    const usageNote = pack.purchaseCount > 0
      ? ` ${pack.purchaseCount} merchant purchase${pack.purchaseCount === 1 ? "" : "s"} already reference this pack — their purchase history is kept; this only stops it being offered to new buyers.`
      : "";
    setConfirmAction({
      title: `Delete "${pack.credits} AI Credits" pack?`,
      body: `This action is irreversible.${usageNote}`,
      confirmText: "Delete pack",
      confirmTone: "critical",
      onConfirm: async () => {
        await adminFetch(`/admin-api/ai-credit-packs/${pack.id}`, { method: "DELETE" });
        showToast("Credit pack deleted successfully");
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

  const rowMarkup = packs.map((pack, index) => (
    <IndexTable.Row id={String(pack.id)} key={pack.id} position={index}>
      <IndexTable.Cell>
        <Text as="span" fontWeight="semibold">{pack.credits} AI Credits</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodySm" tone="subdued">{pack.key}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>${Number(pack.price).toFixed(2)} {pack.currency}</IndexTable.Cell>
      <IndexTable.Cell>{pack.sortOrder}</IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodySm">
          {pack.purchaseCount} purchase{pack.purchaseCount === 1 ? "" : "s"}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="150">
          <Badge tone={pack.isActive ? "success" : undefined}>{pack.isActive ? "Active" : "Inactive"}</Badge>
          {pack.isRecommended && <Badge tone="attention">Best value</Badge>}
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex" }}>
          <InlineStack gap="200">
            <Button size="slim" onClick={() => { setEditingPack({ ...pack, price: String(pack.price) }); setShowPackModal(true); }}>
              Edit
            </Button>
            <Button size="slim" tone="critical" onClick={() => handleDeletePack(pack)}>Delete</Button>
          </InlineStack>
        </span>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Card>
      <Box padding="500">
        <BlockStack gap="400">
          <InlineStack align="space-between" alignY="center">
            <div>
              <Text variant="headingLg" as="h3">AI Credit Packs</Text>
              <Text variant="bodySm" tone="subdued">
                One-time top-up packs merchants can buy on the Plans &amp; Billing page when they
                need more AI credits without changing plans.
              </Text>
            </div>
            <Button
              variant="primary"
              onClick={() => { setEditingPack({ ...BLANK_PACK }); setShowPackModal(true); }}
            >
              Add Credit Pack
            </Button>
          </InlineStack>
          <Banner tone="info">
            <Text as="p" variant="bodySm">
              <strong>Live-synced with the merchant billing page.</strong> Editing a pack here
              updates <code>/plans</code> immediately. Deactivating a pack stops new purchases but
              never affects credits already bought.
            </Text>
          </Banner>
          <Divider />
          {loaded && packs.length === 0 ? (
            <Text as="p" tone="subdued">No credit packs yet.</Text>
          ) : (
            <IndexTable
              itemCount={packs.length}
              headings={[
                { title: "Pack" }, { title: "Key" }, { title: "Price" },
                { title: "Sort Order" }, { title: "Purchases" }, { title: "Status" }, { title: "Action" },
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
          )}
        </BlockStack>
      </Box>

      {showPackModal && editingPack && (
        <EditCreditPackModal
          open={showPackModal}
          pack={editingPack}
          onChange={setEditingPack}
          onSave={handleSavePack}
          onClose={() => setShowPackModal(false)}
          saving={savingPack}
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
    </Card>
  );
}

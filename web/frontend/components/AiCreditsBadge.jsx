import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Badge, Banner, BlockStack, Button, InlineGrid, InlineStack, Modal, Spinner, Text } from "@shopify/polaris";

function money(value, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(value));
  } catch {
    return `$${Number(value).toFixed(2)}`;
  }
}

/** Shared balance chip and fast path for buying one-time AI credit packs. */
export default function AiCreditsBadge() {
  const location = useLocation();
  const navigate = useNavigate();
  const [credits, setCredits] = useState(null);
  const [open, setOpen] = useState(false);
  const [packs, setPacks] = useState([]);
  const [loadingPacks, setLoadingPacks] = useState(false);
  const [purchasingPack, setPurchasingPack] = useState(null);
  const [purchaseError, setPurchaseError] = useState("");
  const [notification, setNotification] = useState(null);

  const loadCredits = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/credits");
      if (response.ok) setCredits(await response.json());
    } catch {
      // The balance chip is useful but must never block the current page.
    }
  }, []);

  const notify = useCallback((content, error = false) => {
    // App Bridge uses Shopify's native admin notification. Always retain the in-app notice too:
    // some live embedded-admin contexts can suppress or delay the App Bridge toast during the
    // top-level return redirect from Shopify's purchase approval page.
    setNotification({ content, error });
    if (window.shopify?.toast) window.shopify.toast.show(content, error ? { isError: true } : undefined);
  }, []);

  useEffect(() => {
    loadCredits();
  }, [loadCredits]);

  // Shopify's confirmation returns with this flag. Reconcile the real charge before reporting
  // success: returning from the confirmation page alone does not prove it was approved.
  useEffect(() => {
    if (new URLSearchParams(location.search).get("credits_purchased") !== "1") return undefined;

    // Do not remove the flag yet. Updating the route immediately unmounts this effect and marks
    // its in-flight reconciliation request as cancelled before it can show a result.
    const clearPurchaseReturnFlag = () => {
      const next = new URLSearchParams(location.search);
      next.delete("credits_purchased");
      navigate(
        { pathname: location.pathname, search: next.toString() ? `?${next.toString()}` : "" },
        { replace: true },
      );
    };

    let cancelled = false;
    let timeout;
    const checkOutcome = async (attempt = 0) => {
      try {
        const response = await fetch("/api/ai/credit-packs/latest-purchase");
        const data = await response.json();
        const purchase = data.purchase;
        if (cancelled) return;

        if (purchase?.status === "APPROVED") {
          notify(`🎉 ${purchase.credits} AI credits added to your account`);
          loadCredits();
          clearPurchaseReturnFlag();
          return;
        }
        if (["DECLINED", "CANCELLED", "EXPIRED"].includes(purchase?.status)) {
          notify("Your AI credit purchase wasn't completed — no charge was made.", true);
          clearPurchaseReturnFlag();
          return;
        }
        if (attempt < 8) timeout = window.setTimeout(() => checkOutcome(attempt + 1), 3000);
        else {
          notify("Your purchase is still processing — credits will appear once Shopify confirms it.");
          clearPurchaseReturnFlag();
        }
      } catch {
        if (!cancelled) {
          notify("We couldn't confirm your AI credit purchase yet. Please refresh shortly.", true);
          clearPurchaseReturnFlag();
        }
      }
    };

    checkOutcome();
    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
    };
  }, [loadCredits, location.pathname, location.search, navigate, notify]);

  const openPurchaseModal = async () => {
    setOpen(true);
    setPurchaseError("");
    setLoadingPacks(true);
    try {
      const response = await fetch("/api/ai/credit-packs");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't load credit packs.");
      setPacks(data.packs || []);
    } catch (error) {
      setPurchaseError(error.message || "Couldn't load credit packs.");
    } finally {
      setLoadingPacks(false);
    }
  };

  const buyPack = async (packKey) => {
    setPurchaseError("");
    setPurchasingPack(packKey);
    try {
      const host = new URLSearchParams(window.location.search).get("host");
      // The embedded `host` query can be very long and is added separately below. Returning to
      // the route itself preserves the merchant's screen without exceeding Shopify's 255-char
      // return-URL limit by accidentally including that host value twice.
      const returnPath = window.location.pathname;
      const response = await fetch("/api/ai/credit-packs/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packKey, host, returnPath }),
      });
      const data = await response.json();
      if (!response.ok || !data.confirmationUrl) throw new Error(data.error || "Failed to start purchase.");
      window.open(data.confirmationUrl, "_top");
    } catch (error) {
      setPurchaseError(error.message || "Failed to start purchase.");
      setPurchasingPack(null);
    }
  };

  const notificationMarkup = notification && (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 600, maxWidth: 440 }}>
      <Banner tone={notification.error ? "critical" : "success"} onDismiss={() => setNotification(null)}>{notification.content}</Banner>
    </div>
  );

  // An unlimited plan has no reason to buy a top-up, so do not add noise to its header. Preserve
  // a pending purchase result notice even if the balance request has not completed yet.
  if (!credits || credits.limit == null) return notificationMarkup || null;
  const atLimit = (credits.remaining ?? 0) <= 0;
  const smallestPack = packs.length
    ? packs.reduce((smallest, pack) => (Number(pack.credits) < Number(smallest.credits) ? pack : smallest), packs[0])
    : null;
  const baselinePricePerCredit = smallestPack ? Number(smallestPack.price) / Number(smallestPack.credits) : 0;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label="Buy more AI credits"
        onClick={openPurchaseModal}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPurchaseModal();
          }
        }}
        style={{ display: "inline-flex", cursor: "pointer", margin: "8px 16px 0" }}
      >
        <Badge tone={atLimit ? "critical" : undefined}>
          <InlineStack gap="100" blockAlign="center">
            <Text as="span">✨</Text>
            <Text as="span">{`${Math.max(0, credits.remaining ?? 0)} AI credit${credits.remaining === 1 ? "" : "s"} left`}</Text>
          </InlineStack>
        </Badge>
      </div>

      <Modal open={open} onClose={() => !purchasingPack && setOpen(false)} title="Add AI credits" size="large">
        <Modal.Section>
          <BlockStack gap="500">
            <div
              style={{
                padding: "18px 20px",
                borderRadius: "var(--p-border-radius-300)",
                background: "linear-gradient(112deg, #f0fdf4 0%, #eff6ff 100%)",
                border: "1px solid #bbf7d0",
              }}
            >
              <InlineStack align="space-between" blockAlign="center" gap="400" wrap={false}>
                <BlockStack gap="100">
                  <Text as="h2" variant="headingLg">Keep your content momentum going</Text>
                  <Text as="p" tone="subdued">
                    Add credits whenever you need them. They never expire and are available after Shopify confirms payment.
                  </Text>
                </BlockStack>
                <div style={{ minWidth: 92, paddingLeft: 20, borderLeft: "1px solid #bbf7d0", textAlign: "right" }}>
                  <Text as="p" variant="headingLg">{Math.max(0, credits.remaining ?? 0)}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">available now</Text>
                </div>
              </InlineStack>
            </div>
            {purchaseError && <Banner tone="critical">{purchaseError}</Banner>}
            {loadingPacks ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}><Spinner size="small" /></div>
            ) : packs.length ? (
              <InlineGrid columns={{ xs: 1, sm: Math.min(packs.length, 3) }} gap="300">
                {packs.map((pack) => {
                  const pricePerCredit = Number(pack.price) / Number(pack.credits);
                  const savings = baselinePricePerCredit > 0
                    ? Math.max(0, Math.round((1 - pricePerCredit / baselinePricePerCredit) * 100))
                    : 0;
                  const isBestValue = Boolean(pack.isRecommended);
                  return (
                    <div
                      key={pack.key}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        minHeight: 244,
                        overflow: "hidden",
                        border: isBestValue ? "2px solid #008060" : "1px solid var(--p-color-border)",
                        borderRadius: "var(--p-border-radius-300)",
                        background: isBestValue ? "linear-gradient(180deg, #effcf6 0%, #ffffff 54%)" : "var(--p-color-bg-surface)",
                        boxShadow: isBestValue ? "0 8px 18px rgba(0, 128, 96, 0.12)" : "none",
                        boxSizing: "border-box",
                      }}
                    >
                      <div
                        style={{
                          height: 31,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: isBestValue ? "#008060" : "transparent",
                          color: "#fff",
                        }}
                      >
                        {isBestValue && <Text as="span" variant="bodySm" fontWeight="semibold">BEST VALUE</Text>}
                      </div>
                      <div style={{ display: "flex", flex: 1, flexDirection: "column", padding: "6px 14px 14px", textAlign: "center" }}>
                        <BlockStack gap="100" inlineAlign="center">
                          <Text as="p" variant="heading2xl">{pack.credits}</Text>
                          <Text as="p" tone="subdued">AI credits</Text>
                        </BlockStack>
                        <div style={{ minHeight: 28, display: "flex", justifyContent: "center", alignItems: "center", marginTop: 8 }}>
                          {savings > 0 ? <Badge tone="success">{`Save ${savings}% per credit`}</Badge> : <Text as="span" variant="bodySm" tone="subdued">Perfect for a quick boost</Text>}
                        </div>
                        <div style={{ marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--p-color-border-secondary)" }}>
                          <Text as="p" variant="headingMd">{money(pack.price, pack.currency)}</Text>
                          <Text as="p" variant="bodySm" tone="subdued">{`${money(pricePerCredit, pack.currency)} per credit`}</Text>
                        </div>
                        <div style={{ marginTop: "auto", paddingTop: 12 }}>
                          <Button variant="primary" fullWidth loading={purchasingPack === pack.key} disabled={purchasingPack !== null} onClick={() => buyPack(pack.key)}>
                            Choose this pack
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </InlineGrid>
            ) : <Banner tone="info">There are no AI credit packs available right now.</Banner>}
            {!loadingPacks && packs.length > 0 && (
              <div style={{ borderTop: "1px solid var(--p-color-border-secondary)", paddingTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 7 }}>
                  <span aria-hidden="true" style={{ color: "#008060", fontSize: 15, fontWeight: 700, lineHeight: 1 }}>✓</span>
                  <Text as="span" variant="bodySm" tone="subdued">Secure one-time Shopify charge · Credits never expire</Text>
                </div>
              </div>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {notificationMarkup}
    </>
  );
}

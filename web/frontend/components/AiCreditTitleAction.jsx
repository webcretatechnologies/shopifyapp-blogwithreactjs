import { useEffect, useState } from "react";

export const OPEN_AI_CREDIT_PURCHASE_EVENT = "blogger:open-ai-credit-purchase";
export const AI_CREDIT_BALANCE_UPDATED_EVENT = "blogger:ai-credit-balance-updated";

// A native App Bridge TitleBar action. The surrounding TitleBar promotes this plain button into
// Shopify Admin's header, where page-body Polaris components cannot render.
export default function AiCreditTitleAction() {
  const [credits, setCredits] = useState(null);

  const loadCredits = async () => {
    try {
      const response = await fetch("/api/ai/credits");
      if (response.ok) setCredits(await response.json());
    } catch {
      setCredits(null);
    }
  };

  useEffect(() => {
    loadCredits();
    window.addEventListener(AI_CREDIT_BALANCE_UPDATED_EVENT, loadCredits);
    return () => window.removeEventListener(AI_CREDIT_BALANCE_UPDATED_EVENT, loadCredits);
  }, []);

  if (!credits || credits.limit == null) return null;
  const remaining = Math.max(0, credits.remaining ?? 0);
  return (
    <button variant="secondary" onClick={() => window.dispatchEvent(new Event(OPEN_AI_CREDIT_PURCHASE_EVENT))}>
      {`✨ ${remaining} AI credit${remaining === 1 ? "" : "s"}`}
    </button>
  );
}

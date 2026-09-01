import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, InlineStack, Text } from "@shopify/polaris";

/**
 * A small, always-visible "N AI credits left" pill, mounted once in App.jsx so it renders above
 * every page rather than only on the Plans & Billing page — matches how competing apps (Bloggle's
 * "2 Dali credits" chip in their own top bar) keep the balance visible everywhere, not just on a
 * dedicated billing screen a merchant has to think to visit.
 *
 * Reads GET /api/ai/credits (the same lightweight endpoint CreateArticleWizard already polls for
 * its own gate) rather than /api/billing/check, since this only needs the credit figure, not the
 * whole plan/usage payload. Clicking it takes the merchant straight to /plans to buy more or
 * upgrade — the badge is a nudge, not just a readout.
 */
export default function AiCreditsBadge() {
  const navigate = useNavigate();
  const [credits, setCredits] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setCredits(data);
      })
      .catch(() => {
        if (!cancelled) setCredits(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing to show while loading, on a fetch failure, or once the plan is genuinely unlimited
  // (limit === null) — an "unlimited" badge would just be noise for those merchants.
  if (!credits || credits.limit == null) return null;

  const atLimit = (credits.remaining ?? 0) <= 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate("/plans")}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate("/plans");
        }
      }}
      style={{
        display: "inline-flex",
        cursor: "pointer",
        margin: "8px 16px 0",
      }}
    >
      <Badge tone={atLimit ? "critical" : undefined}>
        <InlineStack gap="100" blockAlign="center">
          <Text as="span">✨</Text>
          <Text as="span">
            {`${Math.max(0, credits.remaining ?? 0)} AI credit${credits.remaining === 1 ? "" : "s"} left`}
          </Text>
        </InlineStack>
      </Badge>
    </div>
  );
}

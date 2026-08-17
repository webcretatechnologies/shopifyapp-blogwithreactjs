import { Banner } from "@shopify/polaris";
import { useNavigate } from "react-router-dom";

/**
 * The single, shared "this needs a higher plan" treatment for every gated feature in the app.
 * A thin wrapper around Polaris's own `Banner` — nothing custom. Earlier versions of this
 * component tried to build a bespoke card (custom icon badges, hex-color gradients, then a
 * blurred-background overlay) and broke in a different way each time: wrong colors, cramped
 * layout, unreadable blur, overflow in narrow containers. Real Shopify Polaris apps solve
 * "you've hit a limit / this needs a higher plan" with a plain `Banner` — icon, bold title, body
 * text, one action button — and it's responsive at any width because Polaris already built and
 * tested it that way. No reason to reinvent it.
 *
 * The real content behind a gated feature is left visible-but-disabled below/around this banner
 * (matching how Shopify's own admin does it — existing items stay visible, only the blocked
 * action is disabled) rather than blurred — simpler, and it's what every real Polaris app does.
 *
 * `requiredPlan`: "Starter" | "Pro" — appended to the action button label. `title`/`description`
 * are the feature-specific copy (description is optional). `onUpgrade` overrides the default
 * (navigate to /plans).
 */
export default function UpgradePrompt({ requiredPlan = "Starter", title, description, onUpgrade }) {
  const navigate = useNavigate();
  const handleUpgrade = onUpgrade || (() => navigate("/plans"));

  return (
    <Banner
      tone="warning"
      title={title}
      action={{ content: `Upgrade to ${requiredPlan}`, onAction: handleUpgrade }}
    >
      {description}
    </Banner>
  );
}

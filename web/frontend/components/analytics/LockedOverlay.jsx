import { Button, Icon, Text, BlockStack } from "@shopify/polaris";
import { LockIcon } from "@shopify/polaris-icons";
import { useNavigate } from "react-router-dom";

/**
 * Wraps an already-fully-rendered section (real component, real layout, sample/placeholder data
 * from the backend) and blurs it behind a centered "Upgrade" card, instead of hiding the section
 * or replacing it with zeros. Keeps every plan's analytics page the same shape — cards don't
 * disappear, rows don't collapse, the "Upgrade" panel is a well-scoped visual layer.
 *
 * UpgradePrompt.jsx's own docblock notes an earlier attempt at a blurred-overlay treatment there
 * broke repeatedly (overflow in narrow containers, unreadable blur, wrong colors) — this is a
 * separate, narrowly-scoped component built specifically for analytics cards rather than reviving
 * that generic one, with explicit `overflow: hidden` on the positioning root and a solid
 * (non-blurred) overlay panel so none of those failure modes apply here: the blur only ever
 * applies to the `children` layer, never to the overlay card itself, and the wrapper's own
 * overflow:hidden keeps the blurred content from bleeding past its own rounded corners.
 */
export default function LockedOverlay({ locked, children, message = "Upgrade to Pro to unlock this data" }) {
  const navigate = useNavigate();

  if (!locked) return children;

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: "12px", height: "100%" }}>
      <div
        aria-hidden="true"
        style={{
          filter: "blur(5px)",
          WebkitFilter: "blur(5px)",
          pointerEvents: "none",
          userSelect: "none",
          height: "100%",
        }}
      >
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255, 255, 255, 0.35)",
          padding: "16px",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e1e3e5",
            borderRadius: "10px",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.12)",
            padding: "20px 24px",
            maxWidth: "280px",
            textAlign: "center",
          }}
        >
          <BlockStack gap="300" inlineAlign="center">
            <Icon source={LockIcon} tone="subdued" />
            <Text variant="bodySm" fontWeight="semibold" as="p">
              {message}
            </Text>
            <Button variant="primary" onClick={() => navigate("/plans")}>
              Upgrade to Pro
            </Button>
          </BlockStack>
        </div>
      </div>
    </div>
  );
}

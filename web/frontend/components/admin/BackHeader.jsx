import { InlineStack, Text } from "@shopify/polaris";
import { ArrowLeft } from "lucide-react";

// A real "back" affordance for list->detail sub-views — a round icon button + contextual title,
// the same shape Shopify's own nested admin pages use. Originally defined inline in
// CouponsModule.jsx; promoted here once Sync Health needed the identical pattern.
export default function BackHeader({ title, onBack }) {
  return (
    <InlineStack gap="300" blockAlign="center">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
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

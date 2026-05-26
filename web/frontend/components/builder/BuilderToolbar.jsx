/**
 * BuilderToolbar — Left sidebar listing all available block types.
 * Each block type card can be clicked to add it to the canvas.
 */
import { Text, BlockStack, Divider } from "@shopify/polaris";

const BLOCK_GROUPS = [
  {
    label: "Content",
    blocks: [
      { type: "heading", icon: "H", label: "Heading" },
      { type: "text", icon: "¶", label: "Rich Text" },
      { type: "image", icon: "🖼", label: "Image" },
      { type: "video", icon: "▶️", label: "Video Embed" },
      { type: "html", icon: "</>", label: "HTML Block" },
    ],
  },
  {
    label: "Commerce",
    blocks: [
      { type: "product", icon: "🛍", label: "Product Card" },
      { type: "product_slider", icon: "↔", label: "Product Slider" },
    ],
  },
  {
    label: "Layout",
    blocks: [
      { type: "cta_button", icon: "⬛", label: "CTA Button" },
      { type: "divider", icon: "─", label: "Divider" },
      { type: "spacer", icon: "⬜", label: "Spacer" },
    ],
  },
];

export default function BuilderToolbar({ onAddBlock }) {
  return (
    <div style={{
      width: "180px",
      flexShrink: 0,
      borderRight: "1px solid #e1e3e5",
      background: "#fff",
      padding: "12px 8px",
      overflow: "auto",
    }}>
      <div style={{ padding: "0 4px 8px" }}>
        <Text variant="headingSm">Blocks</Text>
        <Text variant="bodySm" tone="subdued">Click to add</Text>
      </div>

      {BLOCK_GROUPS.map((group) => (
        <div key={group.label} style={{ marginTop: "8px" }}>
          <div style={{ padding: "4px 4px 2px", marginBottom: "4px" }}>
            <Text variant="bodySm" tone="subdued" fontWeight="semibold">
              {group.label.toUpperCase()}
            </Text>
          </div>
          {group.blocks.map((block) => (
            <button
              key={block.type}
              type="button"
              onClick={() => onAddBlock(block.type)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                width: "100%",
                padding: "8px 8px",
                marginBottom: "2px",
                border: "1px solid transparent",
                borderRadius: "6px",
                background: "transparent",
                cursor: "pointer",
                fontSize: "13px",
                color: "#202223",
                textAlign: "left",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f1f2f3";
                e.currentTarget.style.borderColor = "#e1e3e5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "transparent";
              }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: "4px",
                background: "#f1f2f3",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "13px", fontWeight: "bold", color: "#6d7175",
                flexShrink: 0,
              }}>
                {block.icon}
              </span>
              <span>{block.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

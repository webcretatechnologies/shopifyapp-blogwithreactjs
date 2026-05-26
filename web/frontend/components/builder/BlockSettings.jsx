/**
 * BlockSettings — Right-panel settings inspector.
 * Renders controls specific to the selected block type.
 */
import { TextField, Select, Button, Text, BlockStack, InlineStack, Divider, Box } from "@shopify/polaris";

export default function BlockSettings({ block, onUpdate, onClose }) {
  const field = (key, label, helpText, type = "text") => (
    <TextField
      label={label}
      value={String(block[key] ?? "")}
      onChange={(v) => onUpdate({ [key]: v })}
      helpText={helpText}
      autoComplete="off"
      type={type}
    />
  );

  return (
    <div style={{ padding: "0" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #e1e3e5", background: "#f9fafb" }}>
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingSm">
            {block.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} Settings
          </Text>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "#6d7175" }}>✕</button>
        </InlineStack>
      </div>

      <div style={{ padding: "16px" }}>
        <BlockStack gap="400">
          {block.type === "heading" && (
            <>
              <TextField label="Heading Text" value={block.content || ""} onChange={(v) => onUpdate({ content: v })} multiline={2} autoComplete="off" />
              <Select
                label="Heading Level"
                options={[
                  { label: "H1 — Page Title", value: "h1" },
                  { label: "H2 — Section Title", value: "h2" },
                  { label: "H3 — Subsection", value: "h3" },
                ]}
                value={block.level || "h2"}
                onChange={(v) => onUpdate({ level: v })}
              />
              <Select
                label="Alignment"
                options={[
                  { label: "Left", value: "left" },
                  { label: "Center", value: "center" },
                  { label: "Right", value: "right" },
                ]}
                value={block.align || "left"}
                onChange={(v) => onUpdate({ align: v })}
              />
              <ColorField label="Text Color" value={block.color || "#202223"} onChange={(v) => onUpdate({ color: v })} />
            </>
          )}

          {block.type === "text" && (
            <TextField
              label="Rich Text Content (HTML)"
              value={block.content || ""}
              onChange={(v) => onUpdate({ content: v })}
              multiline={6}
              autoComplete="off"
              helpText="Paste or type HTML content. Use the WYSIWYG editor for rich formatting."
            />
          )}

          {block.type === "image" && (
            <>
              {field("src", "Image URL", "Paste a URL or upload via Shopify Files")}
              {field("alt", "Alt Text", "Describe the image for accessibility")}
              {field("caption", "Caption", "Optional caption shown below the image")}
              <Select
                label="Width"
                options={[
                  { label: "Full Width", value: "100%" },
                  { label: "Large (80%)", value: "80%" },
                  { label: "Medium (60%)", value: "60%" },
                  { label: "Small (40%)", value: "40%" },
                ]}
                value={block.width || "100%"}
                onChange={(v) => onUpdate({ width: v })}
              />
            </>
          )}

          {block.type === "video" && (
            <>
              {field("url", "Video URL", "YouTube or Vimeo URL")}
              {field("caption", "Caption", "Optional caption")}
            </>
          )}

          {block.type === "product" && (
            <>
              {field("title", "Product Title")}
              {field("shopifyProductId", "Shopify Product GID", "e.g. gid://shopify/Product/123456")}
              {field("image", "Product Image URL")}
              {field("price", "Price", "", "number")}
            </>
          )}

          {block.type === "product_slider" && (
            <>
              {field("title", "Slider Title", "Displayed above the product row")}
            </>
          )}

          {block.type === "cta_button" && (
            <>
              {field("text", "Button Text")}
              {field("url", "Link URL")}
              <Select
                label="Alignment"
                options={[
                  { label: "Left", value: "left" },
                  { label: "Center", value: "center" },
                  { label: "Right", value: "right" },
                ]}
                value={block.align || "center"}
                onChange={(v) => onUpdate({ align: v })}
              />
              <ColorField label="Button Color" value={block.color || "#008060"} onChange={(v) => onUpdate({ color: v })} />
              <ColorField label="Text Color" value={block.textColor || "#fff"} onChange={(v) => onUpdate({ textColor: v })} />
            </>
          )}

          {block.type === "divider" && (
            <>
              <Select
                label="Style"
                options={[
                  { label: "Solid", value: "solid" },
                  { label: "Dashed", value: "dashed" },
                  { label: "Dotted", value: "dotted" },
                ]}
                value={block.style || "solid"}
                onChange={(v) => onUpdate({ style: v })}
              />
              <ColorField label="Color" value={block.color || "#e1e3e5"} onChange={(v) => onUpdate({ color: v })} />
            </>
          )}

          {block.type === "spacer" && (
            <Select
              label="Height"
              options={[
                { label: "Small (20px)", value: "20px" },
                { label: "Medium (40px)", value: "40px" },
                { label: "Large (60px)", value: "60px" },
                { label: "X-Large (80px)", value: "80px" },
              ]}
              value={block.height || "40px"}
              onChange={(v) => onUpdate({ height: v })}
            />
          )}

          {block.type === "html" && (
            <TextField
              label="HTML Code"
              value={block.code || ""}
              onChange={(v) => onUpdate({ code: v })}
              multiline={8}
              autoComplete="off"
              helpText="Raw HTML — will be injected as-is into the blog content."
            />
          )}
        </BlockStack>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <div>
      <Text variant="bodySm" fontWeight="semibold">{label}</Text>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "6px" }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 36, height: 36, border: "1px solid #c9cccf", borderRadius: "4px", cursor: "pointer", padding: 0, background: "transparent" }}
        />
        <TextField
          label=""
          labelHidden
          value={value}
          onChange={onChange}
          autoComplete="off"
        />
      </div>
    </div>
  );
}

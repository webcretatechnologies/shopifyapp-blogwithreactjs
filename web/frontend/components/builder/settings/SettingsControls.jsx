/**
 * SettingsControls.jsx
 *
 * Maps a block type to the corresponding form controls for its settings.
 * Updates are dispatched immediately to the store via onChange.
 */

import { Select, TextField, Checkbox, Button, ButtonGroup, Icon, Box, Text, InlineStack } from "@shopify/polaris";
import { PlusIcon, DeleteIcon, ArrowUpIcon, ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon } from "@shopify/polaris-icons";

// Re-use classic block settings for commerce blocks
import { BuyButtonBlockSettings } from "../../editor/blocks/BuyButtonBlock";
import { ProductGridBlockSettings } from "../../editor/blocks/ProductGridBlock";
import { CollectionBlockSettings } from "../../editor/blocks/CollectionBlock";
import { ProductSliderBlockSettings } from "../../editor/blocks/ProductSliderBlock";
import { HeroBlockSettings } from "../../editor/blocks/HeroBlock";
import { ImageBlockSettings } from "../../editor/blocks/ImageBlock/index.jsx";
import { VideoBlockSettings } from "../../editor/blocks/VideoBlock";
import { SpacerBlockSettings } from "../../editor/blocks/SpacerBlock";

import { useShopifyStoreCurrency } from "../../../hooks/useShopifyProducts.js";

function ProductCardBlockSettings({ block, onUpdate }) {
  const { storeCurrency } = useShopifyStoreCurrency();

  const handlePickProduct = async () => {
    if (!window.shopify?.resourcePicker) return;
    const rawId = block.productId;
    const initialSelection = rawId ? [{
      id: String(rawId).startsWith('gid://') ? String(rawId) : `gid://shopify/Product/${rawId}`
    }] : [];

    const selection = await window.shopify.resourcePicker({
      type: 'product',
      multiple: false,
      selectionIds: initialSelection,
    });
    if (selection?.[0]) {
      const p = selection[0];
      const variant = p.variants?.[0];
      onUpdate({
        productId: p.id || '',
        title: p.title || '',
        handle: p.handle || '',
        imageUrl: p.images?.[0]?.originalSrc || p.images?.[0]?.src || '',
        price: variant?.price || '',
        compareAtPrice: variant?.compareAtPrice || '',
        currency: storeCurrency || 'USD',
      });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <button
        type="button"
        onClick={handlePickProduct}
        style={{
          width: '100%', padding: '10px', border: '1px solid #c9cccf',
          borderRadius: '6px', background: block.title ? '#f9fafb' : '#fff',
          cursor: 'pointer', fontSize: '13px', textAlign: 'left',
        }}
      >
        {block.title ? (
          <span>✅ <strong>{block.title}</strong> {block.price ? `— $${block.price}` : ''}</span>
        ) : (
          <span>🛒 Select Product from Shopify</span>
        )}
      </button>

      <TextField
        label="Title"
        value={block.title || ''}
        onChange={(val) => onUpdate({ title: val })}
        autoComplete="off"
      />

      <TextField
        label="Price"
        value={block.price || ''}
        onChange={(val) => onUpdate({ price: val })}
        autoComplete="off"
      />

      <TextField
        label="Image URL"
        value={block.imageUrl || ''}
        onChange={(val) => onUpdate({ imageUrl: val })}
        autoComplete="off"
      />

      <Select
        label="Layout"
        options={[
          { label: "Vertical", value: "vertical" },
          { label: "Horizontal", value: "horizontal" },
          { label: "Compact", value: "compact" },
        ]}
        value={block.layout || "vertical"}
        onChange={(val) => onUpdate({ layout: val })}
      />

      <TextField
        label="Button Text"
        value={block.buttonText || "Add to Cart"}
        onChange={(val) => onUpdate({ buttonText: val })}
        autoComplete="off"
      />

      <TextField
        label="Button Color"
        type="color"
        value={block.buttonColor || "#008060"}
        onChange={(val) => onUpdate({ buttonColor: val })}
        autoComplete="off"
      />

      <Checkbox
        label="Show Image"
        checked={block.showImage !== false}
        onChange={(val) => onUpdate({ showImage: val })}
      />
      <Checkbox
        label="Show Price"
        checked={block.showPrice !== false}
        onChange={(val) => onUpdate({ showPrice: val })}
      />
      <Checkbox
        label="Show Button"
        checked={block.showButton !== false}
        onChange={(val) => onUpdate({ showButton: val })}
      />

      <TextField
        label="Border Radius"
        type="number"
        value={String(block.borderRadius ?? 8)}
        onChange={(val) => onUpdate({ borderRadius: parseInt(val) || 0 })}
        autoComplete="off"
      />
      <TextField
        label="Border Color"
        type="color"
        value={block.borderColor || "#e1e3e5"}
        onChange={(val) => onUpdate({ borderColor: val })}
        autoComplete="off"
      />
    </div>
  );
}

export default function SettingsControls({ block, onChange }) {
  const { type, settings } = block;

  // Helper to cleanly map value changes
  const update = (key, value) => onChange({ [key]: value });

  // -------------------------------------------------------------------------
  // Commerce / Shared Blocks (reusing existing UI components)
  // -------------------------------------------------------------------------
  if (type === "ProductCard") return <ProductCardBlockSettings block={settings} onUpdate={onChange} />;
  if (type === "BuyButton") return <BuyButtonBlockSettings block={settings} onUpdate={onChange} setBlock={onChange} />;
  if (type === "ProductGrid") return <ProductGridBlockSettings block={settings} onUpdate={onChange} setBlock={onChange} />;
  if (type === "Collection") return <CollectionBlockSettings block={settings} onUpdate={onChange} setBlock={onChange} />;
  if (type === "ProductSlider") return <ProductSliderBlockSettings block={settings} onUpdate={onChange} setBlock={onChange} />;
  if (type === "HeroSection") return <HeroBlockSettings block={settings} onUpdate={onChange} setBlock={onChange} />;
  if (type === "Image") return <ImageBlockSettings block={settings} onUpdate={onChange} setBlock={onChange} />;
  if (type === "VideoEmbed" || type === "VideoBlock") return <VideoBlockSettings block={settings} onUpdate={onChange} setBlock={onChange} />;
  // Note: SpacerBlockSettings is the classic one; we use it for both variants
  if (type === "Spacer") return <SpacerBlockSettings block={settings} onUpdate={onChange} setBlock={onChange} />;

  if (type === "ButtonBlock") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <TextField label="Button Text" value={settings.text || ""} onChange={(val) => update("text", val)} autoComplete="off" />
        <TextField label="Link URL" value={settings.url || ""} onChange={(val) => update("url", val)} autoComplete="off" />
        <Select label="Alignment" options={["left", "center", "right"]} value={settings.alignment || "center"} onChange={(val) => update("alignment", val)} />
        <TextField label="Background Color" type="color" value={settings.backgroundColor || "#008060"} onChange={(val) => update("backgroundColor", val)} autoComplete="off" />
        <TextField label="Text Color" type="color" value={settings.textColor || "#ffffff"} onChange={(val) => update("textColor", val)} autoComplete="off" />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Builder-Specific Blocks
  // -------------------------------------------------------------------------

  if (type === "Section") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <TextField
          label="Background Color"
          type="color"
          value={settings.backgroundColor || "#ffffff"}
          onChange={(val) => update("backgroundColor", val)}
          autoComplete="off"
        />
        <Select
          label="Padding Top"
          options={["0px", "16px", "24px", "40px", "64px", "80px"]}
          value={settings.paddingTop || "40px"}
          onChange={(val) => update("paddingTop", val)}
        />
        <Select
          label="Padding Bottom"
          options={["0px", "16px", "24px", "40px", "64px", "80px"]}
          value={settings.paddingBottom || "40px"}
          onChange={(val) => update("paddingBottom", val)}
        />
        <Select
          label="Border Radius"
          options={[
            { label: "None", value: "0px" },
            { label: "Small", value: "4px" },
            { label: "Medium", value: "8px" },
            { label: "Large", value: "16px" },
            { label: "Round", value: "32px" },
          ]}
          value={settings.borderRadius || "0px"}
          onChange={(val) => update("borderRadius", val)}
        />
      </div>
    );
  }

  if (type === "Heading") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <TextField
          label="Heading Text"
          value={settings.text || ""}
          onChange={(val) => update("text", val)}
          autoComplete="off"
        />
        <Select
          label="Level"
          options={[
            { label: "H1", value: 1 },
            { label: "H2", value: 2 },
            { label: "H3", value: 3 },
            { label: "H4", value: 4 },
          ]}
          value={settings.level || 2}
          onChange={(val) => update("level", Number(val))}
        />
        <Select
          label="Alignment"
          options={[
            { label: "Left", value: "left" },
            { label: "Center", value: "center" },
            { label: "Right", value: "right" },
          ]}
          value={settings.align || "left"}
          onChange={(val) => update("align", val)}
        />
        <TextField
          label="Text Color"
          type="color"
          value={settings.color || "#202223"}
          onChange={(val) => update("color", val)}
          autoComplete="off"
        />
      </div>
    );
  }

  if (type === "Divider") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <Select
          label="Style"
          options={[
            { label: "Solid", value: "solid" },
            { label: "Dashed", value: "dashed" },
            { label: "Dotted", value: "dotted" },
          ]}
          value={settings.style || "solid"}
          onChange={(val) => update("style", val)}
        />
        <Select
          label="Thickness"
          options={["1px", "2px", "4px", "8px"]}
          value={settings.thickness || "1px"}
          onChange={(val) => update("thickness", val)}
        />
        <TextField
          label="Color"
          type="color"
          value={settings.color || "#e1e3e5"}
          onChange={(val) => update("color", val)}
          autoComplete="off"
        />
        <Select
          label="Width"
          options={["100%", "75%", "50%", "25%"]}
          value={settings.width || "100%"}
          onChange={(val) => update("width", val)}
        />
      </div>
    );
  }

  if (type === "ColumnLayout") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <Select
          label="Columns"
          options={[
            { label: "2 Columns", value: 2 },
            { label: "3 Columns", value: 3 },
            { label: "4 Columns", value: 4 },
          ]}
          value={settings.columns || 2}
          onChange={(val) => update("columns", Number(val))}
        />
        <Select
          label="Gap"
          options={["0px", "8px", "16px", "24px", "32px"]}
          value={settings.gap || "16px"}
          onChange={(val) => update("gap", val)}
        />
        <p style={{ color: "#6d7175", fontSize: "13px" }}>
          Note: Drag blocks directly into the columns on the canvas.
        </p>
      </div>
    );
  }

  if (type === "Callout") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <TextField
          label="Title"
          value={settings.title || ""}
          onChange={(val) => update("title", val)}
          autoComplete="off"
        />
        <TextField
          label="Body"
          value={settings.body || ""}
          onChange={(val) => update("body", val)}
          multiline={3}
          autoComplete="off"
        />
        <TextField
          label="Emoji"
          value={settings.emoji || ""}
          onChange={(val) => update("emoji", val)}
          autoComplete="off"
        />
        <TextField
          label="Background Color"
          type="color"
          value={settings.backgroundColor || "#fdfbc8"}
          onChange={(val) => update("backgroundColor", val)}
          autoComplete="off"
        />
        <TextField
          label="Border Color"
          type="color"
          value={settings.borderColor || "#eab308"}
          onChange={(val) => update("borderColor", val)}
          autoComplete="off"
        />
      </div>
    );
  }

  if (type === "Html") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <TextField
          label="HTML Code"
          value={settings.code || ""}
          onChange={(val) => update("code", val)}
          multiline={6}
          autoComplete="off"
          monospaced
        />
      </div>
    );
  }

  if (type === "Table") {
    const data = settings.tableData || [];
    const hasHeader = settings.hasHeader || false;

    const addRow = () => {
      const cols = data.length > 0 ? data[0].length : 1;
      const newRow = Array(cols).fill("");
      update("tableData", [...data, newRow]);
      update("rows", data.length + 1);
    };

    const addCol = () => {
      const newData = data.length === 0 ? [[""]] : data.map(row => [...row, ""]);
      update("tableData", newData);
      update("cols", newData[0].length);
    };

    const removeRow = (rIndex) => {
      if (data.length <= 1) return;
      const newData = data.filter((_, i) => i !== rIndex);
      update("tableData", newData);
      update("rows", newData.length);
    };

    const removeCol = (cIndex) => {
      if (data[0].length <= 1) return;
      const newData = data.map(row => row.filter((_, i) => i !== cIndex));
      update("tableData", newData);
      update("cols", newData[0].length);
    };

    const updateCell = (rIndex, cIndex, value) => {
      const newData = data.map((row, r) => 
        r === rIndex ? row.map((cell, c) => c === cIndex ? value : cell) : row
      );
      update("tableData", newData);
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <Checkbox
          label="First row is a header"
          checked={hasHeader}
          onChange={(val) => update("hasHeader", val)}
        />
        
        <div style={{ border: "1px solid var(--p-color-border-secondary)", borderRadius: "6px", overflow: "auto", padding: "12px", background: "var(--p-color-bg-surface-secondary)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {data.map((row, rIndex) => (
              <div key={`row-${rIndex}`} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {row.map((cell, cIndex) => (
                  <div key={`cell-${rIndex}-${cIndex}`} style={{ flex: 1, minWidth: "120px" }}>
                    <TextField
                      value={cell || ""}
                      onChange={(val) => updateCell(rIndex, cIndex, val)}
                      autoComplete="off"
                      placeholder={hasHeader && rIndex === 0 ? "Header..." : "Cell..."}
                    />
                  </div>
                ))}
                <div style={{ flexShrink: 0 }}>
                  <Button icon={DeleteIcon} tone="critical" variant="tertiary" onClick={() => removeRow(rIndex)} accessibilityLabel="Remove row" disabled={data.length <= 1} />
                </div>
              </div>
            ))}
            
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
              {data.length > 0 && data[0].map((_, cIndex) => (
                <div key={`col-del-${cIndex}`} style={{ flex: 1, minWidth: "120px", display: "flex", justifyContent: "center" }}>
                  <Button icon={DeleteIcon} tone="critical" variant="tertiary" onClick={() => removeCol(cIndex)} accessibilityLabel="Remove column" disabled={data[0].length <= 1} size="micro" />
                </div>
              ))}
              <div style={{ width: "28px" }} /> {/* Spacer for row delete button */}
            </div>
          </div>
        </div>

        <InlineStack gap="200">
          <Button icon={PlusIcon} onClick={addRow}>Add Row</Button>
          <Button icon={PlusIcon} onClick={addCol}>Add Column</Button>
        </InlineStack>
      </div>
    );
  }

  // Fallback for blocks with no specific settings (e.g., RichText which is edited inline)
  return (
    <p style={{ color: "#6d7175", fontSize: "13px" }}>
      This block is edited directly on the canvas.
    </p>
  );
}

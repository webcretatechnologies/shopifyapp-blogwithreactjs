/**
 * BlockSettings — Right-panel settings inspector.
 * Renders controls specific to the selected block type.
 */
import { useCallback } from "react";
import {
  TextField,
  Select,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Divider,
  Thumbnail,
} from "@shopify/polaris";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

export default function BlockSettings({ block, onUpdate, onClose, _noHeader = false }) {
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

  const openProductPicker = useCallback(
    async (onProductSelected, { multiple = false, selectionIds = [] } = {}) => {
      if (!window.shopify?.resourcePicker) return;
      const selection = await window.shopify.resourcePicker({
        type: "product",
        multiple,
        selectionIds: selectionIds.map((id) => ({ id })),
      });
      if (selection && selection.length > 0) {
        if (multiple) {
          const products = selection.map((p) => ({
            shopifyProductId: p.id,
            title: p.title,
            handle: p.handle,
            image: p.images?.[0]?.originalSrc || null,
            price: p.variants?.[0]?.price || null,
            variantId: p.variants?.[0]?.id || null,
            compareAtPrice: p.variants?.[0]?.compareAtPrice || null,
          }));
          onProductSelected(products);
        } else {
          const p = selection[0];
          onProductSelected({
            shopifyProductId: p.id,
            title: p.title,
            handle: p.handle,
            image: p.images?.[0]?.originalSrc || null,
            price: p.variants?.[0]?.price || null,
            variantId: p.variants?.[0]?.id || null,
            compareAtPrice: p.variants?.[0]?.compareAtPrice || null,
          });
        }
      }
    },
    [],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const genId = () =>
    Date.now().toString(36) + Math.random().toString(36).substr(2);

  return (
    <div style={{ padding: "0" }}>
      {/* Header — hidden when used as legacy body inside new PageBuilder */}
      {!_noHeader && (
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e1e3e5",
            background: "#f9fafb",
          }}
        >
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="headingSm">
              {block.type
                .replace(/_/g, " ")
                .replace(/\b\w/g, (c) => c.toUpperCase())}{" "}
              Settings
            </Text>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "16px",
                color: "#6d7175",
              }}
            >
              &#10005;
            </button>
          </InlineStack>
        </div>
      )}

      <div style={{ padding: "16px" }}>
        <BlockStack gap="400">
          {block.type === "heading" && (
            <>
              <TextField
                label="Heading Text"
                value={block.content || ""}
                onChange={(v) => onUpdate({ content: v })}
                multiline={2}
                autoComplete="off"
              />
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
              <ColorField
                label="Text Color"
                value={block.color || "#202223"}
                onChange={(v) => onUpdate({ color: v })}
              />
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
              {field(
                "src",
                "Image URL",
                "Paste a URL or upload via Shopify Files",
              )}
              {field("alt", "Alt Text", "Describe the image for accessibility")}
              {field(
                "caption",
                "Caption",
                "Optional caption shown below the image",
              )}
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
              <ProductSelectionField
                block={block}
                onUpdate={onUpdate}
                openProductPicker={openProductPicker}
              />
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
              <div>
                <InlineStack gap="200" blockAlign="center">
                  <input
                    type="checkbox"
                    id="product-float"
                    checked={block.float === true || block.float === "true"}
                    onChange={(e) => onUpdate({ float: e.target.checked })}
                    style={{ margin: 0 }}
                  />
                  <label
                    htmlFor="product-float"
                    style={{ fontSize: "13px", cursor: "pointer" }}
                  >
                    Float (text wraps around card)
                  </label>
                </InlineStack>
              </div>
            </>
          )}

          {block.type === "product_slider" && (
            <>
              {field(
                "title",
                "Slider Title",
                "Displayed above the product row",
              )}
              <Divider />
              <BlockStack gap="200">
                <Text variant="bodySm" fontWeight="semibold">
                  Products
                </Text>
                <Text variant="bodyXs" tone="subdued">
                  Select products to display in the slider carousel. Drag the
                  grip handles to reorder.
                </Text>
                <Button
                  fullWidth
                  onClick={() =>
                    openProductPicker((products) => onUpdate({ products }), {
                      multiple: true,
                      selectionIds: (block.products || [])
                        .map((p) => p.shopifyProductId)
                        .filter(Boolean),
                    })
                  }
                >
                  {(block.products || []).length > 0
                    ? "Change Products"
                    : "Select Products"}
                </Button>
                {(block.products || []).length > 0 && (
                  <BlockStack gap="200">
                    <Text variant="bodyXs" tone="subdued">
                      {(block.products || []).length} product
                      {block.products.length !== 1 ? "s" : ""} selected
                    </Text>
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      modifiers={[restrictToVerticalAxis]}
                      onDragEnd={(event) => {
                        const { active, over } = event;
                        if (!over || active.id === over.id) return;
                        const products = block.products || [];
                        const oldIndex = products.findIndex(
                          (p) =>
                            (p.shopifyProductId || p.handle || "") ===
                            active.id,
                        );
                        const newIndex = products.findIndex(
                          (p) =>
                            (p.shopifyProductId || p.handle || "") === over.id,
                        );
                        if (oldIndex === -1 || newIndex === -1) return;
                        onUpdate({
                          products: arrayMove(products, oldIndex, newIndex),
                        });
                      }}
                    >
                      <SortableContext
                        items={(block.products || []).map(
                          (p) => p.shopifyProductId || p.handle || "",
                        )}
                        strategy={verticalListSortingStrategy}
                      >
                        {(block.products || []).map((p, idx) => {
                          const itemId =
                            p.shopifyProductId || p.handle || `product_${idx}`;
                          return (
                            <SortableProductItem
                              key={itemId}
                              product={p}
                              id={itemId}
                              onRemove={() => {
                                const updated = (block.products || []).filter(
                                  (_, i) => i !== idx,
                                );
                                onUpdate({ products: updated });
                              }}
                            />
                          );
                        })}
                      </SortableContext>
                    </DndContext>
                  </BlockStack>
                )}
              </BlockStack>
            </>
          )}

          {block.type === "product_sidebar" && (
            <>
              <TextField
                label="Section Title"
                value={block.title || ""}
                onChange={(v) => onUpdate({ title: v })}
                autoComplete="off"
                helpText="Optional heading above the content"
              />
              <TextField
                label="Content"
                value={block.data || ""}
                onChange={(v) => onUpdate({ data: v })}
                multiline={4}
                autoComplete="off"
                helpText="Descriptive text for this section"
              />
              <Select
                label="Sidebar Position"
                options={[
                  { label: "Right side", value: "right" },
                  { label: "Left side", value: "left" },
                  { label: "Below content", value: "below" },
                ]}
                value={block.side || "right"}
                onChange={(v) => onUpdate({ side: v })}
              />
              <Select
                label="Card Style"
                options={[
                  { label: "Vertical (stacked)", value: "vertical" },
                  { label: "Horizontal (side by side)", value: "horizontal" },
                ]}
                value={block.card_style || "vertical"}
                onChange={(v) => onUpdate({ card_style: v })}
              />
              <Divider />
              <ProductSelectionField
                block={block}
                onUpdate={onUpdate}
                openProductPicker={openProductPicker}
              />
            </>
          )}

          {block.type === "product_switcher" && (
            <>
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="bodySm" fontWeight="semibold">
                  Sections
                </Text>
                <Text variant="bodyXs" tone="subdued">
                  Drag handles to reorder
                </Text>
              </InlineStack>
              <Text variant="bodyXs" tone="subdued">
                Each section becomes a scroll point that switches the sticky
                product card.
              </Text>
              <div style={{ marginTop: "4px" }}>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis]}
                  onDragEnd={(event) => {
                    const { active, over } = event;
                    if (!over || active.id === over.id) return;
                    const sections = block.sections || [];
                    const oldIndex = sections.findIndex(
                      (s) => (s.id || "") === active.id,
                    );
                    const newIndex = sections.findIndex(
                      (s) => (s.id || "") === over.id,
                    );
                    if (oldIndex === -1 || newIndex === -1) return;
                    onUpdate({
                      sections: arrayMove(sections, oldIndex, newIndex),
                    });
                  }}
                >
                  <SortableContext
                    items={(block.sections || []).map(
                      (s, i) => s.id || `section_${i}`,
                    )}
                    strategy={verticalListSortingStrategy}
                  >
                    {(block.sections || []).map((section, idx) => {
                      const sectionId = section.id || `section_${idx}`;
                      return (
                        <SortableSwitcherSection
                          key={sectionId}
                          section={section}
                          sectionId={sectionId}
                          idx={idx}
                          block={block}
                          onUpdate={onUpdate}
                          openProductPicker={openProductPicker}
                          genId={genId}
                        />
                      );
                    })}
                  </SortableContext>
                </DndContext>
              </div>
              <Button
                fullWidth
                onClick={() => {
                  const updated = [
                    ...(block.sections || []),
                    { id: genId(), title: "", body: "", product: null },
                  ];
                  onUpdate({ sections: updated });
                }}
              >
                + Add Section
              </Button>
            </>
          )}

          {block.type === "featured_product" && (
            <>
              <TextField
                label="Badge Text"
                value={block.badge || "FEATURED HERE"}
                onChange={(v) => onUpdate({ badge: v })}
                autoComplete="off"
                helpText="Short label shown above the section title"
              />
              <TextField
                label="Section Title"
                value={block.title || ""}
                onChange={(v) => onUpdate({ title: v })}
                autoComplete="off"
                helpText="Optional heading for this section"
              />
              <TextField
                label="Content"
                value={block.data || ""}
                onChange={(v) => onUpdate({ data: v })}
                multiline={4}
                autoComplete="off"
                helpText="Descriptive text alongside the featured card"
              />
              <Divider />
              <ProductSelectionField
                block={block}
                onUpdate={onUpdate}
                openProductPicker={openProductPicker}
              />
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
              <ColorField
                label="Button Color"
                value={block.color || "#008060"}
                onChange={(v) => onUpdate({ color: v })}
              />
              <ColorField
                label="Text Color"
                value={block.textColor || "#fff"}
                onChange={(v) => onUpdate({ textColor: v })}
              />
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
              <ColorField
                label="Color"
                value={block.color || "#e1e3e5"}
                onChange={(v) => onUpdate({ color: v })}
              />
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

/**
 * Reusable product selection widget — shows current product thumbnail + info,
 * with a button to open the Shopify resource picker.
 */
function ProductSelectionField({ block, onUpdate, openProductPicker }) {
  const hasProduct = Boolean(block.shopifyProductId || block.handle);
  return (
    <BlockStack gap="200">
      <Text variant="bodySm" fontWeight="semibold">
        Linked Product
      </Text>
      {hasProduct ? (
        <div
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            padding: "10px",
            border: "1px solid #e1e3e5",
            borderRadius: "8px",
            background: "#fafbfc",
          }}
        >
          {block.image && (
            <Thumbnail
              source={block.image}
              size="small"
              alt={block.title || ""}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodySm" fontWeight="semibold">
              {block.title || "Untitled Product"}
            </Text>
            <InlineStack gap="150" blockAlign="center">
              <Text variant="bodyXs" tone="subdued">
                {block.handle || ""}
              </Text>
              {block.price && (
                <Text variant="bodyXs" tone="success" fontWeight="semibold">
                  ${block.price}
                </Text>
              )}
            </InlineStack>
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdate({
                shopifyProductId: "",
                handle: "",
                title: "",
                image: "",
                price: "",
                variantId: "",
                compareAtPrice: "",
              })
            }
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "14px",
              color: "#6d7175",
              padding: "4px",
            }}
            title="Remove product"
          >
            &#10005;
          </button>
        </div>
      ) : (
        <div
          style={{
            padding: "12px",
            border: "1px dashed #c9cccf",
            borderRadius: "8px",
            textAlign: "center",
            background: "#fafbfc",
          }}
        >
          <Text variant="bodySm" tone="subdued">
            No product selected
          </Text>
        </div>
      )}
      <Button
        fullWidth
        onClick={() =>
          openProductPicker((productData) => {
            onUpdate({
              shopifyProductId: productData.shopifyProductId,
              title: productData.title,
              handle: productData.handle,
              image: productData.image,
              price: productData.price,
              variantId: productData.variantId,
              compareAtPrice: productData.compareAtPrice,
            });
          })
        }
      >
        {hasProduct ? "Change Product" : "Select Product"}
      </Button>
    </BlockStack>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <div>
      <Text variant="bodySm" fontWeight="semibold">
        {label}
      </Text>
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          marginTop: "6px",
        }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 36,
            height: 36,
            border: "1px solid #c9cccf",
            borderRadius: "4px",
            cursor: "pointer",
            padding: 0,
            background: "transparent",
          }}
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

/**
 * Sortable product item with drag handle, product info, and remove button.
 */
function SortableProductItem({ product, id, onRemove }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    padding: "8px",
    border: `1px solid ${isDragging ? "#008060" : "#e1e3e5"}`,
    borderRadius: "6px",
    background: isDragging ? "#eefaf6" : "#fafbfc",
    boxShadow: isDragging ? "0 4px 12px rgba(0,0,0,0.12)" : "none",
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : "auto",
    position: "relative",
    opacity: isDragging ? 0.9 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        style={{
          cursor: "grab",
          background: "none",
          border: "none",
          padding: "2px 4px",
          fontSize: "16px",
          color: "#8c9196",
          lineHeight: 1,
          touchAction: "none",
        }}
        aria-label="Drag to reorder"
      >
        ⠿
      </button>
      {product.image && (
        <Thumbnail
          source={product.image}
          size="small"
          alt={product.title || ""}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodySm" fontWeight="semibold">
          {product.title || "Untitled Product"}
        </Text>
        <InlineStack gap="100">
          <Text variant="bodyXs" tone="subdued">
            {product.handle || ""}
          </Text>
          {product.price && (
            <Text variant="bodyXs" tone="success">
              ${product.price}
            </Text>
          )}
        </InlineStack>
      </div>
      <button
        type="button"
        onClick={onRemove}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: "12px",
          color: "#d82c0d",
          padding: "2px",
        }}
      >
        &#10005;
      </button>
    </div>
  );
}

/**
 * Sortable product_switcher section with drag handle, fields, and product picker.
 */
function SortableSwitcherSection({
  section,
  sectionId,
  idx,
  block,
  onUpdate,
  openProductPicker,
  genId,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sectionId });

  const style = {
    border: `1px solid ${isDragging ? "#008060" : "#e1e3e5"}`,
    borderRadius: "8px",
    padding: "12px",
    marginBottom: "10px",
    background: isDragging ? "#eefaf6" : "#fafbfc",
    boxShadow: isDragging ? "0 4px 12px rgba(0,0,0,0.12)" : "none",
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : "auto",
    position: "relative",
    opacity: isDragging ? 0.9 : 1,
  };

  const updateSection = (patch) => {
    const updated = [...(block.sections || [])];
    updated[idx] = { ...updated[idx], ...patch };
    onUpdate({ sections: updated });
  };

  return (
    <div ref={setNodeRef} style={style}>
      <InlineStack align="space-between" blockAlign="center">
        <InlineStack gap="100" blockAlign="center">
          {/* Drag handle */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            style={{
              cursor: "grab",
              background: "none",
              border: "none",
              padding: "2px 4px",
              fontSize: "16px",
              color: "#8c9196",
              lineHeight: 1,
              touchAction: "none",
            }}
            aria-label="Drag to reorder"
          >
            ⠿
          </button>
          <Text variant="bodySm" fontWeight="semibold">
            Point {idx + 1}
          </Text>
        </InlineStack>
        <InlineStack gap="100">
          <button
            type="button"
            onClick={() => {
              const sections = block.sections || [];
              const dup = JSON.parse(JSON.stringify(sections[idx]));
              dup.id = genId();
              const updated = [
                ...sections.slice(0, idx + 1),
                dup,
                ...sections.slice(idx + 1),
              ];
              onUpdate({ sections: updated });
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#2c6ecf",
              fontSize: "12px",
              fontWeight: 600,
              padding: "2px 4px",
            }}
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => {
              const updated = (block.sections || []).filter(
                (_, i) => i !== idx,
              );
              onUpdate({ sections: updated });
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#d82c0d",
              fontSize: "13px",
              fontWeight: 600,
              padding: "2px 4px",
            }}
          >
            Remove
          </button>
        </InlineStack>
      </InlineStack>
      <div style={{ marginTop: "8px" }}>
        <TextField
          label="Title"
          value={section.title || ""}
          onChange={(v) => updateSection({ title: v })}
          autoComplete="off"
        />
      </div>
      <div style={{ marginTop: "8px" }}>
        <TextField
          label="Body"
          value={section.body || ""}
          onChange={(v) => updateSection({ body: v })}
          multiline={3}
          autoComplete="off"
        />
      </div>
      <div style={{ marginTop: "8px" }}>
        {section.product ? (
          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              padding: "8px",
              background: "#fff",
              border: "1px solid #e1e3e5",
              borderRadius: "6px",
              marginBottom: "6px",
            }}
          >
            {section.product.image && (
              <Thumbnail source={section.product.image} size="small" alt="" />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text variant="bodySm" fontWeight="semibold">
                {section.product.title || "Product"}
              </Text>
              <InlineStack gap="100">
                <Text variant="bodyXs" tone="subdued">
                  {section.product.handle}
                </Text>
                {section.product.price && (
                  <Text variant="bodyXs" tone="success">
                    ${section.product.price}
                  </Text>
                )}
              </InlineStack>
            </div>
            <button
              type="button"
              onClick={() => updateSection({ product: null })}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "12px",
                color: "#d82c0d",
                padding: "2px",
              }}
            >
              &#10005;
            </button>
          </div>
        ) : null}
        <Button
          size="micro"
          onClick={() =>
            openProductPicker((productData) => {
              updateSection({ product: productData });
            })
          }
        >
          {section.product ? "Change Product" : "Select Product"}
        </Button>
      </div>
    </div>
  );
}

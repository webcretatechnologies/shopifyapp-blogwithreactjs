/**
 * Page Builder — Main canvas with drag-and-drop block reordering.
 * Uses @dnd-kit/core for DnD, renders a list of block components.
 */
import { useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { Button, Text, InlineStack, Box, Divider, Banner } from "@shopify/polaris";
import BuilderToolbar from "./BuilderToolbar";
import BlockSettings from "./BlockSettings";
import SortableBlock from "./SortableBlock";

let blockIdCounter = Date.now();
const genId = () => `block_${++blockIdCounter}`;

export default function PageBuilder({ blocks = [], onChange }) {
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [activeId, setActiveId] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const addBlock = useCallback((blockType) => {
    const defaults = getBlockDefaults(blockType);
    const newBlock = { id: genId(), type: blockType, ...defaults };
    const updated = [...blocks, newBlock];
    onChange(updated);
    setSelectedBlockId(newBlock.id);
  }, [blocks, onChange]);

  const updateBlock = useCallback((id, patch) => {
    onChange(blocks.map((b) => b.id === id ? { ...b, ...patch } : b));
  }, [blocks, onChange]);

  const removeBlock = useCallback((id) => {
    onChange(blocks.filter((b) => b.id !== id));
    if (selectedBlockId === id) setSelectedBlockId(null);
  }, [blocks, onChange, selectedBlockId]);

  const duplicateBlock = useCallback((id) => {
    const idx = blocks.findIndex((b) => b.id === id);
    if (idx === -1) return;
    const copy = { ...blocks[idx], id: genId() };
    const updated = [...blocks.slice(0, idx + 1), copy, ...blocks.slice(idx + 1)];
    onChange(updated);
  }, [blocks, onChange]);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);
    if (active.id !== over?.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      onChange(arrayMove(blocks, oldIndex, newIndex));
    }
  };

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId);

  return (
    <div style={{ display: "flex", gap: "0", minHeight: "600px", border: "1px solid #e1e3e5", borderRadius: "8px", overflow: "hidden" }}>
      {/* Left: Block type toolbar */}
      <BuilderToolbar onAddBlock={addBlock} />

      {/* Center: Canvas */}
      <div style={{ flex: 1, background: "#f9fafb", overflow: "auto", padding: "16px" }}>
        {blocks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#6d7175" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>🧩</div>
            <Text variant="headingMd" tone="subdued">Your canvas is empty</Text>
            <Text variant="bodySm" tone="subdued">Click a block type on the left to add it here</Text>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragStart={(e) => setActiveId(e.active.id)}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {blocks.map((block) => (
                  <SortableBlock
                    key={block.id}
                    block={block}
                    isSelected={block.id === selectedBlockId}
                    onSelect={() => setSelectedBlockId(block.id === selectedBlockId ? null : block.id)}
                    onRemove={() => removeBlock(block.id)}
                    onDuplicate={() => duplicateBlock(block.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Right: Block settings inspector */}
      <div style={{ width: "280px", borderLeft: "1px solid #e1e3e5", background: "#fff", overflow: "auto" }}>
        {selectedBlock ? (
          <BlockSettings
            block={selectedBlock}
            onUpdate={(patch) => updateBlock(selectedBlock.id, patch)}
            onClose={() => setSelectedBlockId(null)}
          />
        ) : (
          <div style={{ padding: "24px", textAlign: "center", color: "#6d7175", marginTop: "60px" }}>
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>⚙️</div>
            <Text variant="bodySm" tone="subdued">Select a block to edit its settings</Text>
          </div>
        )}
      </div>
    </div>
  );
}

function getBlockDefaults(type) {
  const map = {
    heading:        { content: "Your Heading", level: "h2", align: "left", color: "#202223" },
    text:           { content: "<p>Your paragraph text goes here.</p>" },
    image:          { src: "", alt: "", caption: "", width: "100%" },
    video:          { url: "", caption: "" },
    product:        { shopifyProductId: "", title: "", image: "", price: "" },
    product_slider: { title: "Featured Products", products: [] },
    cta_button:     { text: "Shop Now", url: "#", align: "center", color: "#008060", textColor: "#fff" },
    divider:        { style: "solid", color: "#e1e3e5", margin: "20px" },
    spacer:         { height: "40px" },
    html:           { code: "<!-- Your custom HTML -->" },
  };
  return map[type] || {};
}

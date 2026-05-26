/**
 * SortableBlock — Wraps each block in a DnD-kit sortable container
 * with a drag handle, selection highlight, and action buttons.
 */
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Text, InlineStack } from "@shopify/polaris";
import { DeleteIcon, DuplicateIcon } from "@shopify/polaris-icons";
import BlockPreview from "./BlockPreview";

export default function SortableBlock({
  block,
  isSelected,
  onSelect,
  onRemove,
  onDuplicate,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        border: `2px solid ${isSelected ? "#008060" : "#e1e3e5"}`,
        borderRadius: "8px",
        background: "#fff",
        position: "relative",
        cursor: "pointer",
        boxShadow: isSelected ? "0 0 0 3px rgba(0,128,96,0.12)" : "none",
      }}
      onClick={onSelect}
    >
      {/* Drag handle + block label bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          borderBottom: `1px solid ${isSelected ? "#b7e0d4" : "#e1e3e5"}`,
          background: isSelected ? "#f0fdf4" : "#f9fafb",
          borderRadius: "6px 6px 0 0",
          gap: "8px",
        }}
      >
        <InlineStack gap="200" blockAlign="center">
          {/* Drag handle */}
          <span
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            style={{
              cursor: "grab",
              color: "#babec3",
              padding: "0 2px",
              fontSize: "14px",
              lineHeight: 1,
            }}
            title="Drag to reorder"
          >
            ⠿
          </span>
          <Text
            variant="bodySm"
            fontWeight="semibold"
            tone={isSelected ? "success" : "subdued"}
          >
            {block.type
              .replace(/_/g, " ")
              .replace(/\b\w/g, (c) => c.toUpperCase())}
          </Text>
        </InlineStack>
        <InlineStack gap="100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            title="Duplicate block"
            style={iconBtnStyle}
          >
            📋
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Delete block"
            style={{ ...iconBtnStyle, color: "#d82c0d" }}
          >
            🗑
          </button>
        </InlineStack>
      </div>

      {/* Block content preview */}
      <div style={{ padding: "12px 14px" }}>
        <BlockPreview block={block} />
      </div>
    </div>
  );
}

const iconBtnStyle = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "2px 4px",
  borderRadius: "4px",
  fontSize: "14px",
};

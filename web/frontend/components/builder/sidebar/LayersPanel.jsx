import React, { useState, useMemo, useEffect, useRef } from "react";
import { useBuilderStore } from "../store/useBuilderStore";
import { useShallow } from "zustand/shallow";
import { BlockRegistry } from "../BlockRegistry";
import { resolveDropTarget } from "../utils/treeUtils";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  KeyboardSensor,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Icon, Button } from "@shopify/polaris";
import { 
  DragHandleIcon, 
  ChevronDownIcon, 
  ChevronRightIcon, 
  MenuHorizontalIcon,
  DeleteIcon
} from "@shopify/polaris-icons";
import BlockContextMenu from "../canvas/BlockContextMenu";

function LayerRow({ id, depth, isCollapsed, onToggleCollapse }) {
  const blocksById = useBuilderStore((s) => s.blocksById);
  const selectedBlockId = useBuilderStore((s) => s.selectedBlockId);
  const selectedBlockIds = useBuilderStore((s) => s.selectedBlockIds) || [];
  const selectBlock = useBuilderStore((s) => s.selectBlock);
  const toggleBlockSelection = useBuilderStore((s) => s.toggleBlockSelection);
  const block = blocksById[id];
  const isSelected = selectedBlockIds.includes(id) || selectedBlockId === id;
  const rowRef = useRef(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuCoords, setMenuCoords] = useState({ x: 0, y: 0 });

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data: { isSection: block?.type === "Section" || block?.type === "ColumnLayout" || block?.type === "Column" },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    paddingLeft: `${Math.min(depth * 12, 48)}px`,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : "auto",
  };

  useEffect(() => {
    if (isSelected && rowRef.current) {
      setTimeout(() => {
        rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 50);
    }
  }, [isSelected]);

  if (!block) return null;

  const entry = BlockRegistry[block.type];
  const hasChildren = entry?.allowsChildren && block.childrenIds && block.childrenIds.length > 0;
  const label = entry?.label || block.type;
  const previewText = entry?.getPreviewText ? entry.getPreviewText(block) : label;

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectBlock(id);
    }
  };

  const openMenu = (e) => {
    e.stopPropagation();
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuCoords({ x: rect.left, y: rect.bottom });
    setMenuOpen(true);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="layer-row-wrapper"
    >
      <div
        ref={rowRef}
        role="button"
        tabIndex={0}
        aria-selected={isSelected}
        onClick={(e) => {
          // Ctrl/Cmd/Shift-click always toggles. Plain clicks normally replace the whole
          // selection (so clicking one layer to edit its settings is a single click) — but
          // once 2+ blocks are already selected (a bulk-selection session, typically started
          // via the checkboxes), a plain click on another row should extend/toggle that
          // selection instead of silently collapsing it back down to one block.
          const isMulti = e.ctrlKey || e.metaKey || e.shiftKey || selectedBlockIds.length > 1;
          selectBlock(id, isMulti);
        }}
        onKeyDown={handleKeyDown}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "4px 6px",
          margin: "1px 4px",
          borderRadius: "6px",
          background: isSelected ? "var(--p-color-bg-surface-selected)" : "transparent",
          cursor: "pointer",
          border: isSelected ? "1px solid var(--p-color-border-focus)" : "1px solid transparent",
          userSelect: "none",
          minWidth: 0
        }}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          aria-label={`Drag handle for ${label}`}
          style={{
            background: "none",
            border: "none",
            cursor: "grab",
            padding: "0px",
            display: "flex",
            alignItems: "center",
            color: "var(--p-color-icon-secondary)",
            flexShrink: 0
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div style={{ width: 14, height: 14 }}><Icon source={DragHandleIcon} /></div>
        </button>

        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            toggleBlockSelection(id);
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${label}`}
          style={{
            cursor: "pointer",
            width: "13px",
            height: "13px",
            accentColor: "#008060",
            margin: "0 2px",
            flexShrink: 0
          }}
        />

        <div style={{ width: "16px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {hasChildren && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse(id);
              }}
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? `Expand ${label}` : `Collapse ${label}`}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "0px",
                display: "flex",
                alignItems: "center",
                color: "var(--p-color-icon-secondary)",
                borderRadius: "3px"
              }}
            >
              <div style={{ width: 14, height: 14 }}>
                <Icon source={isCollapsed ? ChevronRightIcon : ChevronDownIcon} />
              </div>
            </button>
          )}
        </div>

        <div style={{ width: 14, height: 14, color: "var(--p-color-icon-secondary)", flexShrink: 0 }}>
          {entry?.icon && <Icon source={entry.icon.props.source} />}
        </div>

        <div style={{ 
          flex: 1, 
          minWidth: 0,
          overflow: "hidden", 
          textOverflow: "ellipsis", 
          whiteSpace: "nowrap",
          fontSize: "12px",
          color: "var(--p-color-text)",
          marginLeft: "2px"
        }}>
          <span style={{ fontWeight: 500, marginRight: "4px" }}>{label}</span>
          <span style={{ color: "var(--p-color-text-secondary)", fontSize: "11px" }}>
            {previewText && previewText !== label ? `• ${previewText}` : ""}
          </span>
        </div>

        <button
          type="button"
          onClick={openMenu}
          aria-label={`Options for ${label}`}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px",
            display: "flex",
            alignItems: "center",
            color: "var(--p-color-icon-secondary)",
            borderRadius: "3px",
            flexShrink: 0
          }}
        >
          <div style={{ width: 14, height: 14 }}><Icon source={MenuHorizontalIcon} /></div>
        </button>

        {menuOpen && (
          <BlockContextMenu
            blockId={id}
            x={menuCoords.x}
            y={menuCoords.y}
            onClose={() => setMenuOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

export default function LayersPanel() {
  const blocksById = useBuilderStore((s) => s.blocksById);
  const rootIds = useBuilderStore((s) => s.rootIds);
  const moveBlock = useBuilderStore((s) => s.moveBlock);
  const selectedBlockIds = useBuilderStore((s) => s.selectedBlockIds) || [];
  const selectAllBlocks = useBuilderStore((s) => s.selectAllBlocks);
  const clearSelection = useBuilderStore((s) => s.clearSelection);
  const requestDeleteSelectedBlocks = useBuilderStore((s) => s.requestDeleteSelectedBlocks);

  const [collapsedIds, setCollapsedIds] = useState(new Set());

  const toggleCollapse = (id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleItems = useMemo(() => {
    const items = [];
    const walk = (nodeId, depth) => {
      items.push({ id: nodeId, depth });
      if (!collapsedIds.has(nodeId)) {
        const block = blocksById[nodeId];
        if (block && block.childrenIds) {
          block.childrenIds.forEach(childId => walk(childId, depth + 1));
        }
      }
    };
    rootIds.forEach(id => walk(id, 0));
    return items;
  }, [blocksById, rootIds, collapsedIds]);

  const flatIds = visibleItems.map(v => v.id);
  const totalBlocksCount = Object.keys(blocksById).length;
  const selectedCount = selectedBlockIds.length;
  const allSelected = totalBlocksCount > 0 && selectedCount === totalBlocksCount;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const overIsSection = blocksById[over.id]?.type === "Section" || blocksById[over.id]?.type === "ColumnLayout" || blocksById[over.id]?.type === "Column";
    
    // Resolve where to drop in the nested tree
    const target = resolveDropTarget(blocksById, rootIds, active.id, over.id, overIsSection);
    
    if (target) {
      moveBlock(active.id, target.newParentId, target.newIndex);
    }
  };

  if (rootIds.length === 0) {
    return (
      <div style={{ padding: "24px", textAlign: "center", color: "var(--p-color-text-secondary)" }}>
        No blocks added yet.
      </div>
    );
  }

  return (
    <div 
      style={{ 
        paddingBottom: "24px",
        position: "relative",
        overflowX: "hidden"
      }}
    >
      <div 
        style={{
          padding: "8px 10px",
          margin: "12px 8px 10px 8px",
          borderRadius: "8px",
          background: selectedCount > 0 ? "#fef2f2" : "var(--p-color-bg-surface-secondary)",
          border: selectedCount > 0 ? "1px solid #fecaca" : "1px solid var(--p-color-border-subdued)",
          display: "flex",
          flexDirection: "column",
          gap: "6px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "12px", fontWeight: 600, color: "var(--p-color-text)", userSelect: "none" }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => {
                if (allSelected) clearSelection();
                else selectAllBlocks();
              }}
              style={{ cursor: "pointer", width: "14px", height: "14px", accentColor: "#008060" }}
            />
            <span>{selectedCount > 0 ? `${selectedCount} selected` : "Select All"}</span>
          </label>

          {selectedCount > 0 && (
            <button
              type="button"
              onClick={() => clearSelection()}
              style={{
                background: "none",
                border: "none",
                color: "var(--p-color-text-secondary)",
                fontSize: "11px",
                cursor: "pointer",
                padding: "2px 4px",
                borderRadius: "4px",
                textDecoration: "underline"
              }}
            >
              Clear
            </button>
          )}
        </div>

        {selectedCount > 0 && (
          <Button
            tone="critical"
            variant="primary"
            fullWidth
            size="micro"
            icon={DeleteIcon}
            onClick={() => requestDeleteSelectedBlocks()}
          >
            Delete {selectedCount} Selected Blocks
          </Button>
        )}
      </div>

      <SortableContext items={flatIds} strategy={verticalListSortingStrategy}>
        {visibleItems.map((item) => (
          <LayerRow
            key={item.id}
            id={item.id}
            depth={item.depth}
            isCollapsed={collapsedIds.has(item.id)}
            onToggleCollapse={toggleCollapse}
          />
        ))}
      </SortableContext>
    </div>
  );
}

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
import { Icon } from "@shopify/polaris";
import { 
  DragHandleIcon, 
  ChevronDownIcon, 
  ChevronRightIcon, 
  MenuHorizontalIcon 
} from "@shopify/polaris-icons";
import BlockContextMenu from "../canvas/BlockContextMenu";

function LayerRow({ id, depth, isCollapsed, onToggleCollapse }) {
  const blocksById = useBuilderStore((s) => s.blocksById);
  const selectedBlockId = useBuilderStore((s) => s.selectedBlockId);
  const selectBlock = useBuilderStore((s) => s.selectBlock);
  const block = blocksById[id];
  const isSelected = selectedBlockId === id;
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
    paddingLeft: `${depth * 16}px`,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : "auto",
  };

  useEffect(() => {
    if (isSelected && rowRef.current) {
      // Small timeout to allow panel to mount if switching tabs
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
        onClick={() => selectBlock(id)}
        onKeyDown={handleKeyDown}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "6px 8px",
          margin: "2px 8px",
          borderRadius: "6px",
          background: isSelected ? "var(--p-color-bg-surface-selected)" : "transparent",
          cursor: "pointer",
          border: isSelected ? "1px solid var(--p-color-border-focus)" : "1px solid transparent",
          userSelect: "none"
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
            padding: "2px",
            display: "flex",
            alignItems: "center",
            color: "var(--p-color-icon-secondary)"
          }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()} // Let dnd-kit handle keyboard dragging
        >
          <div style={{ width: 16, height: 16 }}><Icon source={DragHandleIcon} /></div>
        </button>

        <div style={{ width: "20px", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
                padding: "2px",
                display: "flex",
                alignItems: "center",
                color: "var(--p-color-icon-secondary)",
                borderRadius: "4px"
              }}
            >
              <div style={{ width: 16, height: 16 }}>
                <Icon source={isCollapsed ? ChevronRightIcon : ChevronDownIcon} />
              </div>
            </button>
          )}
        </div>

        <div style={{ width: 16, height: 16, color: "var(--p-color-icon-secondary)", flexShrink: 0 }}>
          {entry?.icon && <Icon source={entry.icon.props.source} />}
        </div>

        <div style={{ 
          flex: 1, 
          overflow: "hidden", 
          textOverflow: "ellipsis", 
          whiteSpace: "nowrap",
          fontSize: "13px",
          color: "var(--p-color-text)",
          marginLeft: "4px"
        }}>
          <span style={{ fontWeight: 500, marginRight: "4px" }}>{label}</span>
          <span style={{ color: "var(--p-color-text-secondary)", fontSize: "12px" }}>
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
            padding: "4px",
            display: "flex",
            alignItems: "center",
            color: "var(--p-color-icon-secondary)",
            borderRadius: "4px"
          }}
        >
          <div style={{ width: 16, height: 16 }}><Icon source={MenuHorizontalIcon} /></div>
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
        position: "relative" 
      }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
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
      </DndContext>
    </div>
  );
}

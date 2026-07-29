import React, { memo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BlockRegistry, normalizeBlockType } from "../BlockRegistry";
import { useBuilderStore } from "../store/useBuilderStore";
import { GripVertical, Trash2, Copy, ArrowUp, ArrowDown, EyeOff } from "lucide-react";
import BlockErrorBoundary from "../BlockErrorBoundary";
import BlockContextMenu from "./BlockContextMenu";
import SavePatternModal from "../SavePatternModal";

const CanvasNode = memo(function CanvasNode({ id, isGhost = false }) {
  const block = useBuilderStore((s) => s.blocksById[id]);
  const selectedId = useBuilderStore((s) => s.selectedBlockId);
  const hoveredId = useBuilderStore((s) => s.hoveredBlockId);
  const selectBlock = useBuilderStore((s) => s.selectBlock);
  const setHovered = useBuilderStore((s) => s.setHovered);
  const deleteBlock = useBuilderStore((s) => s.deleteBlock);
  const duplicateBlock = useBuilderStore((s) => s.duplicateBlock);
  const moveBlockUp = useBuilderStore((s) => s.moveBlockUp);
  const moveBlockDown = useBuilderStore((s) => s.moveBlockDown);
  const deviceMode = useBuilderStore((s) => s.deviceMode);

  // Context menu state (mouse-only, see BlockContextMenu.jsx for accessibility note)
  const [contextMenu, setContextMenu] = useState(null);
  const [showSavePatternModal, setShowSavePatternModal] = useState(false);

  if (!block) return null;

  const type = normalizeBlockType(block.type);
  const isSelected = selectedId === id;
  const isHovered = hoveredId === id;

  const registryEntry = BlockRegistry[type];
  if (!registryEntry) return <div style={{ color: "red" }}>Unknown block: {block.type}</div>;

  const { PreviewComponent, allowsChildren } = registryEntry;

  // dnd-kit setup
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data: {
      type,
      isSection: allowsChildren,
    },
  });

  const isColumnNode = type === "Column";
  const isColumnLayoutNode = type === "ColumnLayout";

  // ── Visibility hide-on-device ──
  // Determine if this block should show a "hidden on X" overlay in the editor.
  const isHiddenInCurrentView =
    (deviceMode === "mobile" && block.settings?.hideOnMobile) ||
    (deviceMode === "tablet" && block.settings?.hideOnTablet) ||
    (deviceMode === "desktop" && block.settings?.hideOnDesktop);

  let opacity = 1;
  if (isDragging && !isGhost) opacity = 0.3;
  if (isGhost) opacity = 0.9;
  if (isHiddenInCurrentView) opacity = 0.35;

  const isSectionNode = type === "Section";
  const isLayoutBlock = isColumnNode || isColumnLayoutNode || isSectionNode;

  // At-rest base style:
  // All blocks sit flush and transparent on the white article canvas surface at rest.
  // Visual boundaries and floating action toolbars appear ONLY on hover or selection.
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity,
    position: "relative",
    outline: isSelected && !isGhost
      ? "2px solid #008060"
      : isHovered && !isGhost
      ? "1px solid #008060"
      : isColumnNode
      ? "1px dashed #c9cccf"
      : "1px solid transparent",
    outlineOffset: "-1px",
    borderRadius: "4px",
    marginBottom: isColumnNode ? "0" : "4px",
    flex: isColumnNode ? 1 : undefined,
    minWidth: isColumnNode ? 0 : undefined,
    boxShadow: isGhost
      ? "0 8px 30px rgba(0,0,0,0.12)"
      : isSelected
      ? "0 0 0 3px rgba(0, 128, 96, 0.15)"
      : "none",
    background: isColumnNode ? "#fafbfc" : "transparent",
    padding: isColumnNode ? "6px" : undefined,
  };

  const handleClick = (e) => {
    if (isGhost) return;
    e.stopPropagation();
    selectBlock(id);
  };

  const handleMouseEnter = (e) => {
    if (isGhost) return;
    e.stopPropagation();
    setHovered(id);
  };

  const handleMouseLeave = () => {
    if (isGhost) return;
    setHovered(null);
  };

  const handleContextMenu = (e) => {
    if (isGhost) return;
    e.preventDefault();
    e.stopPropagation();
    selectBlock(id);
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    >
      {/* ── Toolbar (Shown on Hover/Select) ── */}
      {(isSelected || isHovered) && !isDragging && !isGhost && (
        <div
          style={{
            position: "absolute",
            top: "-30px",
            right: "0",
            background: "#008060",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            borderRadius: "6px 6px 0 0",
            padding: "3px 6px",
            gap: "4px",
            zIndex: 20,
            fontSize: "11px",
            fontWeight: 600,
            boxShadow: "0 -2px 6px rgba(0,0,0,0.1)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <span style={{ padding: "0 4px", letterSpacing: "0.3px", opacity: 0.95 }}>
            {registryEntry.label}
          </span>

          <div style={{ height: "12px", width: "1px", background: "rgba(255,255,255,0.3)", margin: "0 2px" }} />

          <button type="button" title="Move Up" onClick={() => moveBlockUp(id)} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", display: "flex", padding: "2px", borderRadius: "3px" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <ArrowUp size={13} />
          </button>
          <button type="button" title="Move Down" onClick={() => moveBlockDown(id)} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", display: "flex", padding: "2px", borderRadius: "3px" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <ArrowDown size={13} />
          </button>
          <button type="button" title="Duplicate" onClick={() => duplicateBlock(id)} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", display: "flex", padding: "2px", borderRadius: "3px" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <Copy size={13} />
          </button>
          <button type="button" title="Delete" onClick={() => deleteBlock(id)} style={{ background: "transparent", border: "none", color: "#fff", cursor: "pointer", display: "flex", padding: "2px", borderRadius: "3px" }} onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
            <Trash2 size={13} />
          </button>
          
          <div {...attributes} {...listeners} title="Drag to reorder" style={{ display: "flex", alignItems: "center", cursor: "grab", padding: "2px", color: "#fff" }}>
            <GripVertical size={13} />
          </div>
        </div>
      )}

      {/* ── Hide-on-device overlay ── */}
      {isHiddenInCurrentView && !isGhost && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0, 0, 0, 0.06)",
            borderRadius: "6px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <EyeOff size={18} color="#8c9196" />
          <span style={{ fontSize: "11px", fontWeight: 600, color: "#6d7175", background: "rgba(255,255,255,0.9)", padding: "2px 8px", borderRadius: "4px" }}>
            Hidden on {deviceMode.charAt(0).toUpperCase() + deviceMode.slice(1)}
          </span>
        </div>
      )}

      {/* ── Block Content & Children ── */}
      {PreviewComponent && (
        <div style={{ position: "relative", width: "100%", zIndex: 1, pointerEvents: (isDragging || isGhost) ? "none" : "auto" }}>
          <BlockErrorBoundary>
            <PreviewComponent block={block} isSelected={isSelected} />
          </BlockErrorBoundary>
        </div>
      )}
      {allowsChildren && (
        <div
          style={
            isColumnLayoutNode
              ? { display: "flex", gap: block.settings?.gap || "16px", padding: "8px 0", boxSizing: "border-box", width: "100%" }
              : { position: "relative", minHeight: "40px", padding: isColumnNode ? "4px" : "16px" }
          }
        >
          {block.childrenIds?.map((childId) => (
            <CanvasNode key={childId} id={childId} />
          ))}
          {(!block.childrenIds || block.childrenIds.length === 0) && (
            <div style={{
              textAlign: "center",
              color: "#8c9196",
              fontSize: "13px",
              padding: "24px 0",
              width: "100%",
              border: "2px dashed #e1e3e5",
              borderRadius: "6px",
              background: "#fafbfc"
            }}>
              Drop a block here
            </div>
          )}
        </div>
      )}

      {/* ── Context Menu ── */}
      {contextMenu && (
        <BlockContextMenu
          blockId={id}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onSavePattern={() => {
            setContextMenu(null);
            setShowSavePatternModal(true);
          }}
        />
      )}

      {/* ── Save Pattern Modal ── */}
      {showSavePatternModal && (
        <SavePatternModal
          blockId={id}
          onClose={() => setShowSavePatternModal(false)}
        />
      )}
    </div>
  );
});

export default CanvasNode;

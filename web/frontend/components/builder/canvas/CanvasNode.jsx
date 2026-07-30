import React, { memo, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { useDndContext } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { BlockRegistry, normalizeBlockType } from "../BlockRegistry";
import { useBuilderStore } from "../store/useBuilderStore";
import { GripVertical, Trash2, Copy, ArrowUp, ArrowDown, EyeOff } from "lucide-react";
import BlockErrorBoundary from "../BlockErrorBoundary";
import BlockContextMenu from "./BlockContextMenu";
import SavePatternModal from "../SavePatternModal";
import { getActiveCenterY } from "../utils/treeUtils";

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
  const [justDropped, setJustDropped] = useState(false);
  const isReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!block) return null;

  const type = normalizeBlockType(block.type);
  const isSelected = selectedId === id;
  const isHovered = hoveredId === id;

  const registryEntry = BlockRegistry[type];
  if (!registryEntry) return <div style={{ color: "red" }}>Unknown block: {block.type}</div>;

  const { PreviewComponent, allowsChildren } = registryEntry;

  // dnd-kit setup — single useSortable call to avoid double-registration
  // which causes dnd-kit's internal registry to report inMap: false and
  // hasNodeCurrent: false even though the DOM element exists.
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    activeIndex,
    index,
  } = useSortable({
    id,
    data: {
      type,
      isSection: allowsChildren,
    },
  });

  // Auto-scroll canvas to selected block (e.g. when selected from Layers panel sidebar)
  React.useEffect(() => {
    if (isSelected && !isDragging) {
      const timer = setTimeout(() => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isSelected, id, isDragging]);

  // Track drop settle
  React.useEffect(() => {
    if (isDragging) {
      setJustDropped(false);
    } else if (!isDragging && transform !== null) {
      // The moment isDragging becomes false, but we had a transform (meaning we were dragged)
      setJustDropped(true);
      const timer = setTimeout(() => setJustDropped(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isDragging, transform]);

  const isColumnNode = type === "Column";
  const isColumnLayoutNode = type === "ColumnLayout";

  // ── Visibility hide-on-device ──
  // Determine if this block should show a "hidden on X" overlay in the editor.
  const isHiddenInCurrentView =
    (deviceMode === "mobile" && block.settings?.hideOnMobile) ||
    (deviceMode === "tablet" && block.settings?.hideOnTablet) ||
    (deviceMode === "desktop" && block.settings?.hideOnDesktop);

  let opacity = 1;
  let isPlaceholder = false;
  if (isDragging && !isGhost) {
    opacity = 0.5;
    isPlaceholder = true;
  }
  if (isGhost) opacity = 1;
  if (isHiddenInCurrentView && !isGhost) opacity = 0.35;

  const isSectionNode = type === "Section";
  const isLayoutBlock = isColumnNode || isColumnLayoutNode || isSectionNode;

  // ── Chrome Ownership Rule ──────────────────────────────────────────────────────
  // CanvasNode is the SOLE provider of block-level chrome:
  //   background-color, border, border-radius, box-shadow, outer padding/margin.
  // No PreviewComponent for any block type may apply these to its own root element.
  //
  // EXCEPTION TEST: "Would removing this property destroy the block's fundamental
  // visual identity, or is it just decorative outer framing?"
  // Recognized content-identity exceptions:
  //   - Callout: backgroundColor & borderLeft define what a Callout is visually.
  //   - HeroSection: full-bleed background image/gradient & borderRadius define a Hero banner.
  //   - VideoBlock (loaded): borderRadius on the iframe wrapper for aspect-ratio clip.
  //
  // Visual boundaries (green outline + floating toolbar) appear ONLY on selection/hover.
  // ──────────────────────────────────────────────────────────────────────────────
  // Sibling insertion indicator logic
  // activeIndex and index now come from the single useSortable call above.
  const { over, active } = useDndContext();
  
  // dnd-kit's useSortable isOver is false for external draggables not in the SortableContext array.
  // We MUST check the global over.id instead.
  const isOverNode = over?.id === id;
  const isContainerDropTarget = isOverNode && allowsChildren && !isDragging;
  const isSiblingDropTarget = isOverNode && !allowsChildren && !isDragging;

  let isBelow = false;
  if (isSiblingDropTarget && active && over?.rect) {
    const activeCenter = getActiveCenterY(active);
    const overCenter = over.rect.top + over.rect.height / 2;
    if (activeCenter > 0 && overCenter > 0) {
      isBelow = activeCenter > overCenter;
    } else {
      isBelow = activeIndex !== -1 && activeIndex < index;
    }
  }

  // Use a class name to allow global CSS variables to override behavior
  let className = "canvas-node-wrapper";
  if (isSiblingDropTarget) className += " sibling-drop-target";
  if (isContainerDropTarget) className += " container-drop-target";

  const style = {
    opacity,
    position: "relative",
    outline: isPlaceholder
      ? "2px dashed var(--p-color-border)"
      : isContainerDropTarget
      ? "2px solid #008060"
      : isSelected && !isGhost
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
      ? "0 20px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)"
      : isSelected
      ? "0 0 0 3px rgba(0, 128, 96, 0.15)"
      : "none",
    background: justDropped 
      ? "rgba(0, 128, 96, 0.05)" 
      : isContainerDropTarget
      ? "#f4f8f6"
      : isPlaceholder
      ? "var(--p-color-bg-surface-secondary)"
      : isColumnNode 
      ? "#fafbfc" 
      : "transparent",
    padding: isColumnNode ? "6px" : undefined,
  };

  const spacerStyle = {
    height: isSiblingDropTarget ? "48px" : "0px",
    maxHeight: isSiblingDropTarget ? "48px" : "0px",
    opacity: isSiblingDropTarget ? 1 : 0,
    margin: isSiblingDropTarget ? "8px 0" : "0px",
    border: isSiblingDropTarget ? "2px dashed #008060" : "none",
    background: "#f4f8f6",
    borderRadius: "6px",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#008060",
    fontSize: "13px",
    fontWeight: 500,
    pointerEvents: "none",
    boxSizing: "border-box",
    transition: isReducedMotion
      ? "none"
      : "all 0.2s cubic-bezier(0.18, 0.67, 0.6, 1.22)",
  };

  const SpacerComponent = (
    <div style={spacerStyle}>
      Drop block here
    </div>
  );

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
      id={id}
      style={style}
      className={className}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    >
      {/* Unified Upper Sibling Insertion Indicator */}
      {isSiblingDropTarget && !isBelow && SpacerComponent}
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
        <div style={{ position: "relative", width: "100%", zIndex: 1, pointerEvents: (isDragging || isGhost) ? "none" : "auto", opacity: isPlaceholder ? 0.3 : 1 }}>
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
              color: isContainerDropTarget ? "#008060" : "#8c9196",
              fontSize: "13px",
              padding: "24px 0",
              width: "100%",
              border: isContainerDropTarget ? "2px dashed #008060" : "2px dashed #e1e3e5",
              borderRadius: "6px",
              background: isContainerDropTarget ? "transparent" : "#fafbfc",
              transition: isReducedMotion ? "none" : "all 200ms ease"
            }}>
              {block.type === "Section" ? "Section — Drop blocks here" : "Drop a block here"}
            </div>
          )}
        </div>
      )}

      {/* Unified Lower Sibling Insertion Indicator */}
      {isSiblingDropTarget && isBelow && SpacerComponent}

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

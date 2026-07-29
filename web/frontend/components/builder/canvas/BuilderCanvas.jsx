/**
 * BuilderCanvas.jsx
 *
 * The central drop zone and rendering surface for the builder.
 * Sets up dnd-kit context, sensors, and SortableContext.
 */

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
  KeyboardSensor,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useState } from "react";
import CanvasNode from "./CanvasNode";
import { useBuilderStore } from "../store/useBuilderStore";
import { useShallow } from "zustand/shallow";
import { getTreeIds, resolveDropTarget } from "../utils/treeUtils";
import { BlockRegistry } from "../BlockRegistry";

export default function BuilderCanvas({ deviceMode = "desktop" }) {
  const rootIds = useBuilderStore((s) => s.rootIds);
  const moveBlock = useBuilderStore((s) => s.moveBlock);
  const clearSelection = useBuilderStore((s) => s.clearSelection);
  const [activeId, setActiveId] = useState(null);
  const activeBlock = useBuilderStore((s) => activeId ? s.blocksById[activeId] : null);

  const flatIds = useBuilderStore(useShallow((s) => getTreeIds(s.blocksById, s.rootIds)));


  
  // Need to be careful with sensors in a rich-text editor environment.
  // We use a small activation constraint so clicks in RichText don't instantly trigger drag.
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

  const announcements = {
    onDragStart({ active }) {
      const type = active.data.current?.type || "Block";
      return `Picked up ${type}.`;
    },
    onDragOver({ active, over }) {
      if (over) {
        return `Block over position ${over.id}.`;
      }
      return "Block is over an invalid area.";
    },
    onDragEnd({ active, over }) {
      if (over) {
        return `Block dropped at position ${over.id}.`;
      }
      return "Block drag cancelled.";
    },
    onDragCancel() {
      return "Block drag cancelled.";
    }
  };

  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const overIsSection = over.data.current?.isSection === true;
    
    // Resolve where to drop in the nested tree
    const state = useBuilderStore.getState();
    const target = resolveDropTarget(state.blocksById, state.rootIds, active.id, over.id, overIsSection);
    
    if (target) {
      moveBlock(active.id, target.newParentId, target.newIndex);
    }
  };



  const getCanvasWidth = () => {
    if (deviceMode === "mobile") return "375px";
    if (deviceMode === "tablet") return "640px";
    return "100%";
  };

  return (
    <div
      style={{
        flex: 1,
        width: "100%",
        height: "100%",
        overflowY: "auto",
        backgroundColor: "var(--p-color-bg-surface-secondary)",
        padding: deviceMode === "desktop" ? "24px 32px" : "16px",
        boxSizing: "border-box",
      }}
      onClick={() => clearSelection()} // click outside clears selection
    >
      <div
        style={{
          width: "100%",
          maxWidth: getCanvasWidth(),
          minHeight: "100%",
          margin: "0 auto",
          background: "#ffffff",
          boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          borderRadius: "8px",
          padding: "32px 40px",
          transition: "max-width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          announcements={announcements}
        >
          <SortableContext items={flatIds} strategy={verticalListSortingStrategy}>
            {rootIds.map((id) => (
              <CanvasNode key={id} id={id} />
            ))}
            
            {rootIds.length === 0 && (
              <div
                style={{
                  height: "200px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px dashed #c9cccf",
                  borderRadius: "8px",
                  color: "#6d7175",
                  fontSize: "15px",
                }}
              >
                <div style={{ marginBottom: "12px" }}>Drag and drop blocks here to start building.</div>
                <button
                  type="button"
                  onClick={() => document.querySelector('[title="Blocks"]')?.click()} // Fallback, could be a real prop if needed
                  style={{
                    background: "#008060",
                    color: "white",
                    border: "none",
                    padding: "8px 16px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  Browse Blocks
                </button>
              </div>
            )}
          </SortableContext>

          <DragOverlay>
            {activeBlock ? (
              <div style={{ opacity: 0.8, transform: "scale(1.02)", pointerEvents: "none" }}>
                <CanvasNode id={activeBlock.id} isGhost={true} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}

/**
 * BuilderCanvas.jsx
 *
 * The central drop zone and rendering surface for the builder.
 * Sets up dnd-kit context, sensors, and SortableContext.
 */

import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import CanvasNode from "./CanvasNode";
import { useBuilderStore } from "../store/useBuilderStore";
import { useShallow } from "zustand/shallow";
import { getTreeIds } from "../utils/treeUtils";
import { useDroppable } from "@dnd-kit/core";

export default function BuilderCanvas({ deviceMode = "desktop" }) {
  const rootIds = useBuilderStore((s) => s.rootIds);
  const clearSelection = useBuilderStore((s) => s.clearSelection);
  const flatIds = useBuilderStore(useShallow((s) => getTreeIds(s.blocksById, s.rootIds)));
  const getCanvasWidth = () => {
    if (deviceMode === "mobile") return "375px";
    if (deviceMode === "tablet") return "640px";
    return "100%";
  };

  const { setNodeRef, isOver } = useDroppable({
    id: "canvas-root",
  });

  return (
    <div
      style={{
        flex: 1,
        width: "100%",
        minHeight: "100%",
        backgroundColor: "var(--p-color-bg-surface-secondary)",
        padding: deviceMode === "desktop" ? "24px 32px" : "16px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
      onClick={() => clearSelection()} // click outside clears selection
    >
      <div
        ref={setNodeRef}
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
          border: (isOver && rootIds.length === 0) ? "2px dashed #008060" : "none",
        }}
      >
        <SortableContext items={flatIds} strategy={() => null}>
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
                  background: isOver ? "#f4f8f6" : "transparent",
                  color: "#6d7175",
                  fontSize: "15px",
                  transition: "all 0.2s ease",
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
      </div>
    </div>
  );
}

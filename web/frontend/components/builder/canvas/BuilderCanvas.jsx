/**
 * BuilderCanvas.jsx
 *
 * The central drop zone and rendering surface for the builder.
 * Sets up dnd-kit context, sensors, and SortableContext.
 */

import { useEffect, useState } from "react";
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

  // Mirrors the --blogger-* CSS variables that EditorContentCompiler.generateStyles()
  // injects into published output, so block previews using var(--blogger-...) resolve
  // to the shop's real configured colors while editing, not just at publish time.
  const [themeVars, setThemeVars] = useState(null);
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(({ settings }) => {
        if (!settings) return;
        setThemeVars({
          "--blogger-primary-color": settings.primaryColor || "#008060",
          "--blogger-secondary-color": settings.secondaryColor || "#005bd3",
          "--blogger-text-color": settings.textColor || "#202223",
        });
      })
      .catch(() => {});
  }, []);

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
          ...themeVars,
        }}
      >
        <SortableContext items={flatIds} strategy={() => null}>
            {rootIds.map((id) => (
              <CanvasNode key={id} id={id} />
            ))}
            
            {rootIds.length === 0 && (
              <div
                style={{
                  height: "220px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px dashed #c9cccf",
                  borderRadius: "8px",
                  background: isOver ? "#f4f8f6" : "#fafbfc",
                  color: "#6d7175",
                  fontSize: "15px",
                  transition: "all 0.2s ease",
                }}
              >
                <div style={{ marginBottom: "12px", fontWeight: 500 }}>Your article is empty. Drag and drop blocks here to start building.</div>
                <button
                  type="button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent("builder:switch-tab", { detail: 0 }));
                    document.getElementById("builder-tab-blocks")?.click();
                    setTimeout(() => {
                      document.querySelector('input[placeholder*="Search blocks"]')?.focus();
                    }, 50);
                  }}
                  style={{
                    background: "#008060",
                    color: "white",
                    border: "none",
                    padding: "9px 18px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 600,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    transition: "all 0.15s ease",
                  }}
                >
                  Browse & Add Blocks
                </button>
              </div>
            )}
          </SortableContext>
      </div>
    </div>
  );
}

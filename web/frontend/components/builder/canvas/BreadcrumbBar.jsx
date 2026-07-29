/**
 * BreadcrumbBar.jsx
 *
 * Shows the ancestor chain for the currently selected block so users can
 * navigate up through nested containers without hunting on the canvas.
 *
 * e.g.  Section > ColumnLayout > Column > RichText
 *        ^click^    ^click^       ^click^   (current)
 *
 * Accessibility: uses real <button> elements with visible :focus-visible
 * outlines so keyboard users can Tab through the trail and press Enter to jump
 * to any ancestor — consistent with P0's keyboard-operability contract.
 */

import { useBuilderStore } from "../store/useBuilderStore";
import { BlockRegistry } from "../BlockRegistry";
import { ChevronRight } from "lucide-react";

export default function BreadcrumbBar() {
  const selectedBlockId = useBuilderStore((s) => s.selectedBlockId);
  const blocksById = useBuilderStore((s) => s.blocksById);
  const selectBlock = useBuilderStore((s) => s.selectBlock);

  if (!selectedBlockId) return null;

  // Build ancestor chain from selected block up to root
  const chain = [];
  let current = blocksById[selectedBlockId];
  while (current) {
    chain.unshift(current);
    current = current.parentId ? blocksById[current.parentId] : null;
  }

  // Only show the bar when there is at least one ancestor
  if (chain.length <= 1) return null;

  return (
    <div
      role="navigation"
      aria-label="Block breadcrumb"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "2px",
        padding: "6px 16px",
        borderBottom: "1px solid #e1e3e5",
        background: "#fafbfc",
        flexWrap: "wrap",
        minHeight: "34px",
      }}
    >
      {chain.map((block, i) => {
        const isLast = i === chain.length - 1;
        const entry = BlockRegistry[block.type];
        const label = entry?.label || block.type;

        return (
          <span key={block.id} style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            <button
              onClick={() => selectBlock(block.id)}
              disabled={isLast}
              aria-current={isLast ? "true" : undefined}
              title={isLast ? `Current: ${label}` : `Select ${label}`}
              style={{
                background: "none",
                border: "none",
                padding: "2px 6px",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: isLast ? 600 : 400,
                color: isLast ? "#008060" : "#5c5f62",
                cursor: isLast ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                // Visible focus ring for keyboard users
                outline: "none",
              }}
              onFocus={(e) => { if (!isLast) e.currentTarget.style.boxShadow = "0 0 0 2px #008060"; }}
              onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
              onMouseEnter={(e) => { if (!isLast) e.currentTarget.style.background = "#f1f2f3"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
            >
              {entry?.icon && (
                <span style={{ display: "flex", alignItems: "center", opacity: 0.7 }}>
                  {entry.icon}
                </span>
              )}
              {label}
            </button>
            {!isLast && (
              <ChevronRight size={12} color="#c9cccf" aria-hidden="true" />
            )}
          </span>
        );
      })}
    </div>
  );
}

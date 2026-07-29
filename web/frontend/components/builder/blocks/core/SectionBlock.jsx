/**
 * SectionBlock.jsx
 *
 * The Section block is the only container block in the Builder.
 * Children are rendered inside it — Section blocks can hold any
 * other block type as children.
 *
 * SectionBlockPreview is used in the BlockRegistry for the canvas
 * preview of a Section that has no children yet.
 */

export function SectionBlockPreview({ block }) {
  const s = block?.settings ?? {};
  return (
    <div
      style={{
        backgroundColor: s.backgroundColor || "#ffffff",
        borderRadius: s.borderRadius || "0px",
        padding: "24px",
        border: "2px dashed #c9cccf",
        minHeight: "80px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#8c9196",
        fontSize: "13px",
      }}
    >
      Section — drop blocks here
    </div>
  );
}

/**
 * The actual canvas render of a Section with children is handled by
 * CanvasNode.jsx which renders the children recursively.
 * This file just exports SectionBlockPreview for the block picker and
 * the BlockRegistry's PreviewComponent.
 */
export default SectionBlockPreview;

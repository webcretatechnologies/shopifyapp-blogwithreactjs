/** SpacerBuilderBlock.jsx */
export function SpacerBuilderPreview({ block }) {
  const height = block?.settings?.height || "40px";
  return (
    <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Visual indicator of spacer height in builder mode */}
      <div style={{ borderLeft: "2px dashed #c9cccf", height: "100%", width: "2px" }} />
    </div>
  );
}
export default SpacerBuilderPreview;

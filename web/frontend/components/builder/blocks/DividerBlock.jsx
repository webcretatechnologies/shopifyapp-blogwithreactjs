/** DividerBlock.jsx — styled horizontal rule block for the Builder canvas. */

export function DividerBlockPreview({ block }) {
  const s = block?.settings ?? {};
  return (
    <div style={{ padding: "8px 0" }}>
      <hr
        style={{
          border: "none",
          borderTop: `${s.thickness || "1px"} ${s.style || "solid"} ${s.color || "#e1e3e5"}`,
          width: s.width || "100%",
          margin: "0 auto",
        }}
      />
    </div>
  );
}

export default DividerBlockPreview;

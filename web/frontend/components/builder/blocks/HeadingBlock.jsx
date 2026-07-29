/** HeadingBlock.jsx — standalone heading block for the Builder canvas. */

export function HeadingBlockPreview({ block }) {
  const s = block?.settings ?? {};
  const Tag = `h${s.level || 2}`;
  return (
    <div style={{ padding: "4px 0" }}>
      <Tag
        style={{
          textAlign: s.align || "left",
          color: s.color || "#202223",
          fontSize: s.fontSize || undefined,
          margin: 0,
          fontWeight: 700,
          lineHeight: 1.4,
        }}
      >
        {s.text || "Heading"}
      </Tag>
    </div>
  );
}

export default HeadingBlockPreview;

/** HeadingBlock.jsx — standalone heading block for the Builder canvas. */

export function HeadingBlockPreview({ block }) {
  const s = block?.settings ?? {};
  const level = s.level || 2;
  const Tag = `h${level}`;
  
  const defaultSizes = {
    1: "2.5em",
    2: "2em",
    3: "1.75em",
    4: "1.5em",
    5: "1.25em",
    6: "1em",
  };

  return (
    <div style={{ padding: "4px 0" }}>
      <Tag
        style={{
          textAlign: s.align || "left",
          color: s.color || "#202223",
          fontSize: s.fontSize || defaultSizes[level],
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

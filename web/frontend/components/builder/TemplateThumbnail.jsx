/**
 * Abstract, data-driven visual mockup for a blog template card — no real photography needed.
 * Renders flat rectangles/lines that echo the template's actual content shape (hero band,
 * columns, table, FAQ rows, product strip) using the template's `accent` color, so each card in
 * the gallery reads as a distinct "mini article preview" at a glance, similar to native page-
 * builder template pickers.
 */
export default function TemplateThumbnail({ accent = "#303030", preview = {} }) {
  const { hero, columns, lines = 2, hasTable, hasFaq, hasProducts, hasSteps } = preview;
  const tint = `${accent}22`;
  const tintStrong = `${accent}55`;

  return (
    <div
      style={{
        background: "#fbfaf8",
        border: "1px solid #ecebe9",
        borderRadius: "8px",
        padding: "10px",
        height: "140px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        overflow: "hidden",
      }}
    >
      {hero && (
        <div
          style={{
            height: "38%",
            borderRadius: "5px",
            background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <div style={{ width: "55%", height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.85)" }} />
        </div>
      )}

      {!hero && (
        <div style={{ width: "50%", height: "7px", borderRadius: "3px", background: "#d7d5d2", flexShrink: 0 }} />
      )}

      {columns === 2 ? (
        <div style={{ display: "flex", gap: "6px", flex: 1 }}>
          <div style={{ flex: 1, borderRadius: "4px", background: tint }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px", justifyContent: "center" }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ height: "4px", borderRadius: "2px", background: "#e3e1de", width: `${90 - i * 15}%` }} />
            ))}
          </div>
        </div>
      ) : hasTable ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "3px", flex: 1 }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={{ borderRadius: "2px", background: i < 3 ? tintStrong : "#efeeec", border: "1px solid #e3e1de" }} />
          ))}
        </div>
      ) : hasFaq ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px", flex: 1, justifyContent: "center" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: accent, flexShrink: 0 }} />
              <div style={{ height: "4px", borderRadius: "2px", background: "#e3e1de", width: "75%" }} />
            </div>
          ))}
        </div>
      ) : hasSteps ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px", flex: 1, justifyContent: "center" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <div
                style={{
                  width: "13px", height: "13px", borderRadius: "4px", background: tintStrong,
                  color: accent, fontSize: "8px", fontWeight: 700, display: "flex",
                  alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <div style={{ height: "4px", borderRadius: "2px", background: "#e3e1de", width: `${80 - i * 10}%` }} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "5px", flex: 1, justifyContent: "center" }}>
          {Array.from({ length: Math.min(lines, 4) }).map((_, i) => (
            <div key={i} style={{ height: "4px", borderRadius: "2px", background: "#e3e1de", width: `${92 - i * 12}%` }} />
          ))}
        </div>
      )}

      {hasProducts && (
        <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: "18px", borderRadius: "3px", background: i === 0 ? tintStrong : tint }} />
          ))}
        </div>
      )}
    </div>
  );
}

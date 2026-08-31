/**
 * Mini article mock used on template cards. CSS-only — no stock photos.
 * Signature: colored TOC panel (Blogger-style), optional hero, title type, product strip.
 */
export default function TemplateMiniPreview({
  style = {},
  preview = {},
  height = 186,
}) {
  const accent = style.accent || "#1f6b4a";
  const tocBg = style.tocBg || accent;
  const tocFg = style.tocFg || "#ffffff";
  const headingFont =
    style.headingFont === "serif"
      ? "Georgia, 'Times New Roman', serif"
      : "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const hero = preview.hero || "none";
  const showToc = preview.toc !== false;
  const columns = preview.columns === 2 ? 2 : 1;
  const products = Number(preview.products) || 0;
  const steps = Number(preview.steps) || 0;

  return (
    <div
      style={{
        height,
        background: "#fbfaf7",
        borderRadius: "8px",
        padding: "10px 11px",
        display: "flex",
        flexDirection: "column",
        gap: "7px",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {hero !== "none" && (
        <div
          style={{
            height: hero === "gradient" ? 36 : 44,
            borderRadius: "5px",
            flexShrink: 0,
            background:
              hero === "gradient"
                ? `linear-gradient(135deg, ${accent}, ${accent}99)`
                : `linear-gradient(120deg, ${accent}cc 0%, #c4b5a5 42%, ${accent}66 100%)`,
          }}
        />
      )}

      <div
        style={{
          fontFamily: headingFont,
          fontSize: "11px",
          fontWeight: 700,
          color: "#1a1a1a",
          letterSpacing: headingFont.includes("Georgia") ? "0" : "-0.02em",
          lineHeight: 1.2,
        }}
      >
        <div
          style={{
            height: 8,
            width: "78%",
            borderRadius: 2,
            background: "#2a2a2a",
            opacity: 0.85,
          }}
        />
        <div
          style={{
            height: 7,
            width: "52%",
            borderRadius: 2,
            background: "#2a2a2a",
            opacity: 0.45,
            marginTop: 4,
          }}
        />
      </div>

      {showToc && (
        <div
          style={{
            background: tocBg,
            color: tocFg,
            borderRadius: 5,
            padding: "7px 8px",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              height: 4,
              width: "42%",
              borderRadius: 2,
              background: tocFg,
              opacity: 0.95,
              marginBottom: 6,
            }}
          />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 3,
                width: `${72 - i * 12}%`,
                borderRadius: 2,
                background: tocFg,
                opacity: 0.55,
                marginBottom: 3,
              }}
            />
          ))}
        </div>
      )}

      {columns === 2 ? (
        <div style={{ display: "flex", gap: 6, flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, borderRadius: 4, background: `${accent}22` }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, justifyContent: "center" }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  height: 4,
                  width: `${90 - i * 14}%`,
                  borderRadius: 2,
                  background: "#e4e2de",
                }}
              />
            ))}
          </div>
        </div>
      ) : steps > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, justifyContent: "center" }}>
          {Array.from({ length: Math.min(steps, 4) }).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: `${accent}33`,
                  color: accent,
                  fontSize: 8,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              <div
                style={{
                  height: 4,
                  width: `${80 - i * 10}%`,
                  borderRadius: 2,
                  background: "#e4e2de",
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, justifyContent: "center" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                height: 4,
                width: `${88 - i * 14}%`,
                borderRadius: 2,
                background: "#e4e2de",
              }}
            />
          ))}
        </div>
      )}

      {products > 0 && (
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {Array.from({ length: Math.min(products, 4) }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 22,
                borderRadius: 4,
                background: i === 0 ? `${accent}55` : `${accent}22`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

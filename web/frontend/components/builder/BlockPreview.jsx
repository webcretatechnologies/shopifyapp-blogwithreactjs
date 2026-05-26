/**
 * BlockPreview — Read-only preview of a block inside the canvas.
 * Shows a rough visual representation of the block content.
 */
export default function BlockPreview({ block }) {
  switch (block.type) {
    case "heading":
      return (
        <div
          style={{
            fontSize:
              block.level === "h1"
                ? "24px"
                : block.level === "h2"
                  ? "20px"
                  : "16px",
            fontWeight: "700",
            color: block.color || "#202223",
            textAlign: block.align || "left",
          }}
        >
          {block.content || "Heading"}
        </div>
      );

    case "text":
      return (
        <div
          style={{
            fontSize: "14px",
            color: "#3f4248",
            lineHeight: "1.6",
            maxHeight: "80px",
            overflow: "hidden",
          }}
          dangerouslySetInnerHTML={{
            __html: block.content || "<p>Text block</p>",
          }}
        />
      );

    case "image":
      return block.src ? (
        <img
          src={block.src}
          alt={block.alt || ""}
          style={{
            maxWidth: "100%",
            maxHeight: "120px",
            objectFit: "cover",
            borderRadius: "4px",
          }}
        />
      ) : (
        <div
          style={{
            background: "#f1f2f3",
            borderRadius: "4px",
            height: "80px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#6d7175",
            fontSize: "12px",
          }}
        >
          🖼 Image placeholder
        </div>
      );

    case "video":
      return (
        <div
          style={{
            background: "#000",
            borderRadius: "4px",
            height: "70px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: "14px",
            gap: "8px",
          }}
        >
          ▶️ {block.url ? "Video embedded" : "Add a YouTube/Vimeo URL"}
        </div>
      );

    case "product":
      return (
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: "#f1f2f3",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
            }}
          >
            🛍
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "600" }}>
              {block.title || "Select a product"}
            </div>
            {block.price && (
              <div style={{ fontSize: "12px", color: "#008060" }}>
                ${block.price}
              </div>
            )}
          </div>
        </div>
      );

    case "product_slider":
      return (
        <div>
          <div
            style={{ fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}
          >
            {block.title || "Product Slider"}
          </div>
          <div style={{ display: "flex", gap: "6px", overflow: "hidden" }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  width: 60,
                  height: 60,
                  background: "#f1f2f3",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                }}
              >
                🛍
              </div>
            ))}
          </div>
        </div>
      );

    case "product_sidebar":
      return (
        <div
          style={{
            display: "flex",
            gap: "16px",
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1", minWidth: "120px" }}>
            <div style={{ fontSize: "13px", fontWeight: "600" }}>
              {block.title || "Section Title"}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "#6d7175",
                marginTop: "4px",
                overflow: "hidden",
                maxHeight: "32px",
              }}
            >
              {block.data || "Description text..."}
            </div>
          </div>
          <div
            style={{
              width: 80,
              height: 90,
              background: "#f1f2f3",
              borderRadius: "6px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              color: "#6d7175",
              gap: "2px",
            }}
          >
            <span style={{ fontSize: "20px" }}>📌</span>
            <span>Sticky</span>
            <span style={{ fontSize: "8px", opacity: 0.7 }}>
              {block.side === "below"
                ? "Below"
                : block.side === "left"
                  ? "Left"
                  : "Right"}
            </span>
          </div>
        </div>
      );

    case "product_switcher": {
      const sections = block.sections || [];
      return (
        <div>
          <div
            style={{ fontSize: "13px", fontWeight: "600", marginBottom: "6px" }}
          >
            Product Switcher
          </div>
          {sections.length === 0 ? (
            <div style={{ fontSize: "12px", color: "#6d7175" }}>
              Add sections to the switcher
            </div>
          ) : (
            <div style={{ display: "flex", gap: "6px" }}>
              {sections.slice(0, 3).map((s, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    padding: "6px",
                    background: "#f9fafb",
                    borderRadius: "4px",
                    fontSize: "11px",
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontWeight: "600",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.title || `Point ${i + 1}`}
                  </div>
                  <div
                    style={{
                      color: "#6d7175",
                      fontSize: "10px",
                      marginTop: "2px",
                    }}
                  >
                    {s.product ? "✅ Product" : "⬜ No product"}
                  </div>
                </div>
              ))}
              {sections.length > 3 && (
                <div
                  style={{
                    fontSize: "11px",
                    color: "#6d7175",
                    alignSelf: "center",
                  }}
                >
                  +{sections.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    case "featured_product":
      return (
        <div
          style={{
            display: "flex",
            gap: "16px",
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: "1", minWidth: "120px" }}>
            <div
              style={{
                fontSize: "12px",
                color: "#6b7280",
                fontWeight: "600",
                letterSpacing: "0.05em",
              }}
            >
              {block.badge || "FEATURED HERE"}
            </div>
            <div
              style={{ fontSize: "13px", fontWeight: "600", marginTop: "2px" }}
            >
              {block.title || "Section Title"}
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "#6d7175",
                marginTop: "4px",
                overflow: "hidden",
                maxHeight: "32px",
              }}
            >
              {block.data || "Description text..."}
            </div>
          </div>
          <div
            style={{
              width: 80,
              height: 90,
              background: "linear-gradient(135deg, #fef3c7, #fde68a)",
              borderRadius: "6px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "10px",
              color: "#92400e",
              gap: "2px",
            }}
          >
            <span style={{ fontSize: "20px" }}>⭐</span>
            <span>Featured</span>
          </div>
        </div>
      );

    case "cta_button":
      return (
        <div style={{ textAlign: block.align || "center" }}>
          <span
            style={{
              display: "inline-block",
              padding: "8px 20px",
              background: block.color || "#008060",
              color: block.textColor || "#fff",
              borderRadius: "6px",
              fontSize: "13px",
              fontWeight: "600",
            }}
          >
            {block.text || "Button"}
          </span>
        </div>
      );

    case "divider":
      return (
        <hr
          style={{
            border: "none",
            borderTop: `1px ${block.style || "solid"} ${block.color || "#e1e3e5"}`,
            margin: `${block.margin || "16px"} 0`,
          }}
        />
      );

    case "spacer":
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: block.height || "40px",
            background:
              "repeating-linear-gradient(45deg, #f1f2f3, #f1f2f3 4px, #fff 4px, #fff 16px)",
            borderRadius: "4px",
          }}
        >
          <span
            style={{
              fontSize: "10px",
              color: "#babec3",
              background: "#fff",
              padding: "0 6px",
            }}
          >
            SPACER — {block.height || "40px"}
          </span>
        </div>
      );

    case "html":
      return (
        <div
          style={{
            background: "#1e1e1e",
            borderRadius: "4px",
            padding: "8px 10px",
            fontFamily: "monospace",
            fontSize: "11px",
            color: "#9cdcfe",
            whiteSpace: "pre",
            overflow: "hidden",
            maxHeight: "70px",
          }}
        >
          {block.code || "<!-- HTML Block -->"}
        </div>
      );

    default:
      return (
        <div style={{ fontSize: "13px", color: "#6d7175" }}>
          Unknown block type: {block.type}
        </div>
      );
  }
}

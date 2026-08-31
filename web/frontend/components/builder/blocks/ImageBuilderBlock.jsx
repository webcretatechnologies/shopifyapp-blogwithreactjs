/** ImageBuilderBlock.jsx */
import { Icon } from "@shopify/polaris";
import { ImageWithTextOverlayIcon } from "@shopify/polaris-icons";

export function ImageBuilderPreview({ block }) {
  const s = block?.settings ?? {};
  
  if (!s.src) {
    return (
      <div
        style={{
          padding: "24px 16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#6d7175",
          backgroundColor: "#f4f6f8",
          border: "1px dashed #c9cccf",
          borderRadius: "4px",
          boxSizing: "border-box",
          width: s.width || "100%",
          margin: s.alignment === "center" ? "0 auto" : s.alignment === "right" ? "0 0 0 auto" : "0",
        }}
      >
        <Icon source={ImageWithTextOverlayIcon} color="subdued" />
        <span style={{ marginTop: "8px", fontSize: "13px" }}>Upload or select an image</span>
      </div>
    );
  }

  // compileBlocksToHtml.js and EditorContentCompiler.js both read settings.height/objectFit
  // (default height "auto", objectFit "cover") — this canvas preview silently ignored both, so
  // an explicit height meant to keep two side-by-side images level (e.g. a comparison template)
  // took effect in every real render except the one the merchant actually edits against.
  const img = (
    <img
      src={s.src}
      alt={s.alt || ""}
      style={{
        width: s.width || "100%",
        height: s.height || "auto",
        objectFit: s.objectFit || "cover",
        borderRadius: s.borderRadius ? `${s.borderRadius}px` : "0",
        display: "block",
      }}
    />
  );

  return (
    <div style={{ textAlign: s.alignment || "left" }}>
      {s.linkUrl ? <a href={s.linkUrl} onClick={e => e.preventDefault()} style={{ display: "inline-block" }}>{img}</a> : img}
      {s.caption && <p style={{ fontSize: "13px", color: "#6d7175", marginTop: "8px", textAlign: "center" }}>{s.caption}</p>}
    </div>
  );
}
export default ImageBuilderPreview;

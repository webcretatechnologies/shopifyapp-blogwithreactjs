/** A stable, uncropped article thumbnail for resource lists. */
export default function PostThumbnail({ src, alt = "" }) {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        background: "#f1f2f3",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
        />
      ) : (
        <span aria-hidden="true" style={{ fontSize: 18 }}>📝</span>
      )}
    </div>
  );
}

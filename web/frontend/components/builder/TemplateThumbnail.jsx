import TemplateMiniPreview from "./TemplateMiniPreview";

/** Back-compat wrapper — gallery cards should use TemplateMiniPreview / TemplateGalleryCard. */
export default function TemplateThumbnail({ accent = "#303030", preview = {}, style }) {
  const resolvedStyle = style || {
    accent,
    tocBg: accent,
    tocFg: "#ffffff",
    headingFont: "sans",
  };
  return <TemplateMiniPreview style={resolvedStyle} preview={preview} />;
}

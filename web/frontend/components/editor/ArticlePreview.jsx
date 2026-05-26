import { useState } from "react";
import { Modal, Box, Text, InlineStack, Button, Icon } from "@shopify/polaris";
import { DesktopIcon, MobileIcon } from "@shopify/polaris-icons";
import BlockPreview from "../builder/BlockPreview";

export default function ArticlePreview({
  open,
  onClose,
  title,
  author,
  featuredImage,
  contentHtml,
  contentJson,
  editorMode, // 'wysiwyg' | 'builder'
}) {
  const [device, setDevice] = useState("desktop"); // 'desktop' | 'mobile'

  const containerStyle = {
    margin: "0 auto",
    backgroundColor: "#fff",
    transition: "width 0.3s ease",
    width: device === "desktop" ? "100%" : "375px",
    maxWidth: device === "desktop" ? "900px" : "375px",
    minHeight: "600px",
    border: device === "mobile" ? "12px solid #333" : "none",
    borderRadius: device === "mobile" ? "36px" : "0",
    overflow: "hidden",
    boxShadow: device === "mobile" ? "0 20px 40px rgba(0,0,0,0.2)" : "none",
    position: "relative",
  };

  const headerStyle = {
    padding: device === "desktop" ? "60px 40px 40px" : "40px 20px 20px",
    textAlign: "center",
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Live Preview"
      large
      fullScreen
    >
      <div style={{ backgroundColor: "#f4f6f8", minHeight: "100%", padding: "20px 0" }}>
        {/* Toolbar */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px", gap: "10px" }}>
          <Button
            pressed={device === "desktop"}
            onClick={() => setDevice("desktop")}
            icon={DesktopIcon}
          >
            Desktop
          </Button>
          <Button
            pressed={device === "mobile"}
            onClick={() => setDevice("mobile")}
            icon={MobileIcon}
          >
            Mobile
          </Button>
        </div>

        {/* Canvas */}
        <div style={{ display: "flex", justifyContent: "center", paddingBottom: "60px" }}>
          <div style={containerStyle}>
            {/* Storefront Header Mock */}
            <div style={headerStyle}>
              {/* Tags/Categories could go here */}
              <h1 style={{ 
                fontSize: device === "desktop" ? "42px" : "28px", 
                fontWeight: "700", 
                lineHeight: "1.2",
                marginBottom: "20px",
                color: "#121212"
              }}>
                {title || "Untitled Article"}
              </h1>
              <p style={{ color: "#757575", fontSize: "14px" }}>
                {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                {author && ` • ${author}`}
              </p>
            </div>

            {/* Featured Image */}
            {featuredImage && (
              <div style={{ padding: device === "desktop" ? "0 40px" : "0", marginBottom: "40px" }}>
                <img 
                  src={featuredImage} 
                  alt={title} 
                  style={{ 
                    width: "100%", 
                    maxHeight: "500px", 
                    objectFit: "cover",
                    borderRadius: device === "desktop" ? "8px" : "0"
                  }} 
                />
              </div>
            )}

            {/* Content */}
            <div style={{ 
              padding: device === "desktop" ? "0 80px 80px" : "0 20px 60px",
              fontSize: "16px",
              lineHeight: "1.8",
              color: "#333",
              fontFamily: "system-ui, -apple-system, sans-serif"
            }}>
              {editorMode === "wysiwyg" ? (
                <div 
                  className="tiptap-preview-content"
                  dangerouslySetInnerHTML={{ __html: contentHtml || "<p>Start writing to see preview...</p>" }} 
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px"
                  }}
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                  {contentJson?.length > 0 ? (
                    contentJson.map((block, idx) => (
                      <div key={block.id || idx}>
                        <BlockPreview block={block} />
                      </div>
                    ))
                  ) : (
                    <p style={{ color: "#757575", textAlign: "center" }}>Add blocks to see preview...</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

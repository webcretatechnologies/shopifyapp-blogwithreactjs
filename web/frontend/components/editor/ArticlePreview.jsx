import { useState, useRef, useEffect } from "react";
import { Modal, InlineStack, Button } from "@shopify/polaris";
import { DesktopIcon, MobileIcon, TabletIcon } from "@shopify/polaris-icons";
import { PREVIEW_CONTENT_CSS } from "./previewContentCss";

export default function ArticlePreview({
  open,
  onClose,
  title,
  author,
  featuredImage,
  contentHtml,
}) {
  const [device, setDevice] = useState("desktop"); // 'desktop' | 'tablet' | 'mobile'
  const scrollRef = useRef(null);

  // Inject scoped styles once when modal opens
  useEffect(() => {
    if (!open) return;
    const id = "blogger-preview-content-styles";
    let styleEl = document.getElementById(id);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = id;
      styleEl.textContent = PREVIEW_CONTENT_CSS;
      document.head.appendChild(styleEl);
    }
    return () => {
      // Clean up on unmount
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, [open]);

  // Scroll to top when switching devices
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [device]);

  // Dynamically resize the modal dialog based on device selection
  useEffect(() => {
    if (!open) return;
    const id = "blogger-preview-modal-sizing";
    let styleEl = document.getElementById(id);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = id;
      document.head.appendChild(styleEl);
    }
    const dialogWidth = device === "mobile" ? "410px" : device === "tablet" ? "820px" : "960px";
    styleEl.textContent = `
      @media (min-width: 844px) {
        .Polaris-Modal-Dialog__Modal {
          max-width: ${dialogWidth} !important;
          width: ${dialogWidth} !important;
          transition: max-width 0.3s ease, width 0.3s ease !important;
        }
      }
    `;
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, [device, open]);

  const isMobile = device === "mobile";
  const isTablet = device === "tablet";

  const deviceWidth = isMobile ? 375 : isTablet ? 768 : 900;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Live Preview"
      size="large"
      fullScreen={device === "desktop"}
    >
      <div
        style={{
          backgroundColor: "#f0f2f4",
          minHeight: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Toolbar ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "16px 20px",
            backgroundColor: "#fff",
            borderBottom: "1px solid #e1e3e5",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <InlineStack gap="200" align="center">
            <Button
              pressed={device === "desktop"}
              onClick={() => setDevice("desktop")}
              icon={DesktopIcon}
            >
              Desktop
            </Button>
            <Button
              pressed={device === "tablet"}
              onClick={() => setDevice("tablet")}
              icon={TabletIcon}
            >
              Tablet
            </Button>
            <Button
              pressed={device === "mobile"}
              onClick={() => setDevice("mobile")}
              icon={MobileIcon}
            >
              Mobile
            </Button>
            <span
              style={{
                fontSize: "12px",
                color: "#6d7175",
                marginLeft: "8px",
              }}
            >
              {deviceWidth}px
            </span>
          </InlineStack>
        </div>

        {/* ── Canvas (scrollable area) ── */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            justifyContent: "center",
            padding: isMobile ? "24px 16px" : isTablet ? "28px 20px" : "32px 24px",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: `${deviceWidth}px`,
              backgroundColor: "#fff",
              borderRadius: isMobile ? "24px" : isTablet ? "16px" : "12px",
              boxShadow: isMobile
                ? "0 8px 32px rgba(0,0,0,0.18), 0 0 0 12px #1a1a1a"
                : isTablet
                  ? "0 8px 32px rgba(0,0,0,0.14), 0 0 0 4px #555"
                  : "0 4px 24px rgba(0,0,0,0.1)",
              transition: "max-width 0.3s ease, border-radius 0.3s ease",
            }}
          >
            {/* ── Inner content wrapper ── */}
            <div style={{ overflow: "hidden", borderRadius: isMobile ? "24px 24px 0 0" : isTablet ? "16px 16px 0 0" : 0 }}>

            {/* ── Mobile status bar mock ── */}
            {isMobile && (
              <div
                style={{
                  background: "#1a1a1a",
                  padding: "8px 20px 4px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  color: "#fff",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                <span>9:41</span>
                <span style={{ fontSize: "10px" }}>●●●</span>
              </div>
            )}

            {/* ── Article header ── */}
            <div
              style={{
                padding: isMobile
                  ? "24px 20px 16px"
                  : isTablet
                    ? "36px 36px 24px"
                    : "48px 48px 32px",
                textAlign: "center",
                borderBottom:
                  (title || featuredImage) && contentHtml
                    ? "1px solid #f1f2f3"
                    : "none",
              }}
            >
              {title && (
                <h1
                  style={{
                    fontSize: isMobile ? "24px" : isTablet ? "30px" : "36px",
                    fontWeight: "800",
                    lineHeight: "1.2",
                    marginBottom: "12px",
                    color: "#121212",
                    letterSpacing: "-0.02em",
                    margin: "0 0 12px",
                  }}
                >
                  {title}
                </h1>
              )}
              {(author || true) && (
                <p
                  style={{
                    color: "#6d7175",
                    fontSize: "14px",
                    margin: 0,
                    lineHeight: "1.5",
                  }}
                >
                  {new Date().toLocaleDateString("en-US", {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {author && (
                    <>
                      {" · "}
                      <span style={{ fontWeight: 600, color: "#333" }}>
                        {author}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>

            {/* ── Featured image ── */}
            {featuredImage && (
              <div
                style={{
                  padding: isMobile ? "0" : isTablet ? "0 36px" : "0 48px",
                  marginBottom: isMobile ? "24px" : "32px",
                }}
              >
                <img
                  src={featuredImage}
                  alt={title}
                  style={{
                    width: "100%",
                    maxHeight: isMobile ? "280px" : isTablet ? "380px" : "480px",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </div>
            )}

            {/* ── Article content ── */}
            <div
              style={{
                padding: isMobile
                  ? "0 20px 40px"
                  : isTablet
                    ? "0 36px 48px"
                    : "0 48px 60px",
              }}
            >
              {contentHtml ? (
                <div
                  className="blogger-preview-content"
                  dangerouslySetInnerHTML={{ __html: contentHtml }}
                />
              ) : (
                <div
                  style={{
                    padding: "60px 20px",
                    textAlign: "center",
                    color: "#91979e",
                  }}
                >
                  <div style={{ fontSize: "48px", marginBottom: "12px" }}>
                    ✍️
                  </div>
                  <p style={{ fontSize: "15px", margin: 0 }}>
                    Start writing in the editor to see a live preview
                  </p>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

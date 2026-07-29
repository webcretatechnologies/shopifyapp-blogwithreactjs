import { useState, useRef, useEffect } from "react";
import { Modal, InlineStack, Button } from "@shopify/polaris";
import { DesktopIcon, MobileIcon, TabletIcon } from "@shopify/polaris-icons";

/* ── Preview content styles (scoped via unique class) ──────────────────────── */
const PREVIEW_CONTENT_CSS = `
/* ── Base typography ──────────────────────────────────────────── */
.blogger-preview-content {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.75;
  color: #202223;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* ── Headings ─────────────────────────────────────────────────── */
.blogger-preview-content h1 {
  font-size: 2em;
  font-weight: 800;
  line-height: 1.25;
  margin: 1.2em 0 0.6em;
  color: #121212;
  letter-spacing: -0.02em;
}
.blogger-preview-content h2 {
  font-size: 1.6em;
  font-weight: 700;
  line-height: 1.3;
  margin: 1.1em 0 0.5em;
  color: #121212;
  letter-spacing: -0.01em;
}
.blogger-preview-content h3 {
  font-size: 1.3em;
  font-weight: 600;
  line-height: 1.35;
  margin: 1em 0 0.4em;
  color: #202223;
}
.blogger-preview-content h4 {
  font-size: 1.1em;
  font-weight: 600;
  line-height: 1.4;
  margin: 0.8em 0 0.3em;
  color: #202223;
}
.blogger-preview-content h5,
.blogger-preview-content h6 {
  font-size: 1em;
  font-weight: 600;
  line-height: 1.4;
  margin: 0.6em 0 0.3em;
  color: #6d7175;
}

/* ── Paragraphs ───────────────────────────────────────────────── */
.blogger-preview-content p {
  margin: 0 0 1.2em;
  line-height: 1.75;
}
.blogger-preview-content p:last-child {
  margin-bottom: 0;
}

/* ── Links ────────────────────────────────────────────────────── */
.blogger-preview-content a {
  color: #008060;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.15s ease;
}
.blogger-preview-content a:hover {
  color: #006e52;
}

/* ── Lists ────────────────────────────────────────────────────── */
.blogger-preview-content ul,
.blogger-preview-content ol {
  margin: 0 0 1.2em;
  padding-left: 1.8em;
}
.blogger-preview-content ul {
  list-style-type: disc;
}
.blogger-preview-content ol {
  list-style-type: decimal;
}
.blogger-preview-content li {
  margin-bottom: 0.4em;
  line-height: 1.7;
}
.blogger-preview-content li:last-child {
  margin-bottom: 0;
}
.blogger-preview-content ul ul,
.blogger-preview-content ol ol,
.blogger-preview-content ul ol,
.blogger-preview-content ol ul {
  margin-top: 0.4em;
  margin-bottom: 0.4em;
}

/* ── Blockquotes ──────────────────────────────────────────────── */
.blogger-preview-content blockquote {
  margin: 1.5em 0;
  padding: 16px 20px;
  border-left: 4px solid #008060;
  background: #f6f6f7;
  border-radius: 0 8px 8px 0;
  font-style: italic;
  color: #333;
}
.blogger-preview-content blockquote p:last-child {
  margin-bottom: 0;
}

/* ── Code ─────────────────────────────────────────────────────── */
.blogger-preview-content code {
  font-family: "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", Menlo, Monaco, Consolas, monospace;
  background: #f1f2f3;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
  color: #d72c0d;
}
.blogger-preview-content pre {
  margin: 1.5em 0;
  padding: 16px 20px;
  background: #1a1a2e;
  color: #e0e0e0;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 14px;
  line-height: 1.6;
}
.blogger-preview-content pre code {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
  color: inherit;
}

/* ── Horizontal rules ─────────────────────────────────────────── */
.blogger-preview-content hr {
  border: none;
  border-top: 2px solid #e1e3e5;
  margin: 2em 0;
}

/* ── Images ───────────────────────────────────────────────────── */
.blogger-preview-content img {
  max-width: 100%;
  height: auto;
  display: block;
  border-radius: 8px;
  margin: 1.2em auto;
}
.blogger-preview-content img[style*="display: inline"] {
  display: inline;
}

/* ── Tables ───────────────────────────────────────────────────── */
.blogger-preview-content table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #dfe3e8;
  border-radius: 8px;
  overflow: hidden;
  margin: 1.5em 0;
  font-size: 14px;
  background: #fff;
}
.blogger-preview-content thead {
  background: #f6f6f7;
}
.blogger-preview-content th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 700;
  color: #202223;
  border-bottom: 2px solid #dfe3e8;
  white-space: nowrap;
}
.blogger-preview-content td {
  padding: 10px 16px;
  border-bottom: 1px solid #f1f2f3;
  vertical-align: top;
  color: #333;
}
.blogger-preview-content tr:last-child td {
  border-bottom: none;
}
.blogger-preview-content tbody tr:hover {
  background: #f9fafb;
}
.blogger-preview-content tr:nth-child(even) td {
  background: #fafbfc;
}

/* ── YouTube embeds ───────────────────────────────────────────── */
.blogger-preview-content iframe[src*="youtube"],
.blogger-preview-content iframe[src*="vimeo"] {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: none;
  border-radius: 8px;
  margin: 1.5em 0;
}

/* ── Product / commerce blocks ────────────────────────────────── */
.blogger-preview-content [data-type] {
  margin: 1.5em 0;
}

/* ── Responsive adjustments for mobile preview ────────────────── */
@media (max-width: 480px) {
  .blogger-preview-content {
    font-size: 15px;
  }
  .blogger-preview-content h1 {
    font-size: 1.6em;
  }
  .blogger-preview-content h2 {
    font-size: 1.35em;
  }
  .blogger-preview-content table {
    font-size: 13px;
    display: block;
    overflow-x: auto;
  }
  .blogger-preview-content pre {
    font-size: 13px;
    padding: 12px 14px;
  }
}
`;

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
      large
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

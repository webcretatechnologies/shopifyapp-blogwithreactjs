import { useMemo, useState } from "react";
import { Box, Text, BlockStack, InlineStack } from "@shopify/polaris";
import TemplateLivePreview from "./TemplateLivePreview";
import TemplateMiniPreview from "./TemplateMiniPreview";
import { getTemplateChips, getTemplateScale } from "../../utils/templateFacts";

/**
 * Shared Blogger-style template card for the library page and in-editor modal.
 * Shows a real, compiled preview of the template that auto-scrolls the full layout
 * on hover. Falls back to the abstract mini-preview if the block tree isn't available.
 */
export default function TemplateGalleryCard({
  template,
  locked = false,
  onUse,
  actionLabel = "Use template",
  applying = false,
  showAction = false,
}) {
  const [hover, setHover] = useState(false);
  const accent = template.accent || template.style?.accent || "#303030";
  const style = template.style || { accent, tocBg: accent, tocFg: "#ffffff", headingFont: "sans" };
  const preview = template.preview || {};
  const blocks = Array.isArray(template.blocks) ? template.blocks : null;
  const badge = template.badge;

  // What this template actually builds, read off the same tree the editor applies —
  // the name and one-line description alone made very different layouts look alike.
  const chips = useMemo(() => (blocks ? getTemplateChips(blocks).slice(0, 3) : []), [blocks]);
  const scale = useMemo(() => (blocks ? getTemplateScale(blocks) : ""), [blocks]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !applying && onUse?.()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!applying) onUse?.();
        }
      }}
      onMouseEnter={(e) => {
        setHover(true);
        if (applying) return;
        e.currentTarget.style.boxShadow = "0 10px 26px rgba(0,0,0,0.12)";
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = "#c9c7c4";
      }}
      onMouseLeave={(e) => {
        setHover(false);
        e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)";
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.borderColor = "#e3e1de";
      }}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid #e3e1de",
        background: "#fff",
        cursor: applying ? "default" : "pointer",
        position: "relative",
        opacity: applying ? 0.7 : 1,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        transition: "box-shadow 150ms ease, transform 150ms ease, border-color 150ms ease",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Live preview window ── */}
      <div style={{ position: "relative", borderBottom: "1px solid #ecebe9" }}>
        {blocks ? (
          <TemplateLivePreview
            blocks={blocks}
            style={style}
            active={hover && !applying}
          />
        ) : (
          <div style={{ padding: 10 }}>
            <TemplateMiniPreview style={style} preview={preview} />
          </div>
        )}

        {blocks && (
          <span
            style={{
              position: "absolute",
              bottom: 8,
              right: 8,
              background: "rgba(255,255,255,0.92)",
              border: "1px solid #e3e1de",
              color: "#616161",
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 999,
              opacity: hover ? 0 : 1,
              transition: "opacity 150ms ease",
              pointerEvents: "none",
              zIndex: 2,
            }}
          >
            Hover to scroll the full layout
          </span>
        )}

        {badge && (
          <span
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              background: badge === "Popular" ? "#2c6ecb" : badge === "New" ? "#1f6b4a" : "#303030",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.02em",
              padding: "3px 9px",
              borderRadius: 999,
              boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
              zIndex: 2,
            }}
          >
            {badge}
          </span>
        )}

        {locked && (
          <span
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              background: "rgba(17,24,39,0.9)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              padding: "3px 8px 3px 6px",
              borderRadius: 999,
              zIndex: 2,
            }}
          >
            <span aria-hidden style={{ fontSize: 11, lineHeight: 1 }}>🔒</span>
            Starter+
          </span>
        )}
      </div>

      {/* ── Meta ── */}
      <Box padding="300">
        <BlockStack gap="150">
          <InlineStack align="space-between" blockAlign="center" gap="200" wrap={false}>
            <Text variant="bodyMd" as="h3" fontWeight="semibold">
              {template.name}
            </Text>
            {template.category && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: accent,
                  whiteSpace: "nowrap",
                }}
              >
                {template.category}
              </span>
            )}
          </InlineStack>
          {template.description && (
            <Text tone="subdued" variant="bodySm" as="p">
              {template.description}
            </Text>
          )}
          {chips.length > 0 && (
            <InlineStack gap="100" wrap>
              {chips.map((chip) => (
                <span
                  key={chip}
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#4a4a4a",
                    background: "#f4f4f3",
                    border: "1px solid #eceae7",
                    borderRadius: 6,
                    padding: "2px 7px",
                    whiteSpace: "nowrap",
                  }}
                >
                  {chip}
                </span>
              ))}
            </InlineStack>
          )}
          {scale && (
            <Text tone="subdued" variant="bodyXs" as="p">
              {scale}
            </Text>
          )}
          {showAction && (
            <InlineStack align="end">
              <button
                type="button"
                disabled={applying}
                onClick={(e) => {
                  e.stopPropagation();
                  onUse?.();
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #303030",
                  background: locked ? "#fff" : "#303030",
                  color: locked ? "#303030" : "#fff",
                  fontWeight: 600,
                  cursor: applying ? "default" : "pointer",
                }}
              >
                {applying ? "Applying…" : locked ? `${actionLabel} (Starter+)` : actionLabel}
              </button>
            </InlineStack>
          )}
        </BlockStack>
      </Box>
    </div>
  );
}

export function BlankTemplateCard({ onUse }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onUse}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onUse?.();
        }
      }}
      style={{
        borderRadius: "12px",
        border: "1.5px dashed #c9c7c4",
        background: "#fafaf9",
        cursor: "pointer",
        minHeight: 250,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <BlockStack gap="200" inlineAlign="center">
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "#eee",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            color: "#8a8a8a",
          }}
        >
          +
        </div>
        <Text variant="headingSm" as="h3" tone="subdued">
          Start from scratch
        </Text>
      </BlockStack>
    </div>
  );
}

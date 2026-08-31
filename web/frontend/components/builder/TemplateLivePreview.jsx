import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { compileBlocksToHtml } from "../../utils/compileBlocksToHtml";
import { ensurePreviewContentCss } from "../editor/previewContentCss";
import { normalizeBlocksAst } from "./BlockRegistry";

/**
 * TemplateLivePreview
 * -------------------
 * Compiles the same block tree the merchant gets when they pick the template
 * (after normalizeBlocksAst, identical to the editor apply path). Default view
 * is the top of the article; hovering the card (`active`) slowly auto-scrolls
 * the full layout, then eases back on leave.
 */

const CANVAS_WIDTH = 720;

// The builder canvas resolves var(--blogger-primary-color) from the shop's saved theme colour
// (BuilderCanvas.jsx), and so does the published article — so the card has to use it too, or a
// template's prices/buttons look one colour in the gallery and another the moment it's applied.
// Cached at module level: a gallery renders 16+ cards and they all want the same value.
let shopColorPromise = null;
function fetchShopPrimaryColor() {
  if (!shopColorPromise) {
    shopColorPromise = fetch("/api/settings")
      .then((r) => r.json())
      .then(({ settings }) => settings?.primaryColor || null)
      .catch(() => null);
  }
  return shopColorPromise;
}

export default function TemplateLivePreview({
  blocks,
  style = {},
  active = false,
  height = 250,
}) {
  const [shopColor, setShopColor] = useState(null);
  const accent = shopColor || style.accent || "#1f6b4a";

  const frameRef = useRef(null);
  const pageRef = useRef(null);
  const [scale, setScale] = useState(height / CANVAS_WIDTH);
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    ensurePreviewContentCss();
    let alive = true;
    fetchShopPrimaryColor().then((c) => {
      if (alive && c) setShopColor(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  const html = useMemo(() => {
    try {
      const ast = normalizeBlocksAst(Array.isArray(blocks) ? blocks : []);
      return compileBlocksToHtml(ast);
    } catch {
      return "";
    }
  }, [blocks]);

  const measure = useCallback(() => {
    const frame = frameRef.current;
    const page = pageRef.current;
    if (!frame || !page) return;
    const s = frame.clientWidth / CANVAS_WIDTH;
    setScale(s);
    setOverflow(Math.max(0, page.scrollHeight * s - height));
  }, [height]);

  useLayoutEffect(() => {
    measure();
  }, [html, measure]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    if (frameRef.current) ro.observe(frameRef.current);
    if (pageRef.current) ro.observe(pageRef.current);
    const t = setTimeout(measure, 250);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [measure]);

  const duration = Math.min(9, Math.max(2.2, overflow / 55));
  const translate = active ? -overflow : 0;

  return (
    <div
      ref={frameRef}
      style={{
        position: "relative",
        height,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      <div
        style={{
          transform: `translateY(${translate}px)`,
          transition: active
            ? `transform ${duration}s linear`
            : "transform 0.6s ease",
          willChange: "transform",
        }}
      >
        <div
          ref={pageRef}
          style={{
            width: CANVAS_WIDTH,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            background: "#fff",
            "--blogger-primary-color": accent,
          }}
        >
          <div
            className="blogger-preview-content"
            style={{ padding: "28px 48px 48px" }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 44,
          background: "linear-gradient(to bottom, rgba(255,255,255,0), #fff)",
          pointerEvents: "none",
          opacity: active ? 0 : 1,
          transition: "opacity 0.3s ease",
        }}
      />
    </div>
  );
}

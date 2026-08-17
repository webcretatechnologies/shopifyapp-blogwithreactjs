/**
 * RichTextBlock.jsx
 *
 * The Builder's RichText block. Renders the embedded RichTextEditor
 * when selected/active, and a static HTML preview otherwise.
 *
 * Content is stored as Tiptap JSON in block.settings.content.
 * The parent CanvasNode passes isSelected so the editor activates on click.
 */

import { generateHTML } from "@tiptap/html";
import { useCallback } from "react";
import RichTextEditor from "../../editor/RichTextEditor";
import { builderRichTextExtensions } from "../../editor/richTextExtensions";
import { useBuilderStore } from "../store/useBuilderStore";

// ---------------------------------------------------------------------------
// Static preview (rendered when block is NOT selected)
// ---------------------------------------------------------------------------
export function RichTextBlockPreview({ block, isSelected }) {
  if (isSelected) {
    return <RichTextBlock block={block} />;
  }

  const { settings } = block;
  let content = settings?.content;

  if (!content) {
    return (
      <p style={{ color: "#8c9196", fontStyle: "italic", padding: "4px 0", margin: 0 }}>
        Click to add text…
      </p>
    );
  }

  // If content is stringified JSON, parse it
  if (typeof content === "string") {
    const trimmed = content.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        content = JSON.parse(trimmed);
      } catch (e) {
        // Keep as string
      }
    }
  }

  let html = "";

  if (typeof content === "string") {
    html = content;
  } else if (content && typeof content === "object") {
    try {
      html = generateHTML(content, builderRichTextExtensions());
    } catch (err) {
      console.warn("Failed to generateHTML from Tiptap JSON, falling back to raw render:", err);
      html = "";
    }
  }

  if (!html || html === "<p></p>") {
    if (typeof settings?.content === "string") {
      html = settings.content;
    }
  }

  // The active Tiptap/ProseMirror editor (rendered when this block IS selected — see
  // RichTextBlock below) parses stored HTML through its own schema-based parser, which
  // deliberately discards insignificant whitespace between block-level tags. This static
  // preview instead hands the raw string straight to dangerouslySetInnerHTML, so the browser's
  // native HTML parser keeps every literal newline/space sitting between e.g. `<li>` and `<p>`
  // (stored content is formatted with real newlines between tags) as real whitespace text nodes.
  // Combined with this stylesheet's `li > p { display: inline }` override, a lone whitespace
  // text node landing before the <p> can visually separate the list marker from its text onto
  // its own line — exactly the "shows broken by default, fixes the instant you select it"
  // symptom, since only the unselected preview ever hits this raw-parser code path. Stripping
  // whitespace between tags here (safe: it's insignificant HTML whitespace, never real content)
  // makes the preview parse identically to how the live editor already renders it.
  if (html) {
    html = html.replace(/>\s+</g, "><").trim();
  }

  return (
    <div style={{ padding: "4px 0" }}>
      <div className="tiptap-content tiptap-content--builder" style={{ pointerEvents: "none" }}>
        <div
          className="ProseMirror"
          dangerouslySetInnerHTML={{ __html: html || "<p></p>" }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interactive block (rendered inside CanvasNode when selected)
// ---------------------------------------------------------------------------
export default function RichTextBlock({ block }) {
  const updateBlockSettings = useBuilderStore((s) => s.updateBlockSettings);

  const handleChange = useCallback(
    (jsonDoc) => {
      updateBlockSettings(block.id, { content: jsonDoc });
    },
    [block.id, updateBlockSettings]
  );

  return (
    <RichTextEditor
      content={block.settings.content ?? null}
      onChange={handleChange}
      placeholder="Start writing…"
    />
  );
}

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

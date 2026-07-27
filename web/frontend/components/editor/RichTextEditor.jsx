/**
 * RichTextEditor.jsx
 *
 * A lean, embeddable Tiptap editor component used by the drag-and-drop
 * Builder's RichText block. It is intentionally minimal:
 *
 *  - No full toolbar (formatting happens via the BubbleMenu on text selection)
 *  - No HTML source-view toggle (the Builder's source of truth is JSON, not HTML)
 *  - No Shopify file-picker modal (images are their own block type in the Builder)
 *  - No YouTube embed modal (video is its own block type in the Builder)
 *
 * The BubbleMenu is portaled to document.body via Tippy's `appendTo` option so
 * it is never clipped by a parent with overflow:hidden (e.g. the Builder canvas).
 *
 * Props:
 *   content       — Tiptap JSON doc (ProseMirror JSON format) or null for empty doc
 *   onChange      — (jsonDoc) => void   — called with editor.getJSON() on every change
 *   onInit        — (jsonDoc) => void   — called once with the initial normalised doc
 *   placeholder   — string
 *   readOnly      — bool (default false)
 */

import { useEditor, EditorContent, BubbleMenu } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { Icon } from "@shopify/polaris";
import {
  TextBoldIcon,
  TextItalicIcon,
  TextUnderlineIcon,
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
  ListBulletedIcon,
  ListNumberedIcon,
  TextQuoteIcon,
  LinkIcon,
  TextColorIcon,
} from "@shopify/polaris-icons";
import {
  Strikethrough,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
} from "lucide-react";
import { builderRichTextExtensions } from "./richTextExtensions";
import "./TiptapEditor.css"; // reuse the same toolbar/btn CSS variables

// ---------------------------------------------------------------------------
// Inline toolbar button — same shape as TiptapEditor.jsx's <Btn>
// ---------------------------------------------------------------------------
const Btn = ({ onClick, active, title, children }) => (
  <button
    type="button"
    aria-pressed={active}
    onMouseDown={(e) => {
      e.preventDefault();
      onClick();
    }}
    className={`tiptap-btn${active ? " tiptap-btn--active" : ""}`}
    title={title}
  >
    {children}
  </button>
);

const Sep = () => <div className="tiptap-toolbar__separator" />;

// ---------------------------------------------------------------------------
// The empty Tiptap JSON document used when no content is provided.
// ---------------------------------------------------------------------------
const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

// ---------------------------------------------------------------------------
// RichTextEditor
// ---------------------------------------------------------------------------
export default function RichTextEditor({
  content,
  onChange,
  onInit,
  placeholder = "Start writing…",
  readOnly = false,
}) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const extensions = builderRichTextExtensions(placeholder);

  const editor = useEditor({
    extensions,
    content: content ?? EMPTY_DOC,
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      onChangeRef.current?.(ed.getJSON());
    },
  });

  // Sync external content changes (e.g. undo from Zustand store)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (editor.isFocused) return; // don't interrupt active typing
    const incoming = content ?? EMPTY_DOC;
    const current = editor.getJSON();
    if (JSON.stringify(incoming) !== JSON.stringify(current)) {
      editor.commands.setContent(incoming, false);
    }
  }, [content, editor]);

  // Fire onInit once after mount so parent can capture the normalised doc
  const initFiredRef = useRef(false);
  useEffect(() => {
    if (!editor || initFiredRef.current) return;
    initFiredRef.current = true;
    onInit?.(editor.getJSON());
  }, [editor, onInit]);

  if (!editor) return null;

  return (
    <div className="tiptap-editor-container tiptap-editor-container--builder">
      {/* ------------------------------------------------------------------ */}
      {/* BubbleMenu — portaled to document.body so it escapes overflow:hidden */}
      {/* ------------------------------------------------------------------ */}
      <BubbleMenu
        editor={editor}
        tippyOptions={{
          duration: 100,
          appendTo: () => document.body,
          placement: "top",
        }}
      >
        <div className="tiptap-toolbar tiptap-bubble-toolbar">

          {/* Formatting */}
          <div className="tiptap-toolbar__group">
            <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
              <Icon source={TextBoldIcon} />
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
              <Icon source={TextItalicIcon} />
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline">
              <Icon source={TextUnderlineIcon} />
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough">
              <Strikethrough size={14} />
            </Btn>
          </div>
          <Sep />

          {/* Headings */}
          <div className="tiptap-toolbar__group">
            <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Heading 1">
              <Heading1 size={14} />
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">
              <Heading2 size={14} />
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">
              <Heading3 size={14} />
            </Btn>
          </div>
          <Sep />

          {/* Alignment */}
          <div className="tiptap-toolbar__group">
            <Btn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Align Left">
              <Icon source={TextAlignLeftIcon} />
            </Btn>
            <Btn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Center">
              <Icon source={TextAlignCenterIcon} />
            </Btn>
            <Btn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Align Right">
              <Icon source={TextAlignRightIcon} />
            </Btn>
          </div>
          <Sep />

          {/* Lists */}
          <div className="tiptap-toolbar__group">
            <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet List">
              <Icon source={ListBulletedIcon} />
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered List">
              <Icon source={ListNumberedIcon} />
            </Btn>
            <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Blockquote">
              <Icon source={TextQuoteIcon} />
            </Btn>
          </div>
          <Sep />

          {/* Color & Highlight */}
          <div className="tiptap-toolbar__group" style={{ alignItems: "center" }}>
            <label title="Text Color" style={{ cursor: "pointer", display: "flex", alignItems: "center" }} className="tiptap-btn">
              <Icon source={TextColorIcon} />
              <input type="color" style={{ width: 0, height: 0, opacity: 0, position: "absolute" }} onChange={(e) => editor.chain().focus().setColor(e.target.value).run()} />
            </label>
            <label title="Highlight" style={{ cursor: "pointer", display: "flex", alignItems: "center" }} className={`tiptap-btn${editor.isActive("highlight") ? " tiptap-btn--active" : ""}`}>
              <Highlighter size={14} />
              <input type="color" defaultValue="#ffd700" style={{ width: 0, height: 0, opacity: 0, position: "absolute" }} onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()} />
            </label>
          </div>
          <Sep />

          {/* Link */}
          <div className="tiptap-toolbar__group">
            <Btn
              onClick={() => {
                const prev = editor.getAttributes("link").href || "";
                const url = window.prompt("Link URL", prev);
                if (url === null) return;
                if (url) {
                  editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
                } else {
                  editor.chain().focus().unsetLink().run();
                }
              }}
              active={editor.isActive("link")}
              title="Insert Link"
            >
              <Icon source={LinkIcon} />
            </Btn>
          </div>
        </div>
      </BubbleMenu>

      {/* Editor content area — no drag handle rendered here */}
      <EditorContent editor={editor} className="tiptap-content tiptap-content--builder" />
    </div>
  );
}

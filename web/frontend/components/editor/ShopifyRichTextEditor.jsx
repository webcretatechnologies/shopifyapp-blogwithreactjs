/**
 * ShopifyRichTextEditor.jsx
 *
 * A reusable native Shopify-styled Rich Text Editor component.
 * Features a full top toolbar matching Shopify Admin's native rich text editor:
 *  - Format selector (Paragraph, Headings, Blockquote)
 *  - Formatting (Bold, Italic, Underline, Text Color)
 *  - Alignment & Lists (Left, Center, Right, Bulleted, Numbered)
 *  - Insert Link & Insert Image
 *  - Raw HTML View Toggle (<>)
 *
 * Props:
 *   value       — HTML string or plain text
 *   onChange    — (htmlString) => void
 *   placeholder — string (default: "Add content...")
 *   minHeight   — string (default: "120px")
 */

import React, { useState, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Image } from "@tiptap/extension-image";
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
  LinkIcon,
  ImageIcon,
  CodeIcon,
  TextColorIcon,
} from "@shopify/polaris-icons";
import "./ShopifyRichTextEditor.css";

const ToolbarBtn = ({ onClick, active, title, children, disabled }) => (
  <button
    type="button"
    aria-pressed={active}
    disabled={disabled}
    onMouseDown={(e) => {
      e.preventDefault();
      onClick();
    }}
    className={`shopify-editor-btn${active ? " shopify-editor-btn--active" : ""}`}
    title={title}
  >
    {children}
  </button>
);

const ToolbarSep = () => <div className="shopify-editor-toolbar__separator" />;

export default function ShopifyRichTextEditor({
  value = "",
  onChange,
  placeholder = "Add content...",
  minHeight = "120px",
}) {
  const [isHtmlMode, setIsHtmlMode] = useState(false);
  const [htmlCode, setHtmlCode] = useState(value || "");
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
      }),
      Placeholder.configure({ placeholder }),
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Image.configure({ inline: true }),
    ],
    content: value || "",
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      setHtmlCode(html);
      onChangeRef.current?.(html);
    },
  });

  // Sync external changes into editor if updated outside
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (editor.isFocused || isHtmlMode) return;
    const currentHtml = editor.getHTML();
    if (value !== currentHtml) {
      editor.commands.setContent(value || "", false);
      setHtmlCode(value || "");
    }
  }, [value, editor, isHtmlMode]);

  const handleHtmlChange = (e) => {
    const newHtml = e.target.value;
    setHtmlCode(newHtml);
    onChangeRef.current?.(newHtml);
  };

  const toggleHtmlMode = () => {
    if (isHtmlMode) {
      // Switching from HTML view back to visual editor
      if (editor && !editor.isDestroyed) {
        editor.commands.setContent(htmlCode, false);
      }
      setIsHtmlMode(false);
    } else {
      // Switching to HTML view
      if (editor && !editor.isDestroyed) {
        setHtmlCode(editor.getHTML());
      }
      setIsHtmlMode(true);
    }
  };

  if (!editor) return null;

  // Determine current format dropdown selection
  let currentFormat = "paragraph";
  if (editor.isActive("heading", { level: 1 })) currentFormat = "h1";
  else if (editor.isActive("heading", { level: 2 })) currentFormat = "h2";
  else if (editor.isActive("heading", { level: 3 })) currentFormat = "h3";
  else if (editor.isActive("blockquote")) currentFormat = "blockquote";

  const handleFormatChange = (e) => {
    const fmt = e.target.value;
    if (fmt === "paragraph") editor.chain().focus().setParagraph().run();
    else if (fmt === "h1") editor.chain().focus().toggleHeading({ level: 1 }).run();
    else if (fmt === "h2") editor.chain().focus().toggleHeading({ level: 2 }).run();
    else if (fmt === "h3") editor.chain().focus().toggleHeading({ level: 3 }).run();
    else if (fmt === "blockquote") editor.chain().focus().toggleBlockquote().run();
  };

  const handleAddLink = () => {
    const previousUrl = editor.getAttributes("link").href || "";
    const url = window.prompt("URL", previousUrl);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const handleAddImage = () => {
    const url = window.prompt("Image URL");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  return (
    <div className={`shopify-rich-editor${isHtmlMode ? " shopify-rich-editor--html" : ""}`}>
      {/* ── Top Rich Text Toolbar ── */}
      <div className="shopify-editor-toolbar">
        {/* Formatting dropdown */}
        <select
          value={currentFormat}
          onChange={handleFormatChange}
          disabled={isHtmlMode}
          className="shopify-editor-select"
          title="Format text"
        >
          <option value="paragraph">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="blockquote">Blockquote</option>
        </select>

        <ToolbarSep />

        {/* Text styling buttons */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          disabled={isHtmlMode}
          title="Bold"
        >
          <Icon source={TextBoldIcon} />
        </ToolbarBtn>

        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          disabled={isHtmlMode}
          title="Italic"
        >
          <Icon source={TextItalicIcon} />
        </ToolbarBtn>

        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          disabled={isHtmlMode}
          title="Underline"
        >
          <Icon source={TextUnderlineIcon} />
        </ToolbarBtn>

        <label
          title="Text color"
          className={`shopify-editor-btn${isHtmlMode ? " shopify-editor-btn--disabled" : ""}`}
          style={{ cursor: isHtmlMode ? "not-allowed" : "pointer" }}
        >
          <Icon source={TextColorIcon} />
          <input
            type="color"
            disabled={isHtmlMode}
            style={{ width: 0, height: 0, opacity: 0, position: "absolute" }}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
        </label>

        <ToolbarSep />

        {/* Alignment */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          disabled={isHtmlMode}
          title="Align left"
        >
          <Icon source={TextAlignLeftIcon} />
        </ToolbarBtn>

        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          disabled={isHtmlMode}
          title="Align center"
        >
          <Icon source={TextAlignCenterIcon} />
        </ToolbarBtn>

        <ToolbarBtn
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          disabled={isHtmlMode}
          title="Align right"
        >
          <Icon source={TextAlignRightIcon} />
        </ToolbarBtn>

        <ToolbarSep />

        {/* Lists */}
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          disabled={isHtmlMode}
          title="Bulleted list"
        >
          <Icon source={ListBulletedIcon} />
        </ToolbarBtn>

        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          disabled={isHtmlMode}
          title="Numbered list"
        >
          <Icon source={ListNumberedIcon} />
        </ToolbarBtn>

        <ToolbarSep />

        {/* Media & Link */}
        <ToolbarBtn
          onClick={handleAddLink}
          active={editor.isActive("link")}
          disabled={isHtmlMode}
          title="Insert link"
        >
          <Icon source={LinkIcon} />
        </ToolbarBtn>

        <ToolbarBtn
          onClick={handleAddImage}
          disabled={isHtmlMode}
          title="Insert image"
        >
          <Icon source={ImageIcon} />
        </ToolbarBtn>

        {/* HTML View Toggle */}
        <div style={{ marginLeft: "auto" }}>
          <ToolbarBtn
            onClick={toggleHtmlMode}
            active={isHtmlMode}
            title={isHtmlMode ? "Show Editor" : "Show HTML"}
          >
            <Icon source={CodeIcon} />
          </ToolbarBtn>
        </div>
      </div>

      {/* ── Content Area: Visual Editor or HTML Textarea ── */}
      {isHtmlMode ? (
        <textarea
          className="shopify-editor-html-textarea"
          style={{ minHeight }}
          value={htmlCode}
          onChange={handleHtmlChange}
          placeholder="<h1>Title</h1><p>Content...</p>"
          rows={6}
        />
      ) : (
        <EditorContent
          editor={editor}
          className="shopify-editor-content"
          style={{ minHeight }}
        />
      )}
    </div>
  );
}

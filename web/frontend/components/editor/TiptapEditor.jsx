import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { ResizableImage } from "./extensions/ResizableImage";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Highlight } from "@tiptap/extension-highlight";
import { Youtube } from "@tiptap/extension-youtube";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { ProductGridExtension } from "./extensions/ProductGridExtension";
import { CollectionExtension } from "./extensions/CollectionExtension";
import { BuyButtonExtension } from "./extensions/BuyButtonExtension";
import { LegacyProductCardExtension, LegacyStickyProductExtension, LegacyFeaturedProductExtension } from "./extensions/LegacyBuyButtonExtensions";
import { LegacyProductSwitcherExtension, LegacyProductSliderExtension } from "./extensions/LegacyProductGridExtensions";
import { CTAButtonExtension } from "./extensions/CTAButtonExtension";
import { HeroExtension } from "./extensions/HeroExtension";
import { VideoExtension } from "./extensions/VideoExtension";
import { SpacerExtension } from "./extensions/SpacerExtension";
import ShopifyFilePicker from "../ShopifyFilePicker";
import { useState, useEffect } from "react";
import "./TiptapEditor.css";

const Btn = ({ onClick, active, title, children, style = {} }) => (
  <button
    type="button"
    onMouseDown={(e) => {
      e.preventDefault();
      onClick();
    }}
    className={`tiptap-btn${active ? " tiptap-btn--active" : ""}`}
    title={title}
    style={style}
  >
    {children}
  </button>
);

const Sep = () => <div className="tiptap-toolbar__separator" />;

export default function TiptapEditor({
  content,
  onChange,
  placeholder = "Start writing...",
  uploadUrl = "/api/posts/upload",
}) {
  const [showShopifyPicker, setShowShopifyPicker] = useState(false);
  const [showYoutubeModal, setShowYoutubeModal] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [showHtml, setShowHtml] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      ResizableImage.configure({ inline: false }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Youtube.configure({ width: "100%", height: 400 }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      ProductGridExtension,
      CollectionExtension,
      BuyButtonExtension,
      LegacyProductCardExtension,
      LegacyStickyProductExtension,
      LegacyFeaturedProductExtension,
      LegacyProductSwitcherExtension,
      LegacyProductSliderExtension,
      CTAButtonExtension,
      HeroExtension,
      VideoExtension,
      SpacerExtension,
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && !editor.isFocused && content !== editor.getHTML()) {
      editor.commands.setContent(content || "");
    }
  }, [content, editor]);

  if (!editor) return null;

  // Removed broken local upload logic in favor of ShopifyFilePicker

  const handleLinkInsert = () => {
    const url = window.prompt("Enter URL:");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const handleYoutubeEmbed = () => {
    if (youtubeUrl) {
      editor.chain().focus().setYoutubeVideo({ src: youtubeUrl }).run();
      setYoutubeUrl("");
      setShowYoutubeModal(false);
    }
  };

  const handleTableInsert = () => {
    editor
      .chain()
      .focus()
      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
      .run();
  };

  return (
    <div className="tiptap-editor-container">
      <div className="tiptap-toolbar" style={{ flexWrap: "wrap", gap: "2px" }}>
        {/* ── Formatting ── */}
        <div className="tiptap-toolbar__group">
          <Btn
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            title="Bold"
          >
            <b>B</b>
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            title="Italic"
          >
            <i>I</i>
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive("underline")}
            title="Underline"
          >
            <u>U</u>
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive("strike")}
            title="Strikethrough"
          >
            <s>S</s>
          </Btn>
        </div>
        <Sep />

        {/* ── Headings ── */}
        <div className="tiptap-toolbar__group">
          {[1, 2, 3].map((l) => (
            <Btn
              key={l}
              onClick={() =>
                editor.chain().focus().toggleHeading({ level: l }).run()
              }
              active={editor.isActive("heading", { level: l })}
              title={`H${l}`}
            >
              H{l}
            </Btn>
          ))}
          <Btn
            onClick={() => editor.chain().focus().setParagraph().run()}
            active={editor.isActive("paragraph")}
            title="Paragraph"
          >
            ¶
          </Btn>
        </div>
        <Sep />

        {/* ── Alignment ── */}
        <div className="tiptap-toolbar__group">
          <Btn
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            active={editor.isActive({ textAlign: "left" })}
            title="Align Left"
          >
            ≡L
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            active={editor.isActive({ textAlign: "center" })}
            title="Center"
          >
            ≡C
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            active={editor.isActive({ textAlign: "right" })}
            title="Align Right"
          >
            ≡R
          </Btn>
        </div>
        <Sep />

        {/* ── Lists & Blocks ── */}
        <div className="tiptap-toolbar__group">
          <Btn
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            title="Bullet List"
          >
            • —
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            title="Numbered List"
          >
            1.
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive("blockquote")}
            title="Blockquote"
          >
            "
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            active={false}
            title="Horizontal Rule"
          >
            ─
          </Btn>
        </div>
        <Sep />

        {/* ── Color & Highlight ── */}
        <div className="tiptap-toolbar__group" style={{ alignItems: "center" }}>
          <label
            title="Text Color"
            style={{ cursor: "pointer", display: "flex", alignItems: "center" }}
            className="tiptap-btn"
          >
            <span>A</span>
            <input
              type="color"
              style={{ width: 0, height: 0, opacity: 0, position: "absolute" }}
              onChange={(e) =>
                editor.chain().focus().setColor(e.target.value).run()
              }
            />
          </label>
          <label
            title="Highlight"
            style={{ cursor: "pointer", display: "flex", alignItems: "center" }}
            className={`tiptap-btn${editor.isActive("highlight") ? " tiptap-btn--active" : ""}`}
          >
            <span style={{ background: "#ffd700", padding: "0 2px" }}>H</span>
            <input
              type="color"
              defaultValue="#ffd700"
              style={{ width: 0, height: 0, opacity: 0, position: "absolute" }}
              onChange={(e) =>
                editor
                  .chain()
                  .focus()
                  .toggleHighlight({ color: e.target.value })
                  .run()
              }
            />
          </label>
        </div>
        <Sep />

        {/* ── Code ── */}
        <div className="tiptap-toolbar__group">
          <Btn
            onClick={() => editor.chain().focus().toggleCode().run()}
            active={editor.isActive("code")}
            title="Inline Code"
          >
            {"`"}
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            active={editor.isActive("codeBlock")}
            title="Code Block"
          >
            {"{ }"}
          </Btn>
        </div>
        <Sep />

        {/* ── Links & Media ── */}
        <div className="tiptap-toolbar__group">
          <Btn
            onClick={handleLinkInsert}
            active={editor.isActive("link")}
            title="Insert Link"
          >
            🔗
          </Btn>
          <Btn onClick={() => setShowShopifyPicker(true)} active={false} title="Upload / Select Image">
            🖼
          </Btn>
          <Btn
            onClick={() => setShowYoutubeModal(true)}
            active={editor.isActive("youtube")}
            title="Embed YouTube/Video"
          >
            ▶️
          </Btn>
        </div>
        <Sep />

        {/* ── Commerce Blocks ── */}
        <div className="tiptap-toolbar__group">
          <Btn
            onClick={() => editor.chain().focus().insertContent({ type: 'buyButton' }).run()}
            active={editor.isActive("buyButton")}
            title="Insert Buy Button"
          >
            🛒
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().insertContent({ type: 'productGrid' }).run()}
            active={editor.isActive("productGrid")}
            title="Insert Product Grid"
          >
            🛍️
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().insertContent({ type: 'collection' }).run()}
            active={editor.isActive("collection")}
            title="Insert Collection"
          >
            📦
          </Btn>
        </div>
        <Sep />

        {/* ── Layout Blocks ── */}
        <div className="tiptap-toolbar__group">
          <Btn
            onClick={() => editor.chain().focus().insertContent({ type: 'ctaButton' }).run()}
            active={editor.isActive("ctaButton")}
            title="Insert CTA Button"
          >
            🔘
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().insertContent({ type: 'heroBlock' }).run()}
            active={editor.isActive("heroBlock")}
            title="Insert Hero Section"
          >
            🦸
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().insertContent({ type: 'videoBlock' }).run()}
            active={editor.isActive("videoBlock")}
            title="Insert Video Embed"
          >
            🎬
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().insertContent({ type: 'spacerBlock' }).run()}
            active={editor.isActive("spacerBlock")}
            title="Insert Spacer"
          >
            ↕
          </Btn>
        </div>
        <Sep />

        {/* ── Legacy Blocks ── */}
        <div className="tiptap-toolbar__group">
          <Btn
            onClick={() => editor.chain().focus().insertContent({ type: 'product' }).run()}
            active={editor.isActive("product")}
            title="Insert Product Card (Legacy)"
          >
            🏷
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().insertContent({ type: 'product_sidebar' }).run()}
            active={editor.isActive("product_sidebar")}
            title="Insert Sticky Product (Legacy)"
          >
            📌
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().insertContent({ type: 'featured_product' }).run()}
            active={editor.isActive("featured_product")}
            title="Insert Featured Product (Legacy)"
          >
            ⭐
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().insertContent({ type: 'product_switcher' }).run()}
            active={editor.isActive("product_switcher")}
            title="Insert Product Switcher (Legacy)"
          >
            🔄
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().insertContent({ type: 'product_slider' }).run()}
            active={editor.isActive("product_slider")}
            title="Insert Product Slider (Legacy)"
          >
            ↔
          </Btn>
        </div>
        <Sep />

        {/* ── Table ── */}
        <div className="tiptap-toolbar__group">
          <Btn
            onClick={handleTableInsert}
            active={editor.isActive("table")}
            title="Insert Table 3×3"
          >
            ⊞
          </Btn>
          {editor.isActive("table") && (
            <>
              <Btn
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                active={false}
                title="Add Column"
              >
                +Col
              </Btn>
              <Btn
                onClick={() => editor.chain().focus().addRowAfter().run()}
                active={false}
                title="Add Row"
              >
                +Row
              </Btn>
              <Btn
                onClick={() => editor.chain().focus().deleteTable().run()}
                active={false}
                title="Delete Table"
                style={{ color: "#d82c0d" }}
              >
                ✕Tbl
              </Btn>
            </>
          )}
        </div>
        <Sep />

        {/* ── Undo/Redo ── */}
        <div className="tiptap-toolbar__group">
          <Btn
            onClick={() => editor.chain().focus().undo().run()}
            active={false}
            title="Undo"
          >
            ↩
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().redo().run()}
            active={false}
            title="Redo"
          >
            ↪
          </Btn>
        </div>
        <Sep />
        <div className="tiptap-toolbar__group" style={{ marginLeft: "auto" }}>
          <Btn
            onClick={() => setShowHtml(!showHtml)}
            active={showHtml}
            title="Edit HTML"
          >
            {"</>"}
          </Btn>
        </div>
      </div>

      {showHtml ? (
        <textarea
          value={content || ""}
          onChange={(e) => onChange?.(e.target.value)}
          style={{
            width: "100%",
            minHeight: "400px",
            padding: "16px",
            fontFamily: "monospace",
            fontSize: "14px",
            border: "none",
            borderTop: "1px solid #c9cccf",
            resize: "vertical",
            boxSizing: "border-box",
            background: "#fafbfc"
          }}
          placeholder="<p>Write your HTML here...</p>"
        />
      ) : (
        <EditorContent editor={editor} className="tiptap-content" />
      )}

      {/* YouTube/Video embed modal */}
      {showYoutubeModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: "24px",
              borderRadius: "12px",
              width: "420px",
              boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
            }}
          >
            <p
              style={{
                fontWeight: "700",
                fontSize: "16px",
                marginBottom: "12px",
              }}
            >
              Embed Video
            </p>
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="YouTube or Vimeo URL..."
              autoFocus
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #c9cccf",
                borderRadius: "6px",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
            <div
              style={{
                display: "flex",
                gap: "8px",
                marginTop: "12px",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setShowYoutubeModal(false);
                  setYoutubeUrl("");
                }}
                style={cancelBtnStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleYoutubeEmbed}
                style={primaryBtnStyle}
              >
                Embed
              </button>
            </div>
          </div>
        </div>
      )}

      <ShopifyFilePicker
        open={showShopifyPicker}
        onClose={() => setShowShopifyPicker(false)}
        onSelect={(url) => editor.chain().focus().setImage({ src: url }).run()}
      />
    </div>
  );
}

const primaryBtnStyle = {
  padding: "8px 20px",
  background: "#008060",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: "600",
};
const cancelBtnStyle = {
  padding: "8px 20px",
  background: "#f1f2f3",
  color: "#202223",
  border: "1px solid #c9cccf",
  borderRadius: "6px",
  cursor: "pointer",
};

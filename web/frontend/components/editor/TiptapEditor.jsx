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
import { CustomTableHeader, CustomTableCell } from "./extensions/tableExtensions";
import { ProductGridExtension } from "./extensions/ProductGridExtension";
import { CollectionExtension } from "./extensions/CollectionExtension";
import { BuyButtonExtension } from "./extensions/BuyButtonExtension";
import { LegacyProductCardExtension, LegacyStickyProductExtension, LegacyFeaturedProductExtension } from "./extensions/LegacyBuyButtonExtensions";
import { LegacyProductSwitcherExtension } from "./extensions/LegacyProductGridExtensions";
import { ProductSliderExtension } from "./extensions/ProductSliderExtension";
import { CTAButtonExtension } from "./extensions/CTAButtonExtension";
import { HeroExtension } from "./extensions/HeroExtension";
import { VideoExtension } from "./extensions/VideoExtension";
import { SpacerExtension } from "./extensions/SpacerExtension";
import { DividerExtension } from "./extensions/DividerExtension";
import { ImageBlockExtension } from "./extensions/ImageBlockExtension";
import ShopifyFilePicker from "../ShopifyFilePicker";
import { useState, useEffect, useMemo, useRef } from "react";
import { Modal, TextField, FormLayout } from "@shopify/polaris";
import "./TiptapEditor.css";

const Btn = ({ onClick, active, disabled = false, title, children, style = {} }) => (
  <button
    type="button"
    disabled={disabled}
    aria-pressed={active}
    onMouseDown={(e) => {
      e.preventDefault();
      if (!disabled) onClick();
    }}
    className={`tiptap-btn${active ? " tiptap-btn--active" : ""}${disabled ? " tiptap-btn--disabled" : ""}`}
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
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [tablePickerHover, setTablePickerHover] = useState({ row: 0, col: 0 });
  const tablePickerRef = useRef(null);

  // Stable refs to avoid render-phase updates
  const onChangeRef = useRef(onChange);
  const lastEmittedHtmlRef = useRef(content || "");
  const frameRef = useRef(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  // Close table grid picker on outside click
  useEffect(() => {
    if (!showTablePicker) return;
    const handleOutsideClick = (e) => {
      if (tablePickerRef.current && !tablePickerRef.current.contains(e.target)) {
        setShowTablePicker(false);
        setTablePickerHover({ row: 0, col: 0 });
      }
    };
    document.addEventListener("mousedown", handleOutsideClick, true);
    return () => document.removeEventListener("mousedown", handleOutsideClick, true);
  }, [showTablePicker]);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        // StarterKit v3 includes Link + Underline; disable to avoid duplicates
        link: false,
        underline: false,
      }),
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
      CustomTableHeader,
      CustomTableCell,
      ProductGridExtension,
      CollectionExtension,
      BuyButtonExtension,
      LegacyProductCardExtension,
      LegacyStickyProductExtension,
      LegacyFeaturedProductExtension,
      LegacyProductSwitcherExtension,
      ProductSliderExtension,
      CTAButtonExtension,
      HeroExtension,
      VideoExtension,
      SpacerExtension,
      DividerExtension,
      ImageBlockExtension,
    ],
    []
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // placeholder is a prop that rarely changes; re-memoizing would recreate all extensions

  );

  const editor = useEditor({
    extensions,
    content,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      if (html === lastEmittedHtmlRef.current) return;

      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        lastEmittedHtmlRef.current = html;
        onChangeRef.current?.(html);
      });
    },
  });

  // Sync external content without triggering feedback loops
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const nextContent = content || "";
    const currentContent = editor.getHTML();
    if (!editor.isFocused && nextContent !== currentContent) {
      lastEmittedHtmlRef.current = nextContent;
      editor.commands.setContent(nextContent, false);
    }
  }, [content, editor]);

  if (!editor) return null;

  // ── Table state helpers ──────────────────────────────────────────────────
  const isInTable = editor.isActive("table");
  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();
  const canAddColBefore = editor.can().addColumnBefore();
  const canAddColAfter = editor.can().addColumnAfter();
  const canDeleteCol = editor.can().deleteColumn();
  const canAddRowBefore = editor.can().addRowBefore();
  const canAddRowAfter = editor.can().addRowAfter();
  const canDeleteRow = editor.can().deleteRow();
  const canMergeCells = editor.can().mergeCells();
  const canSplitCell = editor.can().splitCell();
  const canToggleHeaderRow = editor.can().toggleHeaderRow();
  const canToggleHeaderColumn = editor.can().toggleHeaderColumn();
  const canToggleHeaderCell = editor.can().toggleHeaderCell();
  const canDeleteTable = editor.can().deleteTable();

  const handleLinkInsert = () => {
    const previousUrl = editor.getAttributes("link").href || "";
    setLinkUrl(previousUrl);
    setShowLinkModal(true);
  };

  const handleLinkConfirm = () => {
    if (linkUrl) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: linkUrl }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setLinkUrl("");
    setShowLinkModal(false);
  };

  const handleYoutubeEmbed = () => {
    if (youtubeUrl) {
      editor.chain().focus().setYoutubeVideo({ src: youtubeUrl }).run();
      setYoutubeUrl("");
      setShowYoutubeModal(false);
    }
  };

  const handleTableInsert = (rows = 3, cols = 3) => {
    editor
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow: true })
      .run();
    setShowTablePicker(false);
    setTablePickerHover({ row: 0, col: 0 });
  };

  const GRID_ROWS = 8;
  const GRID_COLS = 10;

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
            {`"`}
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
          <Btn
            onClick={() => editor.chain().focus().insertContent({ type: 'dividerBlock' }).run()}
            active={editor.isActive("dividerBlock")}
            title="Insert Stylized Divider"
          >
            ➖
          </Btn>
          <Btn
            onClick={() => editor.chain().focus().insertContent({ type: 'imageBlock' }).run()}
            active={editor.isActive("imageBlock")}
            title="Insert Image Block with Caption/Border/Link"
          >
            🖼️
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
        <div className="tiptap-toolbar__group" style={{ flexWrap: "wrap", position: "relative" }} ref={tablePickerRef}>
          <Btn
            onClick={() => {
              setShowTablePicker((prev) => !prev);
              setTablePickerHover({ row: 0, col: 0 });
            }}
            active={isInTable || showTablePicker}
            title="Insert Table"
          >
            ⊞
          </Btn>
          {showTablePicker && (
            <div className="tiptap-table-grid-picker" onMouseLeave={() => { setTablePickerHover({ row: 0, col: 0 }); setShowTablePicker(false); }}>
              <div className="tiptap-table-grid-picker__label">
                {tablePickerHover.row > 0 && tablePickerHover.col > 0
                  ? `${tablePickerHover.row}×${tablePickerHover.col} Table`
                  : "Select table size"}
              </div>
              <div className="tiptap-table-grid-picker__grid">
                {Array.from({ length: GRID_ROWS }, (_, r) => (
                  <div key={r} className="tiptap-table-grid-picker__row">
                    {Array.from({ length: GRID_COLS }, (_, c) => (
                      <div
                        key={c}
                        className={`tiptap-table-grid-picker__cell${
                          r < tablePickerHover.row && c < tablePickerHover.col
                            ? " tiptap-table-grid-picker__cell--active"
                            : ""
                        }`}
                        onMouseEnter={() => setTablePickerHover({ row: r + 1, col: c + 1 })}
                        onClick={() => handleTableInsert(r + 1, c + 1)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
          {isInTable && (
            <>
              <Sep />
              <Btn
                onClick={() => editor.chain().focus().addColumnBefore().run()}
                disabled={!canAddColBefore}
                title="Add Column Before"
              >
                ◀+Col
              </Btn>
              <Btn
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                disabled={!canAddColAfter}
                title="Add Column After"
              >
                +Col▶
              </Btn>
              <Btn
                onClick={() => editor.chain().focus().deleteColumn().run()}
                disabled={!canDeleteCol}
                title="Delete Column"
                style={{ color: "#d82c0d" }}
              >
                ✕Col
              </Btn>
              <Sep />
              <Btn
                onClick={() => editor.chain().focus().addRowBefore().run()}
                disabled={!canAddRowBefore}
                title="Add Row Above"
              >
                ▲+Row
              </Btn>
              <Btn
                onClick={() => editor.chain().focus().addRowAfter().run()}
                disabled={!canAddRowAfter}
                title="Add Row Below"
              >
                +Row▼
              </Btn>
              <Btn
                onClick={() => editor.chain().focus().deleteRow().run()}
                disabled={!canDeleteRow}
                title="Delete Row"
                style={{ color: "#d82c0d" }}
              >
                ✕Row
              </Btn>
              <Sep />
              <Btn
                onClick={() => editor.chain().focus().mergeCells().run()}
                disabled={!canMergeCells}
                title="Merge Selected Cells"
              >
                Merge
              </Btn>
              <Btn
                onClick={() => editor.chain().focus().splitCell().run()}
                disabled={!canSplitCell}
                title="Split Cell"
              >
                Split
              </Btn>
              <Sep />
              <Btn
                onClick={() => editor.chain().focus().toggleHeaderRow().run()}
                disabled={!canToggleHeaderRow}
                title="Toggle Header Row"
              >
                HRow
              </Btn>
              <Btn
                onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
                disabled={!canToggleHeaderColumn}
                title="Toggle Header Column"
              >
                HCol
              </Btn>
              <Btn
                onClick={() => editor.chain().focus().toggleHeaderCell().run()}
                disabled={!canToggleHeaderCell}
                title="Toggle Header Cell"
              >
                HCel
              </Btn>
              <Sep />
              <label
                title="Cell Background Color"
                style={{ cursor: "pointer", display: "inline-flex", alignItems: "center" }}
                className="tiptap-btn"
              >
                <span>🎨</span>
                <input
                  type="color"
                  style={{ width: 0, height: 0, opacity: 0, position: "absolute" }}
                  onChange={(e) =>
                    editor.chain().focus().setCellAttribute("backgroundColor", e.target.value).run()
                  }
                />
              </label>
              <Btn
                onClick={() => editor.chain().focus().setCellAttribute("backgroundColor", null).run()}
                title="Clear Cell Background"
              >
                ✕🎨
              </Btn>
              <Sep />
              <Btn
                onClick={() => editor.chain().focus().deleteTable().run()}
                disabled={!canDeleteTable}
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
        <div className="tiptap-toolbar__group">              <Btn
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!canUndo}
                title="Undo"
              >
                ↩
              </Btn>
              <Btn
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!canRedo}
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

      {/* Link Insertion Modal */}
      {showLinkModal && (
        <Modal
          open={showLinkModal}
          onClose={() => {
            setShowLinkModal(false);
            setLinkUrl("");
          }}
          title="Insert Link"
          primaryAction={{
            content: "Insert",
            onAction: handleLinkConfirm,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => {
                setShowLinkModal(false);
                setLinkUrl("");
              },
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="URL"
                value={linkUrl}
                onChange={setLinkUrl}
                placeholder="https://example.com"
                autoComplete="off"
                autoFocus
              />
            </FormLayout>
          </Modal.Section>
        </Modal>
      )}

      {/* YouTube/Video embed modal */}
      {showYoutubeModal && (
        <Modal
          open={showYoutubeModal}
          onClose={() => {
            setShowYoutubeModal(false);
            setYoutubeUrl("");
          }}
          title="Embed Video"
          primaryAction={{
            content: "Embed",
            onAction: handleYoutubeEmbed,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => {
                setShowYoutubeModal(false);
                setYoutubeUrl("");
              },
            },
          ]}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Video URL (YouTube or Vimeo)"
                value={youtubeUrl}
                onChange={setYoutubeUrl}
                placeholder="https://www.youtube.com/watch?v=..."
                autoComplete="off"
                autoFocus
              />
            </FormLayout>
          </Modal.Section>
        </Modal>
      )}

      <ShopifyFilePicker
        open={showShopifyPicker}
        onClose={() => setShowShopifyPicker(false)}
        onSelect={(url) => editor.chain().focus().setImage({ src: url }).run()}
      />
    </div>
  );
}

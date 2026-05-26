import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import ShopifyFilePicker from "../ShopifyFilePicker";
import { useState } from "react";
import "./TiptapEditor.css";

const ToolbarButton = ({ onClick, active, title, children }) => (
  <button
    type="button"
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    className={`tiptap-btn${active ? " tiptap-btn--active" : ""}`}
    title={title}
  >
    {children}
  </button>
);

export default function TiptapEditor({ content, onChange, placeholder = "Start writing...", uploadUrl = "/api/posts/upload" }) {
  const [showShopifyPicker, setShowShopifyPicker] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.configure({ inline: false }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
    },
  });

  if (!editor) return null;

  const handleImageUpload = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch(uploadUrl, { method: "POST", body: form });
        const { url } = await res.json();
        if (url) editor.chain().focus().setImage({ src: url }).run();
      } catch (err) {
        console.error("Image upload failed:", err);
      }
    };
    input.click();
  };

  const handleLinkInsert = () => {
    const url = window.prompt("Enter URL:");
    if (url) {
      editor.chain().focus().extendMarkToLink({ href: url }).setLink({ href: url }).run();
    }
  };

  return (
    <div className="tiptap-editor-container">
      <div className="tiptap-toolbar">
        <div className="tiptap-toolbar__group">
          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold"><b>B</b></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic"><i>I</i></ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline"><u>U</u></ToolbarButton>
        </div>
        <div className="tiptap-toolbar__separator" />
        <div className="tiptap-toolbar__group">
          {[1, 2, 3].map((l) => (
            <ToolbarButton key={l} onClick={() => editor.chain().focus().toggleHeading({ level: l }).run()} active={editor.isActive("heading", { level: l })} title={`H${l}`}>H{l}</ToolbarButton>
          ))}
        </div>
        <div className="tiptap-toolbar__separator" />
        <div className="tiptap-toolbar__group">
          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet List">• —</ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered List">1.</ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Blockquote">"</ToolbarButton>
        </div>
        <div className="tiptap-toolbar__separator" />
        <div className="tiptap-toolbar__group">
          <ToolbarButton onClick={handleLinkInsert} active={editor.isActive("link")} title="Insert Link">🔗</ToolbarButton>
          <ToolbarButton onClick={handleImageUpload} active={false} title="Upload Image">🖼</ToolbarButton>
          <ToolbarButton onClick={() => setShowShopifyPicker(true)} active={false} title="Shopify Image">🛍</ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="Inline Code">&lt;/&gt;</ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} title="Code Block">{ "{ }" }</ToolbarButton>
        </div>
        <div className="tiptap-toolbar__separator" />
        <div className="tiptap-toolbar__group">
          <ToolbarButton onClick={() => editor.chain().focus().undo().run()} active={false} title="Undo">↩</ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().redo().run()} active={false} title="Redo">↪</ToolbarButton>
        </div>
      </div>
      <EditorContent editor={editor} className="tiptap-content" />
      
      <ShopifyFilePicker 
        open={showShopifyPicker} 
        onClose={() => setShowShopifyPicker(false)} 
        onSelect={(url) => editor.chain().focus().setImage({ src: url }).run()} 
      />
    </div>
  );
}

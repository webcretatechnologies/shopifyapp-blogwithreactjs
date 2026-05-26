/**
 * TextBlock — Rich text block using Tiptap for inline editing.
 * 
 * Architecture:
 * - In builder mode: shows Tiptap editor directly inside the canvas card
 * - Content stored as HTML string (backward compat with existing blocks)
 * - Settings panel is minimal since editing happens inline
 */
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { Link } from '@tiptap/extension-link';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { useEffect, useState } from 'react';
import { BlockStack, Text, Select, Button } from '@shopify/polaris';

// ── Preview (shown in canvas) ─────────────────────────────────────────────────
export function TextBlockPreview({ block, isSelected, onUpdate }) {
  const [showHtml, setShowHtml] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: block.content || '<p>Your text here...</p>',
    editable: isSelected && !showHtml, // only editable when selected and not in HTML mode
    onUpdate: ({ editor }) => {
      onUpdate?.({ content: editor.getHTML() });
    },
  });

  // Sync content when block changes externally (e.g. undo/redo, or raw html edit)
  useEffect(() => {
    if (editor && !editor.isFocused && !showHtml) {
      const current = editor.getHTML();
      if (block.content && current !== block.content) {
        editor.commands.setContent(block.content, false);
      }
    }
  }, [block.content, editor, showHtml]);

  // Update editable state on selection change
  useEffect(() => {
    if (editor) editor.setEditable(!!isSelected && !showHtml);
  }, [isSelected, showHtml, editor]);

  if (!editor) return null;

  return (
    <div
      style={{
        fontSize: '14px',
        lineHeight: '1.7',
        color: '#202223',
        cursor: isSelected ? 'text' : 'default',
      }}
    >
      {isSelected && (
        // Minimal inline toolbar when selected
        <div style={{
          display: 'flex',
          gap: '4px',
          marginBottom: '8px',
          padding: '4px 6px',
          background: '#f9fafb',
          borderRadius: '6px',
          border: '1px solid #e1e3e5',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}>
          {[
            { label: 'B', title: 'Bold', action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold'), style: { fontWeight: 700 }, disabled: showHtml },
            { label: 'I', title: 'Italic', action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic'), style: { fontStyle: 'italic' }, disabled: showHtml },
            { label: 'U', title: 'Underline', action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive('underline'), style: { textDecoration: 'underline' }, disabled: showHtml },
            { label: '≡L', title: 'Align Left', action: () => editor.chain().focus().setTextAlign('left').run(), active: editor.isActive({ textAlign: 'left' }), disabled: showHtml },
            { label: '≡C', title: 'Center', action: () => editor.chain().focus().setTextAlign('center').run(), active: editor.isActive({ textAlign: 'center' }), disabled: showHtml },
            { label: '≡R', title: 'Right', action: () => editor.chain().focus().setTextAlign('right').run(), active: editor.isActive({ textAlign: 'right' }), disabled: showHtml },
            { label: '</>', title: 'Edit HTML', action: () => setShowHtml(!showHtml), active: showHtml, isRight: true },
          ].map(({ label, title, action, active, style, disabled, isRight }) => (
            <button
              key={label}
              type="button"
              title={title}
              disabled={disabled}
              onMouseDown={e => { e.preventDefault(); action(); }}
              style={{
                padding: '2px 6px',
                fontSize: '12px',
                border: '1px solid',
                borderColor: active ? '#008060' : '#c9cccf',
                borderRadius: '4px',
                background: active ? '#e6f5f0' : '#fff',
                color: active ? '#008060' : '#3f4248',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                lineHeight: '1.4',
                marginLeft: isRight ? 'auto' : '0',
                ...style,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {showHtml ? (
        <textarea
          value={block.content || ''}
          onChange={(e) => onUpdate?.({ content: e.target.value })}
          style={{
            width: '100%',
            minHeight: '150px',
            padding: '12px',
            fontFamily: 'monospace',
            fontSize: '13px',
            border: '1px solid #e1e3e5',
            borderRadius: '4px',
            resize: 'vertical',
            boxSizing: 'border-box'
          }}
          placeholder="<p>Write your raw HTML here...</p>"
        />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}

// ── Settings Panel (shown in right sidebar) ────────────────────────────────────
export function TextBlockSettings({ block, onUpdate }) {
  return (
    <BlockStack gap="300">
      <Text variant="bodySm" tone="subdued">
        Click the text block on the canvas to edit it inline using the mini toolbar.
      </Text>
      <Text variant="bodyMd" fontWeight="semibold">Typography</Text>
      <Select
        label="Text Alignment"
        options={[
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' },
        ]}
        value={block.defaultAlign || 'left'}
        onChange={(v) => onUpdate({ defaultAlign: v })}
      />
    </BlockStack>
  );
}

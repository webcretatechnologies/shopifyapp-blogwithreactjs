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
import { BlockStack, Text, Select, Button, Box, InlineStack, TextField } from '@shopify/polaris';

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
        <Box padding="200" background="bg-surface-secondary" border="base" borderRadius="200" paddingBlockEnd="200">
          <InlineStack gap="100" wrap alignItems="center">
            {[
              { label: 'B', title: 'Bold', action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold'), disabled: showHtml },
              { label: 'I', title: 'Italic', action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic'), disabled: showHtml },
              { label: 'U', title: 'Underline', action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive('underline'), disabled: showHtml },
              { label: '≡L', title: 'Align Left', action: () => editor.chain().focus().setTextAlign('left').run(), active: editor.isActive({ textAlign: 'left' }), disabled: showHtml },
              { label: '≡C', title: 'Center', action: () => editor.chain().focus().setTextAlign('center').run(), active: editor.isActive({ textAlign: 'center' }), disabled: showHtml },
              { label: '≡R', title: 'Right', action: () => editor.chain().focus().setTextAlign('right').run(), active: editor.isActive({ textAlign: 'right' }), disabled: showHtml },
            ].map(({ label, title, action, active, disabled }) => (
              <Button
                key={label}
                title={title}
                disabled={disabled}
                pressed={active}
                onClick={action}
                size="micro"
              >
                {label}
              </Button>
            ))}
            <div style={{ flexGrow: 1 }} />
            <Button
              title="Edit HTML"
              pressed={showHtml}
              onClick={() => setShowHtml(!showHtml)}
              size="micro"
            >
              &lt;/&gt;
            </Button>
          </InlineStack>
        </Box>
      )}
      <Box paddingBlockStart={isSelected ? "200" : "0"}>
        {showHtml ? (
          <TextField
            value={block.content || ''}
            onChange={(v) => onUpdate?.({ content: v })}
            multiline={6}
            autoComplete="off"
            placeholder="<p>Write your raw HTML here...</p>"
          />
        ) : (
          <EditorContent editor={editor} />
        )}
      </Box>
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

/**
 * HeadingBlock — Simple heading block with inline text editing.
 * Stored as plain text (not Tiptap JSON) for backward compat.
 */
import { BlockStack, Select, TextField, Text } from '@shopify/polaris';

const SIZE_MAP = {
  h1: { fontSize: '28px', fontWeight: '700' },
  h2: { fontSize: '22px', fontWeight: '700' },
  h3: { fontSize: '18px', fontWeight: '600' },
  h4: { fontSize: '16px', fontWeight: '600' },
};

// ── Preview ───────────────────────────────────────────────────────────────────
export function HeadingBlockPreview({ block, isSelected, onUpdate }) {
  const style = SIZE_MAP[block.level || 'h2'];

  return (
    <div
      style={{
        ...style,
        color: block.color || '#202223',
        textAlign: block.align || 'left',
        outline: 'none',
        width: '100%',
        cursor: isSelected ? 'text' : 'default',
        padding: '2px 4px',
        borderRadius: '4px',
        border: isSelected ? '1px dashed #008060' : '1px dashed transparent',
        background: isSelected ? '#f0fdf9' : 'transparent',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      contentEditable={isSelected}
      suppressContentEditableWarning
      onBlur={(e) => {
        if (isSelected) onUpdate?.({ content: e.currentTarget.textContent });
      }}
    >
      {block.content || 'Your Heading'}
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
export function HeadingBlockSettings({ block, onUpdate }) {
  return (
    <BlockStack gap="300">
      <TextField
        label="Heading Text"
        value={block.content || ''}
        onChange={(v) => onUpdate({ content: v })}
        multiline={2}
        autoComplete="off"
      />
      <Select
        label="Heading Level"
        options={[
          { label: 'H1 — Page Title', value: 'h1' },
          { label: 'H2 — Section Title', value: 'h2' },
          { label: 'H3 — Subsection', value: 'h3' },
          { label: 'H4 — Minor heading', value: 'h4' },
        ]}
        value={block.level || 'h2'}
        onChange={(v) => onUpdate({ level: v })}
      />
      <Select
        label="Alignment"
        options={[
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' },
        ]}
        value={block.align || 'left'}
        onChange={(v) => onUpdate({ align: v })}
      />
      <div>
        <Text variant="bodySm" fontWeight="semibold">Text Color</Text>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
          <input
            type="color"
            value={block.color || '#202223'}
            onChange={(e) => onUpdate({ color: e.target.value })}
            style={{ width: 36, height: 36, border: '1px solid #c9cccf', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
          />
          <TextField
            label=""
            labelHidden
            value={block.color || '#202223'}
            onChange={(v) => onUpdate({ color: v })}
            autoComplete="off"
          />
        </div>
      </div>
    </BlockStack>
  );
}

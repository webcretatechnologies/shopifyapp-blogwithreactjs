/**
 * ImageBlock — Image block with optional caption, alignment, border radius, and link.
 * Integrates with ShopifyFilePicker for Shopify CDN images.
 */
import { BlockStack, TextField, Select, Text, Checkbox } from '@shopify/polaris';
import ShopifyFilePicker from '../../../ShopifyFilePicker';
import { useState } from 'react';

// ── Preview ───────────────────────────────────────────────────────────────────
export function ImageBlockPreview({ block }) {
  const wrapperStyle = {
    textAlign: block.align || 'center',
  };

  const imgStyle = {
    maxWidth: block.width || '100%',
    width: block.width || '100%',
    height: 'auto',
    borderRadius: block.borderRadius || '0px',
    display: 'block',
    margin: block.align === 'center' ? '0 auto' : block.align === 'right' ? '0 0 0 auto' : '0',
  };

  if (!block.src) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #f1f2f3, #e4e5e7)',
        borderRadius: block.borderRadius || '4px',
        height: '120px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        border: '2px dashed #c9cccf',
      }}>
        <span style={{ fontSize: '32px' }}>🖼</span>
        <span style={{ fontSize: '12px', color: '#6d7175' }}>Click settings to add an image</span>
      </div>
    );
  }

  const img = <img src={block.src} alt={block.alt || ''} style={imgStyle} />;

  return (
    <div style={wrapperStyle}>
      {block.linkUrl ? (
        <a href={block.linkUrl} onClick={e => e.preventDefault()} style={{ display: 'block' }}>
          {img}
        </a>
      ) : img}
      {block.caption && (
        <p style={{ marginTop: '8px', fontSize: '13px', color: '#6d7175', fontStyle: 'italic' }}>
          {block.caption}
        </p>
      )}
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
export function ImageBlockSettings({ block, onUpdate }) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <BlockStack gap="300">
      {/* Image source */}
      <Text variant="bodyMd" fontWeight="semibold">Image</Text>
      {block.src && (
        <img
          src={block.src}
          alt={block.alt || ''}
          style={{ width: '100%', borderRadius: '6px', maxHeight: '120px', objectFit: 'cover' }}
        />
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          style={{ flex: 1, padding: '6px 12px', border: '1px solid #c9cccf', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '13px' }}
        >
          {block.src ? 'Change Image' : '+ Add Image'}
        </button>
        {block.src && (
          <button
            type="button"
            onClick={() => onUpdate({ src: '' })}
            style={{ padding: '6px 10px', border: '1px solid #fed3d1', borderRadius: '6px', background: '#fff4f4', color: '#d82c0d', cursor: 'pointer', fontSize: '12px' }}
          >
            Remove
          </button>
        )}
      </div>
      <TextField
        label="Image URL (or paste directly)"
        value={block.src || ''}
        onChange={(v) => onUpdate({ src: v })}
        placeholder="https://..."
        autoComplete="off"
      />

      {/* Metadata */}
      <TextField
        label="Alt Text"
        value={block.alt || ''}
        onChange={(v) => onUpdate({ alt: v })}
        helpText="Describe the image for accessibility and SEO"
        autoComplete="off"
      />
      <TextField
        label="Caption (optional)"
        value={block.caption || ''}
        onChange={(v) => onUpdate({ caption: v })}
        autoComplete="off"
      />

      {/* Layout */}
      <Text variant="bodyMd" fontWeight="semibold">Layout</Text>
      <Select
        label="Width"
        options={[
          { label: 'Full Width (100%)', value: '100%' },
          { label: 'Large (80%)', value: '80%' },
          { label: 'Medium (60%)', value: '60%' },
          { label: 'Small (40%)', value: '40%' },
          { label: 'Thumbnail (200px)', value: '200px' },
        ]}
        value={block.width || '100%'}
        onChange={(v) => onUpdate({ width: v })}
      />
      <Select
        label="Alignment"
        options={[
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' },
        ]}
        value={block.align || 'center'}
        onChange={(v) => onUpdate({ align: v })}
      />
      <Select
        label="Corner Radius"
        options={[
          { label: 'None (sharp)', value: '0px' },
          { label: 'Slight (4px)', value: '4px' },
          { label: 'Rounded (8px)', value: '8px' },
          { label: 'More (16px)', value: '16px' },
          { label: 'Pill (50%)', value: '50%' },
        ]}
        value={block.borderRadius || '0px'}
        onChange={(v) => onUpdate({ borderRadius: v })}
      />

      {/* Link */}
      <Text variant="bodyMd" fontWeight="semibold">Link</Text>
      <TextField
        label="Link URL (optional)"
        value={block.linkUrl || ''}
        onChange={(v) => onUpdate({ linkUrl: v })}
        placeholder="https://yourstore.com/collections/..."
        helpText="Makes the image clickable"
        autoComplete="off"
      />

      <ShopifyFilePicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(url) => {
          onUpdate({ src: url });
          setShowPicker(false);
        }}
      />
    </BlockStack>
  );
}

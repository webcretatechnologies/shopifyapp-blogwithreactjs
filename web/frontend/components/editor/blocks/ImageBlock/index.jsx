/**
 * ImageBlock — Image block with optional caption, alignment, border radius, and link.
 * Integrates with ShopifyFilePicker for Shopify CDN images.
 */
import { BlockStack, TextField, Select, Text, Button, InlineStack, DropZone, Spinner, Banner } from '@shopify/polaris';
import ShopifyFilePicker from '../../../ShopifyFilePicker';
import { useState, useCallback } from 'react';

// ── Preview ───────────────────────────────────────────────────────────────────
export function ImageBlockPreview({ block }) {
  const imgStyle = {
    maxWidth: block.width || '100%',
    width: block.width || '100%',
    height: block.height || 'auto',
    objectFit: block.objectFit || 'cover',
    borderRadius: block.borderRadius || '0px',
    boxShadow: block.dropShadow === 'soft' ? '0 4px 12px rgba(0,0,0,0.1)' : block.dropShadow === 'medium' ? '0 8px 24px rgba(0,0,0,0.15)' : block.dropShadow === 'strong' ? '0 12px 32px rgba(0,0,0,0.25)' : 'none',
    display: 'block',
    margin: block.align === 'center' ? '0 auto' : block.align === 'right' ? '0 0 0 auto' : '0',
  };

  const paddingMap = { none: '0', small: '16px', medium: '32px', large: '64px' };
  const wrapperStyle = {
    textAlign: block.align || 'center',
    padding: paddingMap[block.padding || 'none'],
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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  const handleDropZoneDrop = useCallback(async (_dropFiles, acceptedFiles, _rejectedFiles) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    setUploading(true);
    setUploadError(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/posts/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (data.url) {
        onUpdate({ src: data.url });
      } else {
        throw new Error("No URL returned from upload");
      }
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }, [onUpdate]);

  return (
    <BlockStack gap="300">
      {/* Image source */}
      <Text variant="bodyMd" fontWeight="semibold">Image</Text>
      
      {uploadError && (
        <Banner tone="critical" onDismiss={() => setUploadError(null)}>
          {uploadError}
        </Banner>
      )}

      {block.src ? (
        <BlockStack gap="200">
          <img
            src={block.src}
            alt={block.alt || ''}
            style={{ width: '100%', borderRadius: '6px', maxHeight: '120px', objectFit: 'cover' }}
          />
          <InlineStack gap="200" wrap={false}>
            <Button onClick={() => setShowPicker(true)} fullWidth>
              Change Image
            </Button>
            <Button onClick={() => onUpdate({ src: '' })} tone="critical">
              Remove
            </Button>
          </InlineStack>
        </BlockStack>
      ) : (
        <DropZone accept="image/*" type="image" onDrop={handleDropZoneDrop}>
          {uploading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <Spinner size="large" />
              <div style={{ marginTop: '1rem' }}>Uploading...</div>
            </div>
          ) : (
            <DropZone.FileUpload actionHint="Accepts .gif, .jpg, .png, and .webp" />
          )}
        </DropZone>
      )}

      <InlineStack gap="200" align="center">
        {!block.src && (
          <Button onClick={() => setShowPicker(true)} fullWidth>
            Browse Shopify Files
          </Button>
        )}
      </InlineStack>

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
      <Text variant="bodyMd" fontWeight="semibold">Dimensions & Sizing</Text>
      <InlineStack gap="300" wrap={false}>
        <TextField
          label="Width"
          value={block.width || ''}
          onChange={(v) => onUpdate({ width: v })}
          placeholder="e.g. 100%, 400px"
          autoComplete="off"
        />
        <TextField
          label="Height"
          value={block.height || ''}
          onChange={(v) => onUpdate({ height: v })}
          placeholder="e.g. auto, 300px"
          autoComplete="off"
        />
      </InlineStack>
      <Select
        label="Object Fit (if height is set)"
        options={[
          { label: 'Cover (fills space, crops)', value: 'cover' },
          { label: 'Contain (fits inside, no crop)', value: 'contain' },
          { label: 'Fill (stretches)', value: 'fill' },
          { label: 'None (original size)', value: 'none' },
        ]}
        value={block.objectFit || 'cover'}
        onChange={(v) => onUpdate({ objectFit: v })}
      />

      <Text variant="bodyMd" fontWeight="semibold">Styling</Text>
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
        label="Padding"
        options={[
          { label: 'None', value: 'none' },
          { label: 'Small', value: 'small' },
          { label: 'Medium', value: 'medium' },
          { label: 'Large', value: 'large' },
        ]}
        value={block.padding || 'none'}
        onChange={(v) => onUpdate({ padding: v })}
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
      <Select
        label="Drop Shadow"
        options={[
          { label: 'None', value: 'none' },
          { label: 'Soft', value: 'soft' },
          { label: 'Medium', value: 'medium' },
          { label: 'Strong', value: 'strong' },
        ]}
        value={block.dropShadow || 'none'}
        onChange={(v) => onUpdate({ dropShadow: v })}
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

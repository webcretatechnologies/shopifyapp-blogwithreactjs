/**
 * HeroBlock — Full visual hero section with background image, overlay,
 * heading, subheading, and CTA button.
 * 
 * This is the first true "page builder" block — layout-heavy, not just text.
 * All props live flat on the block object (backward compat style).
 */
import { BlockStack, TextField, Select, Text, Checkbox } from '@shopify/polaris';
import ShopifyFilePicker from '../../../ShopifyFilePicker';
import { useState } from 'react';

// ── Preview ───────────────────────────────────────────────────────────────────
export function HeroBlockPreview({ block }) {
  const hasImage = Boolean(block.backgroundImage);
  const overlay = block.backgroundOverlay !== false;
  const overlayColor = block.overlayColor || '#000000';
  const overlayOpacity = parseFloat(block.overlayOpacity ?? 0.4);

  const containerStyle = {
    position: 'relative',
    minHeight: block.minHeight || '300px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: block.align === 'left' ? 'flex-start' : block.align === 'right' ? 'flex-end' : 'center',
    borderRadius: '8px',
    overflow: 'hidden',
    background: hasImage ? 'transparent' : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    padding: '40px 32px',
    boxSizing: 'border-box',
  };

  const rgbaOverlay = hexToRgba(overlayColor, overlayOpacity);

  return (
    <div style={containerStyle}>
      {/* Background image */}
      {hasImage && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${block.backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }} />
      )}

      {/* Overlay */}
      {(hasImage && overlay) && (
        <div style={{ position: 'absolute', inset: 0, background: rgbaOverlay }} />
      )}

      {/* Content */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        textAlign: block.align || 'center',
        maxWidth: '600px',
        width: '100%',
      }}>
        {block.heading && (
          <h2 style={{
            margin: '0 0 12px',
            fontSize: '28px',
            fontWeight: '700',
            color: block.textColor || '#ffffff',
            lineHeight: 1.2,
          }}>
            {block.heading}
          </h2>
        )}
        {block.subheading && (
          <p style={{
            margin: '0 0 24px',
            fontSize: '16px',
            color: block.textColor || '#ffffff',
            opacity: 0.85,
            lineHeight: 1.6,
          }}>
            {block.subheading}
          </p>
        )}
        {block.showCta !== false && block.ctaText && (
          <a
            href={block.ctaUrl || '/'}
            onClick={e => e.preventDefault()}
            style={{
              display: 'inline-block',
              padding: '12px 28px',
              background: block.ctaColor || '#008060',
              color: block.ctaTextColor || '#ffffff',
              borderRadius: '6px',
              fontWeight: '600',
              fontSize: '14px',
              textDecoration: 'none',
              transition: 'opacity 0.2s',
            }}
          >
            {block.ctaText}
          </a>
        )}
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
export function HeroBlockSettings({ block, onUpdate }) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <BlockStack gap="400">
      {/* Content */}
      <Text variant="bodyMd" fontWeight="semibold">Content</Text>
      <TextField
        label="Heading"
        value={block.heading || ''}
        onChange={(v) => onUpdate({ heading: v })}
        autoComplete="off"
      />
      <TextField
        label="Subheading"
        value={block.subheading || ''}
        onChange={(v) => onUpdate({ subheading: v })}
        multiline={2}
        autoComplete="off"
      />

      {/* Background */}
      <Text variant="bodyMd" fontWeight="semibold">Background</Text>
      <div>
        {block.backgroundImage && (
          <div style={{ marginBottom: '8px' }}>
            <img
              src={block.backgroundImage}
              alt="Background"
              style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '6px' }}
            />
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setShowPicker(true)}
            style={{ flex: 1, padding: '6px 12px', border: '1px solid #c9cccf', borderRadius: '6px', background: '#fff', cursor: 'pointer', fontSize: '13px' }}
          >
            {block.backgroundImage ? 'Change Image' : '+ Add Background Image'}
          </button>
          {block.backgroundImage && (
            <button
              type="button"
              onClick={() => onUpdate({ backgroundImage: '' })}
              style={{ padding: '6px 10px', border: '1px solid #fed3d1', borderRadius: '6px', background: '#fff4f4', color: '#d82c0d', cursor: 'pointer', fontSize: '12px' }}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <Checkbox
        label="Show dark overlay on background"
        checked={block.backgroundOverlay !== false}
        onChange={(v) => onUpdate({ backgroundOverlay: v })}
      />

      {block.backgroundOverlay !== false && (
        <Select
          label="Overlay Opacity"
          options={[
            { label: 'Light (20%)', value: '0.2' },
            { label: 'Medium (40%)', value: '0.4' },
            { label: 'Dark (60%)', value: '0.6' },
            { label: 'Very Dark (80%)', value: '0.8' },
          ]}
          value={String(block.overlayOpacity ?? '0.4')}
          onChange={(v) => onUpdate({ overlayOpacity: parseFloat(v) })}
        />
      )}

      {/* Layout */}
      <Text variant="bodyMd" fontWeight="semibold">Layout</Text>
      <Select
        label="Text Alignment"
        options={[
          { label: 'Left', value: 'left' },
          { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' },
        ]}
        value={block.align || 'center'}
        onChange={(v) => onUpdate({ align: v })}
      />
      <Select
        label="Minimum Height"
        options={[
          { label: 'Small (250px)', value: '250px' },
          { label: 'Medium (400px)', value: '400px' },
          { label: 'Large (550px)', value: '550px' },
          { label: 'Full Screen (100vh)', value: '100vh' },
        ]}
        value={block.minHeight || '400px'}
        onChange={(v) => onUpdate({ minHeight: v })}
      />

      {/* Colors */}
      <Text variant="bodyMd" fontWeight="semibold">Colors</Text>
      <ColorField label="Text Color" value={block.textColor || '#ffffff'} onChange={(v) => onUpdate({ textColor: v })} />

      {/* CTA */}
      <Text variant="bodyMd" fontWeight="semibold">Call to Action</Text>
      <Checkbox
        label="Show CTA button"
        checked={block.showCta !== false}
        onChange={(v) => onUpdate({ showCta: v })}
      />
      {block.showCta !== false && (
        <>
          <TextField
            label="Button Text"
            value={block.ctaText || ''}
            onChange={(v) => onUpdate({ ctaText: v })}
            autoComplete="off"
          />
          <TextField
            label="Button URL"
            value={block.ctaUrl || '/'}
            onChange={(v) => onUpdate({ ctaUrl: v })}
            autoComplete="off"
          />
          <ColorField label="Button Color" value={block.ctaColor || '#008060'} onChange={(v) => onUpdate({ ctaColor: v })} />
          <ColorField label="Button Text Color" value={block.ctaTextColor || '#ffffff'} onChange={(v) => onUpdate({ ctaTextColor: v })} />
        </>
      )}

      <ShopifyFilePicker
        open={showPicker}
        onClose={() => setShowPicker(false)}
        onSelect={(url) => {
          onUpdate({ backgroundImage: url });
          setShowPicker(false);
        }}
      />
    </BlockStack>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function ColorField({ label, value, onChange }) {
  return (
    <div>
      <Text variant="bodySm" fontWeight="semibold">{label}</Text>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 36, height: 36, border: '1px solid #c9cccf', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
        />
        <TextField label="" labelHidden value={value} onChange={onChange} autoComplete="off" />
      </div>
    </div>
  );
}

function hexToRgba(hex, opacity) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0,0,0,${opacity})`;
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

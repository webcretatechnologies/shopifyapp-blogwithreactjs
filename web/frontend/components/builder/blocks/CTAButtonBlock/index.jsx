/**
 * CTAButtonBlock — Call-to-action button block.
 * Migrated from legacy hardcoded switch into registry pattern.
 */
import { BlockStack, TextField, Select, Text } from '@shopify/polaris';

export function CTAButtonBlockPreview({ block }) {
  return (
    <div style={{ textAlign: block.align || 'center', padding: '8px 0' }}>
      <span style={{
        display: 'inline-block',
        padding: '10px 24px',
        background: block.color || '#008060',
        color: block.textColor || '#fff',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'default',
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
      }}>
        {block.text || 'Shop Now'}
      </span>
      {block.url && (
        <div style={{ fontSize: '11px', color: '#8c9196', marginTop: '4px' }}>
          → {block.url}
        </div>
      )}
    </div>
  );
}

export function CTAButtonBlockSettings({ block, onUpdate }) {
  return (
    <BlockStack gap="300">
      <TextField
        label="Button Text"
        value={block.text || ''}
        onChange={(v) => onUpdate({ text: v })}
        autoComplete="off"
      />
      <TextField
        label="Link URL"
        value={block.url || ''}
        onChange={(v) => onUpdate({ url: v })}
        placeholder="https://yourstore.com/..."
        autoComplete="off"
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
      <Text variant="bodyMd" fontWeight="semibold">Colors</Text>
      <ColorField label="Button Background" value={block.color || '#008060'} onChange={(v) => onUpdate({ color: v })} />
      <ColorField label="Button Text Color" value={block.textColor || '#ffffff'} onChange={(v) => onUpdate({ textColor: v })} />
      <Select
        label="Button Size"
        options={[
          { label: 'Small', value: 'small' },
          { label: 'Medium', value: 'medium' },
          { label: 'Large', value: 'large' },
        ]}
        value={block.size || 'medium'}
        onChange={(v) => onUpdate({ size: v })}
      />
      <Select
        label="Border Radius"
        options={[
          { label: 'Sharp (0px)', value: '0px' },
          { label: 'Slight (4px)', value: '4px' },
          { label: 'Rounded (8px)', value: '8px' },
          { label: 'Pill (100px)', value: '100px' },
        ]}
        value={block.borderRadius || '6px'}
        onChange={(v) => onUpdate({ borderRadius: v })}
      />
    </BlockStack>
  );
}

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
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1, padding: '6px 10px', border: '1px solid #c9cccf', borderRadius: '6px', fontSize: '13px' }}
        />
      </div>
    </div>
  );
}

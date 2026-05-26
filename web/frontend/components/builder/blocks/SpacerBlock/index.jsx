/**
 * SpacerBlock — Vertical whitespace between sections.
 */
import { Select } from '@shopify/polaris';

export function SpacerBlockPreview({ block }) {
  const height = block.height || '40px';
  return (
    <div style={{
      height,
      background: 'repeating-linear-gradient(45deg, #f1f2f3, #f1f2f3 4px, #fff 4px, #fff 16px)',
      borderRadius: '4px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <span style={{ fontSize: '10px', color: '#babec3', background: '#fff', padding: '0 8px', borderRadius: '4px' }}>
        SPACER — {height}
      </span>
    </div>
  );
}

export function SpacerBlockSettings({ block, onUpdate }) {
  return (
    <Select
      label="Height"
      options={[
        { label: 'Extra Small (12px)', value: '12px' },
        { label: 'Small (24px)', value: '24px' },
        { label: 'Medium (40px)', value: '40px' },
        { label: 'Large (64px)', value: '64px' },
        { label: 'Extra Large (96px)', value: '96px' },
        { label: 'Giant (120px)', value: '120px' },
      ]}
      value={block.height || '40px'}
      onChange={(v) => onUpdate({ height: v })}
    />
  );
}

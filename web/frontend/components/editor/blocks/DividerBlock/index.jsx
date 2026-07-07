/**
 * DividerBlock — Visual horizontal rule between sections.
 */
import { BlockStack, Select, Text, Box, InlineStack, TextField } from '@shopify/polaris';

export function DividerBlockPreview({ block }) {
  return (
    <div style={{ padding: '8px 0' }}>
      <hr style={{
        border: 'none',
        borderTop: `2px ${block.style || 'solid'} ${block.color || '#e1e3e5'}`,
        margin: 0,
      }} />
    </div>
  );
}

export function DividerBlockSettings({ block, onUpdate }) {
  return (
    <BlockStack gap="300">
      <Select
        label="Line Style"
        options={[
          { label: 'Solid', value: 'solid' },
          { label: 'Dashed', value: 'dashed' },
          { label: 'Dotted', value: 'dotted' },
          { label: 'Double', value: 'double' },
        ]}
        value={block.style || 'solid'}
        onChange={(v) => onUpdate({ style: v })}
      />
      <Select
        label="Thickness"
        options={[
          { label: 'Thin (1px)', value: '1px' },
          { label: 'Medium (2px)', value: '2px' },
          { label: 'Thick (4px)', value: '4px' },
        ]}
        value={block.thickness || '1px'}
        onChange={(v) => onUpdate({ thickness: v })}
      />
      <Box>
        <Text variant="bodyMd" fontWeight="semibold">Color</Text>
        <Box paddingBlockStart="100">
          <InlineStack gap="200" blockAlign="center" wrap={false}>
            <input
              type="color"
              value={block.color || '#e1e3e5'}
              onChange={(e) => onUpdate({ color: e.target.value })}
              style={{ width: 36, height: 36, border: '1px solid var(--p-color-border)', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
            />
            <div style={{ flex: 1 }}>
              <TextField
                value={block.color || '#e1e3e5'}
                onChange={(v) => onUpdate({ color: v })}
                autoComplete="off"
              />
            </div>
          </InlineStack>
        </Box>
      </Box>
      <Select
        label="Vertical Spacing"
        options={[
          { label: 'Small (12px)', value: '12px' },
          { label: 'Medium (24px)', value: '24px' },
          { label: 'Large (40px)', value: '40px' },
        ]}
        value={block.margin || '20px'}
        onChange={(v) => onUpdate({ margin: v })}
      />
    </BlockStack>
  );
}

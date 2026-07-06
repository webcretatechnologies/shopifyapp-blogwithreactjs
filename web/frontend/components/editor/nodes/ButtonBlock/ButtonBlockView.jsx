import React, { useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { Modal, FormLayout, TextField, Select, Checkbox } from '@shopify/polaris';
import { getButtonStyles } from './ButtonBlock';

export default function ButtonBlockView({ node, updateAttributes, deleteNode }) {
  const [showSettings, setShowSettings] = useState(false);
  const attrs = node.attrs;

  const handleUpdate = (key, value) => {
    updateAttributes({ [key]: value });
  };

  const { padding, fontSize, bg, border, color } = getButtonStyles(attrs);

  const styleOptions = [
    { label: 'Filled', value: 'filled' },
    { label: 'Outlined', value: 'outlined' },
    { label: 'Ghost', value: 'ghost' },
  ];

  const sizeOptions = [
    { label: 'Small', value: 'small' },
    { label: 'Medium', value: 'medium' },
    { label: 'Large', value: 'large' },
  ];

  return (
    <NodeViewWrapper 
      className="tiptap-button-block tiptap-block"
      style={{
        textAlign: attrs.alignment,
        margin: '1.5rem 0',
        position: 'relative'
      }}
    >
      <div 
        className="button-block-toolbar tiptap-block-toolbar" 
        contentEditable={false}
        style={{
          display: 'flex',
          gap: '8px',
          padding: '4px',
          background: '#f4f6f8',
          border: '1px solid #dfe3e8',
          borderRadius: '4px',
          position: 'absolute',
          top: '-36px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          alignItems: 'center'
        }}
      >
        <button type="button" onClick={() => handleUpdate('alignment', 'left')} className={`tiptap-btn ${attrs.alignment === 'left' ? 'tiptap-btn--active' : ''}`}>← L</button>
        <button type="button" onClick={() => handleUpdate('alignment', 'center')} className={`tiptap-btn ${attrs.alignment === 'center' ? 'tiptap-btn--active' : ''}`}>C</button>
        <button type="button" onClick={() => handleUpdate('alignment', 'right')} className={`tiptap-btn ${attrs.alignment === 'right' ? 'tiptap-btn--active' : ''}`}>R →</button>
        <div style={{ width: '1px', background: '#ccc', margin: '0 4px', height: '16px' }} />
        <button type="button" onClick={() => setShowSettings(true)} className="tiptap-btn">⚙️ Settings</button>
        <button type="button" onClick={() => deleteNode()} className="tiptap-btn" style={{color: '#d82c0d'}}>🗑</button>
      </div>

      <div 
        style={{ 
          display: attrs.fullWidth ? 'block' : 'inline-block', 
          padding, 
          fontSize, 
          backgroundColor: bg, 
          border, 
          color, 
          borderRadius: `${attrs.borderRadius}px`,
          cursor: 'pointer',
          textDecoration: 'none',
          textAlign: 'center',
          userSelect: 'none'
        }}
        onClick={(e) => { e.preventDefault(); setShowSettings(true); }}
      >
        {attrs.text}
      </div>

      {showSettings && (
        <Modal
          open={showSettings}
          onClose={() => setShowSettings(false)}
          title="Button Settings"
          primaryAction={{
            content: 'Done',
            onAction: () => setShowSettings(false),
          }}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Button Text"
                value={attrs.text}
                onChange={(val) => handleUpdate('text', val)}
                autoComplete="off"
              />
              <TextField
                label="Link URL"
                value={attrs.url}
                onChange={(val) => handleUpdate('url', val)}
                autoComplete="off"
              />
              <FormLayout.Group>
                <Select
                  label="Style"
                  options={styleOptions}
                  value={attrs.variant}
                  onChange={(val) => handleUpdate('variant', val)}
                />
                <Select
                  label="Size"
                  options={sizeOptions}
                  value={attrs.size}
                  onChange={(val) => handleUpdate('size', val)}
                />
              </FormLayout.Group>
              <FormLayout.Group>
                <TextField
                  label="Button Color"
                  type="color"
                  value={attrs.color}
                  onChange={(val) => handleUpdate('color', val)}
                  autoComplete="off"
                />
                {attrs.variant === 'filled' && (
                  <TextField
                    label="Text Color"
                    type="color"
                    value={attrs.textColor}
                    onChange={(val) => handleUpdate('textColor', val)}
                    autoComplete="off"
                  />
                )}
              </FormLayout.Group>
              <FormLayout.Group>
                <TextField
                  label="Border Radius (px)"
                  type="number"
                  value={attrs.borderRadius.toString()}
                  onChange={(val) => handleUpdate('borderRadius', parseInt(val) || 0)}
                  autoComplete="off"
                />
                <Checkbox
                  label="Full Width"
                  checked={attrs.fullWidth}
                  onChange={(val) => handleUpdate('fullWidth', val)}
                />
              </FormLayout.Group>
            </FormLayout>
          </Modal.Section>
        </Modal>
      )}
    </NodeViewWrapper>
  );
}

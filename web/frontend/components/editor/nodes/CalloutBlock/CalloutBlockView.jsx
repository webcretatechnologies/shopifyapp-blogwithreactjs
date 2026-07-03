import React, { useState } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { Modal, FormLayout, TextField } from '@shopify/polaris';

export default function CalloutBlockView({ node, updateAttributes, deleteNode }) {
  const [showSettings, setShowSettings] = useState(false);
  const attrs = node.attrs;

  const handleUpdate = (key, value) => {
    updateAttributes({ [key]: value });
  };

  const setType = (type, emoji, bg, border) => {
    updateAttributes({ type, emoji, backgroundColor: bg, borderColor: border });
  };

  return (
    <NodeViewWrapper 
      className="tiptap-callout-block"
      style={{
        backgroundColor: attrs.backgroundColor,
        borderLeft: `4px solid ${attrs.borderColor}`,
        padding: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        borderRadius: '4px',
        margin: '1.5rem 0',
        position: 'relative'
      }}
    >
      <div 
        className="callout-block-toolbar" 
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
          opacity: 0,
          transition: 'opacity 0.2s',
          alignItems: 'center'
        }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
        onMouseLeave={(e) => e.currentTarget.style.opacity = 0}
      >
        <button type="button" onClick={() => setType('info', 'ℹ️', '#f0f9ff', '#0ea5e9')} className="tiptap-btn">ℹ️ Info</button>
        <button type="button" onClick={() => setType('warning', '⚠️', '#fffbeb', '#f59e0b')} className="tiptap-btn">⚠️ Warning</button>
        <button type="button" onClick={() => setType('success', '✅', '#f0fdf4', '#22c55e')} className="tiptap-btn">✅ Success</button>
        <button type="button" onClick={() => setType('error', '❌', '#fef2f2', '#ef4444')} className="tiptap-btn">❌ Error</button>
        <button type="button" onClick={() => setType('tip', '💡', '#fdfbc8', '#eab308')} className="tiptap-btn">💡 Tip</button>
        
        <div style={{ width: '1px', background: '#ccc', margin: '0 4px', height: '16px' }} />
        
        <button type="button" onClick={() => setShowSettings(true)} className="tiptap-btn">⚙️ Custom</button>
        <button type="button" onClick={() => deleteNode()} className="tiptap-btn" style={{color: '#d82c0d'}}>🗑</button>
      </div>

      <span contentEditable={false} style={{ fontSize: '1.5rem', userSelect: 'none' }}>
        {attrs.emoji}
      </span>
      
      <NodeViewContent 
        className="callout-content" 
        style={{ flex: 1, minHeight: '1.5em', outline: 'none' }} 
      />

      {showSettings && (
        <Modal
          open={showSettings}
          onClose={() => setShowSettings(false)}
          title="Callout Settings"
          primaryAction={{
            content: 'Done',
            onAction: () => setShowSettings(false),
          }}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Emoji"
                value={attrs.emoji}
                onChange={(val) => handleUpdate('emoji', val)}
                autoComplete="off"
              />
              <TextField
                label="Background Color"
                type="color"
                value={attrs.backgroundColor}
                onChange={(val) => handleUpdate('backgroundColor', val)}
                autoComplete="off"
              />
              <TextField
                label="Border Color"
                type="color"
                value={attrs.borderColor}
                onChange={(val) => handleUpdate('borderColor', val)}
                autoComplete="off"
              />
            </FormLayout>
          </Modal.Section>
        </Modal>
      )}
    </NodeViewWrapper>
  );
}

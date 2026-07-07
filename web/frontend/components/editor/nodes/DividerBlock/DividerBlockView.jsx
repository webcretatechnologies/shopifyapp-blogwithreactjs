import React from 'react';
import { NodeViewWrapper } from '@tiptap/react';

export default function DividerBlockView({ node, updateAttributes, deleteNode }) {
  const attrs = node.attrs;

  const handleUpdate = (key, value) => {
    updateAttributes({ [key]: value });
  };

  return (
    <NodeViewWrapper 
      className="tiptap-divider-block tiptap-block"
      style={{
        position: 'relative',
        // Must match DividerBlock.js renderHTML's `margin: ${spacing}px 0`
        // exactly, or the editor shows different spacing than the published page.
        padding: `${attrs.spacing}px 0`
      }}
    >
      <div 
        className="divider-block-toolbar tiptap-block-toolbar" 
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
        <button type="button" onClick={() => handleUpdate('lineStyle', 'solid')} className={`tiptap-btn ${attrs.lineStyle === 'solid' ? 'tiptap-btn--active' : ''}`}>Solid</button>
        <button type="button" onClick={() => handleUpdate('lineStyle', 'dashed')} className={`tiptap-btn ${attrs.lineStyle === 'dashed' ? 'tiptap-btn--active' : ''}`}>Dashed</button>
        <button type="button" onClick={() => handleUpdate('lineStyle', 'dotted')} className={`tiptap-btn ${attrs.lineStyle === 'dotted' ? 'tiptap-btn--active' : ''}`}>Dotted</button>
        
        <div style={{ width: '1px', background: '#ccc', margin: '0 4px', height: '16px' }} />
        
        <input 
          type="color" 
          value={attrs.color} 
          onChange={(e) => handleUpdate('color', e.target.value)} 
          title="Color"
          style={{ width: '24px', height: '24px', padding: 0, border: 'none', cursor: 'pointer' }}
        />
        
        <div style={{ width: '1px', background: '#ccc', margin: '0 4px', height: '16px' }} />

        <input 
          type="number" 
          value={attrs.thickness} 
          onChange={(e) => handleUpdate('thickness', parseInt(e.target.value) || 1)} 
          min="1" max="10"
          title="Thickness (px)"
          style={{ width: '40px' }}
        />
        <span style={{ fontSize: '12px' }}>px</span>

        <button type="button" onClick={() => deleteNode()} className="tiptap-btn" style={{color: '#d82c0d'}}>🗑</button>
      </div>

      <hr 
        style={{
          borderTop: `${attrs.thickness}px ${attrs.lineStyle} ${attrs.color}`,
          borderLeft: 0,
          borderRight: 0,
          borderBottom: 0,
          margin: 0,
          width: '100%'
        }} 
      />
    </NodeViewWrapper>
  );
}

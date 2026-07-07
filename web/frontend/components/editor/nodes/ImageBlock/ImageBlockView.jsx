import React, { useState } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { Modal, FormLayout, TextField, Button } from '@shopify/polaris';
import ShopifyFilePicker from '../../../ShopifyFilePicker';

export default function ImageBlockView({ node, updateAttributes, deleteNode }) {
  const [showSettings, setShowSettings] = useState(false);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const attrs = node.attrs;

  const handleUpdate = (key, value) => {
    updateAttributes({ [key]: value });
  };

  const justifyContentMap = {
    'left': 'flex-start',
    'center': 'center',
    'right': 'flex-end',
  };

  return (
    <NodeViewWrapper 
      className="tiptap-image-block tiptap-block"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: justifyContentMap[attrs.alignment] || 'center',
        margin: '1.5rem 0',
        position: 'relative'
      }}
    >
      <div 
        className="image-block-toolbar tiptap-block-toolbar" 
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
        }}
      >
        <button type="button" onClick={() => handleUpdate('alignment', 'left')} className="tiptap-btn">← Left</button>
        <button type="button" onClick={() => handleUpdate('alignment', 'center')} className="tiptap-btn">Center</button>
        <button type="button" onClick={() => handleUpdate('alignment', 'right')} className="tiptap-btn">Right →</button>
        <div style={{ width: '1px', background: '#ccc', margin: '0 4px' }} />
        <button type="button" onClick={() => handleUpdate('width', '25%')} className="tiptap-btn">25%</button>
        <button type="button" onClick={() => handleUpdate('width', '50%')} className="tiptap-btn">50%</button>
        <button type="button" onClick={() => handleUpdate('width', '75%')} className="tiptap-btn">75%</button>
        <button type="button" onClick={() => handleUpdate('width', '100%')} className="tiptap-btn">100%</button>
        <div style={{ width: '1px', background: '#ccc', margin: '0 4px' }} />
        <button type="button" onClick={() => setShowSettings(true)} className="tiptap-btn">⚙ Settings</button>
        <button type="button" onClick={() => deleteNode()} className="tiptap-btn" style={{color: '#d82c0d'}}>🗑</button>
      </div>

      <div style={{ position: 'relative', width: attrs.width, maxWidth: '100%' }}>
        {attrs.src ? (
          <img 
            src={attrs.src} 
            alt={attrs.alt} 
            style={{ 
              width: '100%', 
              borderRadius: `${attrs.borderRadius}px`,
              display: 'block' 
            }} 
          />
        ) : (
          <div 
            style={{ 
              width: '100%', 
              background: '#f4f6f8', 
              padding: '2rem', 
              textAlign: 'center', 
              border: '1px dashed #c9cccf',
              cursor: 'pointer'
            }}
            onClick={() => setShowFilePicker(true)}
            contentEditable={false}
          >
            Click to select or upload an image
          </div>
        )}
      </div>

      <NodeViewContent 
        as="figcaption" 
        className="image-block-caption" 
        style={{ 
          marginTop: '8px', 
          fontSize: '14px', 
          color: '#6d7175', 
          textAlign: 'center',
          minWidth: '50px' 
        }} 
      />

      {showSettings && (
        <Modal
          open={showSettings}
          onClose={() => setShowSettings(false)}
          title="Image Settings"
          primaryAction={{
            content: 'Done',
            onAction: () => setShowSettings(false),
          }}
        >
          <Modal.Section>
            <FormLayout>
              <Button onClick={() => { setShowSettings(false); setShowFilePicker(true); }}>
                Browse Shopify Files
              </Button>
              <TextField
                label="Image URL"
                value={attrs.src}
                onChange={(val) => handleUpdate('src', val)}
                autoComplete="off"
              />
              <TextField
                label="Alt Text"
                value={attrs.alt}
                onChange={(val) => handleUpdate('alt', val)}
                autoComplete="off"
              />
              <TextField
                label="Link URL (optional)"
                value={attrs.linkUrl}
                onChange={(val) => handleUpdate('linkUrl', val)}
                autoComplete="off"
              />
              <TextField
                label="Border Radius"
                type="number"
                value={attrs.borderRadius.toString()}
                onChange={(val) => handleUpdate('borderRadius', parseInt(val) || 0)}
                autoComplete="off"
              />
            </FormLayout>
          </Modal.Section>
        </Modal>
      )}

      <ShopifyFilePicker
        open={showFilePicker}
        onClose={() => setShowFilePicker(false)}
        onSelect={(url) => {
          handleUpdate('src', url);
          setShowFilePicker(false);
        }}
      />
    </NodeViewWrapper>
  );
}

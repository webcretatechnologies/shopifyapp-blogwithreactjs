import React, { useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { Modal, FormLayout, TextField } from '@shopify/polaris';
import { getVideoEmbedUrl, getVideoProvider } from '../../utils/videoEmbed';

export default function VideoEmbedBlockView({ node, updateAttributes, deleteNode }) {
  const [showSettings, setShowSettings] = useState(false);
  const [tempUrl, setTempUrl] = useState('');
  const attrs = node.attrs;

  const handleUpdate = (key, value) => {
    if (key === 'url') {
      updateAttributes({ url: value, provider: getVideoProvider(value) });
    } else {
      updateAttributes({ [key]: value });
    }
  };

  const submitTempUrl = () => {
    handleUpdate('url', tempUrl);
  };

  const iframeSrc = getVideoEmbedUrl(attrs.url);

  return (
    <NodeViewWrapper 
      className="tiptap-video-embed-block tiptap-block"
      style={{
        width: attrs.width,
        margin: '1.5rem auto',
        position: 'relative'
      }}
    >
      <div 
        className="video-embed-toolbar tiptap-block-toolbar" 
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
        <button type="button" onClick={() => setShowSettings(true)} className="tiptap-btn">Edit URL</button>
        <div style={{ width: '1px', background: '#ccc', margin: '0 4px', height: '16px' }} />
        <button type="button" onClick={() => handleUpdate('width', '50%')} className={`tiptap-btn ${attrs.width === '50%' ? 'tiptap-btn--active' : ''}`}>50%</button>
        <button type="button" onClick={() => handleUpdate('width', '75%')} className={`tiptap-btn ${attrs.width === '75%' ? 'tiptap-btn--active' : ''}`}>75%</button>
        <button type="button" onClick={() => handleUpdate('width', '100%')} className={`tiptap-btn ${attrs.width === '100%' ? 'tiptap-btn--active' : ''}`}>100%</button>
        <div style={{ width: '1px', background: '#ccc', margin: '0 4px', height: '16px' }} />
        <button type="button" onClick={() => deleteNode()} className="tiptap-btn" style={{color: '#d82c0d'}}>🗑</button>
      </div>

      {!attrs.url ? (
        <div 
          style={{ 
            width: '100%', 
            background: '#f4f6f8', 
            padding: '3rem 2rem', 
            textAlign: 'center', 
            border: '1px dashed #c9cccf',
            borderRadius: '4px'
          }}
          contentEditable={false}
        >
          <div style={{ maxWidth: '400px', margin: '0 auto', display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              placeholder="Paste video URL (YouTube, Vimeo, Loom)..." 
              value={tempUrl}
              onChange={(e) => setTempUrl(e.target.value)}
              style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            <button 
              type="button" 
              onClick={submitTempUrl}
              style={{ padding: '8px 16px', background: '#2c6ecb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Embed
            </button>
          </div>
        </div>
      ) : (
        <div style={{ position: 'relative', paddingBottom: attrs.aspectRatio === '16:9' ? '56.25%' : '75%', height: 0, overflow: 'hidden', background: '#000', borderRadius: '4px' }}>
          <iframe 
            src={iframeSrc} 
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }} 
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          />
        </div>
      )}

      {showSettings && (
        <Modal
          open={showSettings}
          onClose={() => setShowSettings(false)}
          title="Video Embed Settings"
          primaryAction={{
            content: 'Done',
            onAction: () => setShowSettings(false),
          }}
        >
          <Modal.Section>
            <FormLayout>
              <TextField
                label="Video URL"
                value={attrs.url}
                onChange={(val) => handleUpdate('url', val)}
                autoComplete="off"
                helpText="YouTube, Vimeo, Loom, or direct video link"
              />
            </FormLayout>
          </Modal.Section>
        </Modal>
      )}
    </NodeViewWrapper>
  );
}

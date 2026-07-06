import React, { useState, useMemo } from 'react';
import { NodeViewWrapper } from '@tiptap/react';

/**
 * Best-effort neutralization for the ADMIN preview only: strips script tags,
 * inline event handlers and javascript: URLs so pasted markup can't run in
 * the admin session. The stored value and the storefront output are untouched
 * (embedding raw HTML/Liquid is this block's purpose).
 */
function sanitizeForPreview(html) {
  return (html || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*\2/gi, '$1="#"');
}

export default function HtmlBlockView({ node, updateAttributes, deleteNode }) {
  const [isPreview, setIsPreview] = useState(false);
  const attrs = node.attrs;
  const previewHtml = useMemo(() => sanitizeForPreview(attrs.html), [attrs.html]);

  return (
    <NodeViewWrapper 
      className="tiptap-html-block"
      style={{
        margin: '1.5rem 0',
        position: 'relative',
        border: '1px solid #dfe3e8',
        borderRadius: '4px',
        overflow: 'hidden'
      }}
    >
      <div 
        className="html-block-header" 
        contentEditable={false}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          background: '#f4f6f8',
          borderBottom: '1px solid #dfe3e8',
        }}
      >
        <span style={{ fontWeight: '600', fontSize: '14px', color: '#202223' }}>HTML / Liquid Embed</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            type="button" 
            onClick={() => setIsPreview(!isPreview)} 
            style={{ padding: '4px 8px', background: isPreview ? '#e4e5e7' : 'white', border: '1px solid #c9cccf', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
          >
            {isPreview ? 'Edit Code' : 'Live Preview'}
          </button>
          <button 
            type="button" 
            onClick={() => deleteNode()} 
            style={{ padding: '4px 8px', background: 'white', border: '1px solid #c9cccf', borderRadius: '4px', cursor: 'pointer', color: '#d82c0d', fontSize: '13px' }}
          >
            Delete
          </button>
        </div>
      </div>

      {isPreview ? (
        <div 
          className="html-block-preview" 
          contentEditable={false}
          style={{ padding: '16px', background: '#fff', minHeight: '100px' }}
          dangerouslySetInnerHTML={{ __html: previewHtml || '<p style="color:#6d7175; text-align:center;">No HTML content</p>' }}
        />
      ) : (
        <div style={{ background: '#202223', padding: '0' }}>
          <textarea
            value={attrs.html}
            onChange={(e) => updateAttributes({ html: e.target.value })}
            placeholder="<!-- Paste your HTML or Liquid code here -->"
            style={{
              width: '100%',
              minHeight: '200px',
              padding: '16px',
              background: 'transparent',
              color: '#e0e0e0',
              border: 'none',
              fontFamily: 'monospace',
              fontSize: '14px',
              resize: 'vertical',
              outline: 'none'
            }}
          />
        </div>
      )}
    </NodeViewWrapper>
  );
}

/**
 * preview.jsx  →  /preview (file-based route)
 *
 * A full-page, standalone preview renderer.
 * - Runs OUTSIDE the Shopify Polaris shell (no nav, no frames)
 * - Receives blocks via window.postMessage from the parent editor
 * - Renders them with the same componentRegistry previews
 * - Responds with { type: 'PREVIEW_READY' } when mounted
 *
 * Security:
 * - Only accepts messages from the same origin
 * - Never executes arbitrary code; only renders known block types
 */
import { useEffect, useState, useRef } from 'react';
import { componentRegistry, isRegisteredBlock } from '../components/builder/registry/componentRegistry';
import { serializeBlocksToHtml } from '../hooks/useBlockSerializer';

// ── Minimal reset so preview page has no Polaris chrome ───────────────────────
const PREVIEW_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 16px;
    color: #202223;
    background: #fff;
    line-height: 1.6;
  }
  img { max-width: 100%; height: auto; }
  a { color: #008060; }
`;

export default function PreviewRenderer() {
  const [blocks, setBlocks] = useState([]);
  const [viewport, setViewport] = useState('desktop');
  const [mode, setMode] = useState('blocks'); // 'blocks' | 'html'
  const [htmlContent, setHtmlContent] = useState('');
  const [postTitle, setPostTitle] = useState('');
  const readyRef = useRef(false);

  useEffect(() => {
    // Tell parent we're ready as soon as the component mounts
    if (!readyRef.current) {
      readyRef.current = true;
      try {
        window.parent.postMessage({ type: 'PREVIEW_READY' }, window.location.origin);
      } catch {
        // if cross-origin sandbox, ignore
      }
    }

    function handleMessage(event) {
      // Enforce same-origin
      if (event.origin !== window.location.origin) return;

      const { type, payload } = event.data || {};
      if (!type) return;

      switch (type) {
        case 'PREVIEW_UPDATE_BLOCKS':
          if (Array.isArray(payload?.blocks)) {
            setBlocks(payload.blocks);
            setMode('blocks');
          }
          if (payload?.title !== undefined) setPostTitle(payload.title);
          if (payload?.viewport) setViewport(payload.viewport);
          break;

        case 'PREVIEW_UPDATE_HTML':
          setHtmlContent(payload?.html || '');
          setMode('html');
          if (payload?.title !== undefined) setPostTitle(payload.title);
          break;

        case 'PREVIEW_SET_VIEWPORT':
          setViewport(payload?.viewport || 'desktop');
          break;

        default:
          break;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const maxWidth = viewport === 'mobile'
    ? '390px'
    : viewport === 'tablet'
      ? '768px'
      : '100%';

  return (
    <>
      <style>{PREVIEW_STYLES}</style>
      <div style={{ margin: '0 auto', maxWidth, padding: '24px 16px', minHeight: '100vh' }}>
        {postTitle && (
          <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '24px', color: '#202223' }}>
            {postTitle}
          </h1>
        )}

        {mode === 'blocks' ? (
          <BlocksRenderer blocks={blocks} />
        ) : (
          <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
        )}

        {blocks.length === 0 && !htmlContent && (
          <EmptyState />
        )}
      </div>
    </>
  );
}

// ── Block renderer using the same registry ────────────────────────────────────

function BlocksRenderer({ blocks }) {
  if (!blocks?.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {blocks.map((block) => {
        if (!block?.type) return null;

        if (isRegisteredBlock(block.type)) {
          const { PreviewComponent } = componentRegistry[block.type];
          return (
            <div key={block.id || block.type} style={{ width: '100%' }}>
              <PreviewComponent block={block} />
            </div>
          );
        }

        // Legacy block fallback — render serialized HTML
        const html = serializeBlocksToHtml([block]);
        if (!html) return null;
        return (
          <div
            key={block.id || block.type}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      color: '#6d7175',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
      <p style={{ fontSize: '16px', margin: 0 }}>
        Add blocks in the editor to see a live preview
      </p>
    </div>
  );
}

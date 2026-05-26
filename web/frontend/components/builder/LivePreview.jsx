/**
 * LivePreview.jsx
 *
 * The live-preview panel that sits alongside the builder canvas.
 * - Renders the preview inside a sandboxed iframe (→ /preview route)
 * - Syncs block data to the iframe via postMessage on every change
 * - Supports 3 viewport widths: desktop, tablet, mobile
 * - Shows an overlay frame and a device label
 *
 * Usage:
 *   <LivePreview blocks={blocks} title={postTitle} viewport={viewport} />
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Spinner, Text } from '@shopify/polaris';

// ── Viewport definitions ───────────────────────────────────────────────────────

const VIEWPORTS = {
  desktop: { width: '100%',  label: 'Desktop',  icon: '🖥' },
  tablet:  { width: '768px', label: 'Tablet',   icon: '📱' },
  mobile:  { width: '390px', label: 'Mobile',   icon: '📱' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function LivePreview({ blocks = [], title = '', viewport = 'desktop' }) {
  const iframeRef = useRef(null);
  const [iframeReady, setIframeReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const pendingPayloadRef = useRef(null);

  // ── Listen for the PREVIEW_READY handshake ──────────────────────────────────
  useEffect(() => {
    function handleMessage(event) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'PREVIEW_READY') {
        setIframeReady(true);
        setIsLoading(false);
        // Flush any payload that came in before the iframe was ready
        if (pendingPayloadRef.current) {
          sendToIframe(pendingPayloadRef.current);
          pendingPayloadRef.current = null;
        }
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // ── Send blocks on every change ─────────────────────────────────────────────
  const sendToIframe = useCallback((payload) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    try {
      iframe.contentWindow.postMessage(
        { type: 'PREVIEW_UPDATE_BLOCKS', payload },
        window.location.origin
      );
    } catch (e) {
      console.warn('[LivePreview] postMessage failed:', e);
    }
  }, []);

  useEffect(() => {
    const payload = { blocks, title, viewport };
    if (iframeReady) {
      sendToIframe(payload);
    } else {
      pendingPayloadRef.current = payload;
    }
  }, [blocks, title, viewport, iframeReady, sendToIframe]);

  // ── Update viewport inside iframe without re-loading ───────────────────────
  useEffect(() => {
    if (!iframeReady) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    try {
      iframe.contentWindow.postMessage(
        { type: 'PREVIEW_SET_VIEWPORT', payload: { viewport } },
        window.location.origin
      );
    } catch {}
  }, [viewport, iframeReady]);

  const vp = VIEWPORTS[viewport] || VIEWPORTS.desktop;

  return (
    <div style={styles.wrapper}>
      {/* Device chrome frame */}
      <div style={styles.deviceChrome}>
        <div style={styles.deviceBar}>
          <span style={styles.dot} />
          <span style={{ ...styles.dot, background: '#ffbd2e' }} />
          <span style={{ ...styles.dot, background: '#28c840' }} />
          <span style={styles.deviceLabel}>{vp.icon} {vp.label} Preview</span>
          {isLoading && <Spinner size="small" />}
        </div>

        {/* Outer viewport wrapper — clips the iframe to the device width */}
        <div style={{
          ...styles.viewportOuter,
          maxWidth: vp.width,
          transition: 'max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}>
          {/* Loading skeleton */}
          {isLoading && (
            <div style={styles.skeleton}>
              {[80, 60, 90, 50, 70].map((w, i) => (
                <div key={i} style={{ ...styles.skeletonLine, width: `${w}%` }} />
              ))}
            </div>
          )}

          <iframe
            ref={iframeRef}
            src="/preview"
            title="Live Preview"
            style={{
              ...styles.iframe,
              opacity: isLoading ? 0 : 1,
              transition: 'opacity 0.3s ease',
            }}
            // Restrict iframe capabilities while still allowing same-origin scripts
            sandbox="allow-scripts allow-same-origin allow-forms"
            onLoad={() => {
              // Reset ready state if iframe navigates (e.g. hard refresh)
              setIframeReady(false);
              setIsLoading(true);
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = {
  wrapper: {
    width: '100%',
    height: '100%',
    background: '#f4f4f5',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '16px',
    overflowY: 'auto',
  },
  deviceChrome: {
    width: '100%',
    maxWidth: '1200px',
    background: '#fff',
    borderRadius: '12px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
    overflow: 'hidden',
    border: '1px solid #e1e3e5',
  },
  deviceBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    background: '#f9fafb',
    borderBottom: '1px solid #e1e3e5',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: '#ff5f57',
    display: 'inline-block',
    flexShrink: 0,
  },
  deviceLabel: {
    flex: 1,
    fontSize: '12px',
    color: '#6d7175',
    fontWeight: '500',
    textAlign: 'center',
  },
  viewportOuter: {
    margin: '0 auto',
    width: '100%',
    position: 'relative',
    minHeight: '400px',
  },
  iframe: {
    width: '100%',
    height: '100%',
    minHeight: '600px',
    border: 'none',
    display: 'block',
  },
  skeleton: {
    position: 'absolute',
    inset: 0,
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    background: '#fff',
    zIndex: 1,
  },
  skeletonLine: {
    height: '16px',
    background: 'linear-gradient(90deg, #f1f2f3 25%, #e8e9ea 50%, #f1f2f3 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.4s infinite',
    borderRadius: '4px',
  },
};

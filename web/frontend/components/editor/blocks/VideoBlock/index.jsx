/**
 * VideoBlock — YouTube / Vimeo embed block.
 * Parses YouTube URL → embed iframe automatically.
 */
import { BlockStack, TextField, Select, Text } from '@shopify/polaris';

function extractYouTubeId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function extractVimeoId(url) {
  if (!url) return null;
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match ? match[1] : null;
}

export function VideoBlockPreview({ block }) {
  const youtubeId = extractYouTubeId(block.url || '');
  const vimeoId = extractVimeoId(block.url || '');

  if (!block.url) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
        borderRadius: '8px',
        height: '120px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        color: '#fff',
      }}>
        <span style={{ fontSize: '32px' }}>▶️</span>
        <span style={{ fontSize: '12px', opacity: 0.7 }}>Paste a YouTube or Vimeo URL in settings</span>
      </div>
    );
  }

  const embedSrc = youtubeId
    ? `https://www.youtube.com/embed/${youtubeId}`
    : vimeoId
      ? `https://player.vimeo.com/video/${vimeoId}`
      : null;

  if (embedSrc) {
    return (
      <div style={{ borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
          <iframe
            src={embedSrc}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
            allowFullScreen
            title={block.caption || 'Video'}
          />
        </div>
        {block.caption && (
          <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#6d7175', fontStyle: 'italic', textAlign: 'center' }}>
            {block.caption}
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{
      background: '#f1f2f3',
      borderRadius: '8px',
      padding: '16px',
      fontSize: '13px',
      color: '#6d7175',
      textAlign: 'center',
    }}>
      ⚠️ Unsupported video URL — use YouTube or Vimeo
    </div>
  );
}

export function VideoBlockSettings({ block, onUpdate }) {
  return (
    <BlockStack gap="300">
      <TextField
        label="Video URL"
        value={block.url || ''}
        onChange={(v) => onUpdate({ url: v })}
        placeholder="https://www.youtube.com/watch?v=..."
        helpText="Paste a YouTube or Vimeo URL"
        autoComplete="off"
      />
      <TextField
        label="Caption (optional)"
        value={block.caption || ''}
        onChange={(v) => onUpdate({ caption: v })}
        autoComplete="off"
      />
      <Select
        label="Aspect Ratio"
        options={[
          { label: '16:9 (Widescreen)', value: '56.25%' },
          { label: '4:3 (Standard)', value: '75%' },
          { label: '1:1 (Square)', value: '100%' },
        ]}
        value={block.aspectRatio || '56.25%'}
        onChange={(v) => onUpdate({ aspectRatio: v })}
      />
      <Select
        label="Max Width"
        options={[
          { label: 'Full Width', value: '100%' },
          { label: 'Large (80%)', value: '80%' },
          { label: 'Medium (640px)', value: '640px' },
          { label: 'Small (480px)', value: '480px' },
        ]}
        value={block.maxWidth || '100%'}
        onChange={(v) => onUpdate({ maxWidth: v })}
      />
    </BlockStack>
  );
}

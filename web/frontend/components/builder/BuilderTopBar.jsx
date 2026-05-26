/**
 * BuilderTopBar.jsx
 *
 * Top control bar for the Page Builder canvas.
 * Contains: undo/redo buttons, viewport switcher, dirty state indicator,
 * and a manual save button.
 *
 * Reads from editorStore (Zustand) so it stays in sync globally.
 */
import { useEditorStore } from '../../stores/editorStore';
import { Text, Badge, InlineStack } from '@shopify/polaris';

const VIEWPORTS = [
  { id: 'desktop', label: 'Desktop', icon: '🖥', width: '100%' },
  { id: 'tablet',  label: 'Tablet',  icon: '📱', width: '768px' },
  { id: 'mobile',  label: 'Mobile',  icon: '📲', width: '390px' },
];

export default function BuilderTopBar({ onSave, isSaving }) {
  const {
    undo, redo, canUndo, canRedo,
    viewport, setViewport,
    isDirty,
  } = useEditorStore();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      borderBottom: '1px solid #e1e3e5',
      background: '#fff',
      gap: '12px',
      minHeight: '48px',
    }}>
      {/* Left — Undo / Redo */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <ToolbarButton
          onClick={undo}
          disabled={!canUndo()}
          title="Undo (Ctrl+Z)"
          icon="↩"
        />
        <ToolbarButton
          onClick={redo}
          disabled={!canRedo()}
          title="Redo (Ctrl+Y)"
          icon="↪"
        />
        {isDirty && (
          <span style={{
            marginLeft: '8px',
            fontSize: '11px',
            color: '#6d7175',
            fontStyle: 'italic',
          }}>
            Unsaved changes
          </span>
        )}
      </div>

      {/* Center — Viewport switcher */}
      <div style={{
        display: 'flex',
        gap: '2px',
        background: '#f1f2f3',
        borderRadius: '8px',
        padding: '3px',
      }}>
        {VIEWPORTS.map(v => (
          <button
            key={v.id}
            type="button"
            title={v.label}
            onClick={() => setViewport(v.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 10px',
              border: 'none',
              borderRadius: '6px',
              background: viewport === v.id ? '#fff' : 'transparent',
              boxShadow: viewport === v.id ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: viewport === v.id ? '600' : '400',
              color: viewport === v.id ? '#202223' : '#6d7175',
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: '14px' }}>{v.icon}</span>
            <span style={{ fontSize: '12px' }}>{v.label}</span>
          </button>
        ))}
      </div>

      {/* Right — Save button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isSaving && (
          <span style={{ fontSize: '12px', color: '#6d7175' }}>Saving…</span>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty || isSaving}
          style={{
            padding: '6px 16px',
            background: isDirty && !isSaving ? '#008060' : '#f1f2f3',
            color: isDirty && !isSaving ? '#fff' : '#8c9196',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: isDirty && !isSaving ? 'pointer' : 'default',
            transition: 'all 0.15s',
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ToolbarButton({ onClick, disabled, title, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32, height: 32,
        border: '1px solid #e1e3e5',
        borderRadius: '6px',
        background: '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '16px',
        color: disabled ? '#c9cccf' : '#3f4248',
        transition: 'all 0.12s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#f1f2f3'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
    >
      {icon}
    </button>
  );
}

/**
 * Utility: Returns the canvas max-width for each viewport.
 */
export function getViewportWidth(viewport) {
  return VIEWPORTS.find(v => v.id === viewport)?.width ?? '100%';
}

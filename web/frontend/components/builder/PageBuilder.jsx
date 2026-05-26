/**
 * PageBuilder.jsx — Main canvas with drag-and-drop block reordering.
 *
 * v2 — Full registry + store integration:
 * - Reads/writes blocks from editorStore (Zustand)
 * - Syncs with controlled props (blocks / onChange) from new.jsx — zero breaking changes
 * - Undo/redo keyboard shortcuts via useBuilderKeyboard
 * - Viewport switcher (desktop / tablet / mobile)
 * - BuilderTopBar for save/undo UI
 * - Legacy block types fall back to BlockPreview/BlockSettings
 * - Phase 4: Live Preview via iframe + postMessage
 */
import { useState, useCallback, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { Text } from '@shopify/polaris';

import BuilderToolbar from './BuilderToolbar';
import BuilderTopBar, { getViewportWidth } from './BuilderTopBar';
import BlockSettings from './BlockSettings';
import BlockPreview from './BlockPreview';
import SortableBlock from './SortableBlock';
import LivePreview from './LivePreview';
import { useEditorStore, genBlockId } from '../../stores/editorStore';
import { getBlockMeta } from './registry/componentRegistry';
import { useBuilderKeyboard } from '../../hooks/useBuilderKeyboard';

/**
 * Props (all optional — store is primary source of truth):
 *   blocks:     Block[]    — controlled from new.jsx for initial load + sync
 *   onChange:   fn(blocks) — called whenever blocks change (keeps new.jsx in sync)
 *   onSave:     fn()       — called when user clicks Save in top bar
 *   isSaving:   boolean    — shows spinner in top bar
 *   showTopBar: boolean    — hide top bar if parent handles save UI (default: true)
 *   postTitle:  string     — article title forwarded to live preview
 */
export default function PageBuilder({
  blocks: controlledBlocks = [],
  onChange,
  onSave,
  isSaving = false,
  showTopBar = true,
  postTitle = '',
}) {
  const store = useEditorStore();
  const {
    blocks, selectedBlockId,
    addBlock, updateBlock, removeBlock, duplicateBlock,
    reorderBlocks,
    selectBlock, deselectBlock,
    viewport,
    loadBlocks,
  } = store;

  // ── Sync controlled → store on mount and when controlledBlocks change ────────
  // This is a one-way sync: parent controls initial state.
  // After that, store owns it and we call onChange to keep parent informed.
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!initialized && controlledBlocks.length > 0) {
      loadBlocks(controlledBlocks);
      setInitialized(true);
    }
  }, [controlledBlocks, initialized, loadBlocks]);

  // ── Notify parent whenever store blocks change ────────────────────────────────
  useEffect(() => {
    if (initialized && onChange) {
      onChange(blocks);
    }
  }, [blocks, initialized, onChange]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useBuilderKeyboard({ enabled: true });

  // ── Preview mode toggle ───────────────────────────────────────────────────────
  const [previewMode, setPreviewMode] = useState(false);

  // ── DnD ──────────────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleAddBlock = useCallback((blockType) => {
    const meta = getBlockMeta(blockType);
    const defaults = meta ? meta.defaultProps() : getLegacyDefaults(blockType);
    addBlock({ id: genBlockId(), ...defaults });
  }, [addBlock]);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex(b => b.id === active.id);
    const newIndex = blocks.findIndex(b => b.id === over.id);
    reorderBlocks(oldIndex, newIndex);
  }, [blocks, reorderBlocks]);

  const canvasWidth = getViewportWidth(viewport);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #e1e3e5', borderRadius: '8px', overflow: 'hidden', minHeight: '600px' }}>

      {/* ── Top bar: undo/redo + viewport + save ──────────────────── */}
      {showTopBar && (
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <BuilderTopBar onSave={onSave} isSaving={isSaving} />
          </div>
          {/* Preview toggle button */}
          <button
            type="button"
            onClick={() => setPreviewMode(p => !p)}
            style={{
              margin: '0 8px',
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid',
              borderColor: previewMode ? '#008060' : '#c9cccf',
              background: previewMode ? '#008060' : '#fff',
              color: previewMode ? '#fff' : '#202223',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {previewMode ? '✏️ Edit' : '👁 Preview'}
          </button>
        </div>
      )}

      {/* ── Main row: toolbar | canvas | settings ─────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: Block type toolbar */}
        <BuilderToolbar onAddBlock={handleAddBlock} />

        {/* Center: Canvas or Live Preview */}
        {previewMode ? (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <LivePreview blocks={blocks} title={postTitle} viewport={viewport} />
          </div>
        ) : (
          <div style={{
            flex: 1,
            background: '#f0f0f0',
            overflow: 'auto',
            display: 'flex',
            justifyContent: 'center',
            padding: '16px',
          }}>
            <div style={{
              width: canvasWidth,
              maxWidth: '100%',
              transition: 'width 0.3s ease',
              background: '#fff',
              borderRadius: '8px',
              minHeight: '500px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
              overflow: 'hidden',
            }}>
              {/* Viewport label */}
              {viewport !== 'desktop' && (
                <div style={{
                  textAlign: 'center',
                  padding: '6px',
                  background: '#f9fafb',
                  borderBottom: '1px solid #e1e3e5',
                  fontSize: '11px',
                  color: '#6d7175',
                  fontWeight: '600',
                }}>
                  {viewport === 'tablet' ? '📱 Tablet — 768px' : '📲 Mobile — 390px'}
                </div>
              )}

              {/* Block canvas content */}
              <div style={{ padding: '16px' }}>
                {blocks.length === 0 ? (
                  <EmptyCanvas />
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis]}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={blocks.map(b => b.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {blocks.map(block => (
                          <SortableBlock
                            key={block.id}
                            block={block}
                            isSelected={block.id === selectedBlockId}
                            onSelect={() =>
                              block.id === selectedBlockId
                                ? deselectBlock()
                                : selectBlock(block.id)
                            }
                            onRemove={() => removeBlock(block.id)}
                            onDuplicate={() => duplicateBlock(block.id)}
                          >
                            <RegistryBlockPreview
                              block={block}
                              isSelected={block.id === selectedBlockId}
                              onUpdate={(patch) => updateBlock(block.id, patch)}
                            />
                          </SortableBlock>
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Right: Block settings inspector (hidden during preview) */}
        {!previewMode && (
          <div style={{ width: '290px', borderLeft: '1px solid #e1e3e5', background: '#fff', overflow: 'auto', flexShrink: 0 }}>
            {selectedBlockId ? (
              <RegistryBlockSettings
                block={blocks.find(b => b.id === selectedBlockId)}
                onUpdate={(patch) => updateBlock(selectedBlockId, patch)}
                onClose={deselectBlock}
              />
            ) : (
              <SettingsPlaceholder />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Canvas components ─────────────────────────────────────────────────────────

function EmptyCanvas() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px', color: '#6d7175' }}>
      <div style={{ fontSize: '56px', marginBottom: '16px' }}>🧩</div>
      <Text variant="headingMd" tone="subdued">Your canvas is empty</Text>
      <div style={{ marginTop: '8px' }}>
        <Text variant="bodySm" tone="subdued">Click a block type in the left panel to add it here</Text>
      </div>
    </div>
  );
}

function SettingsPlaceholder() {
  return (
    <div style={{ padding: '24px', textAlign: 'center', color: '#6d7175', marginTop: '60px' }}>
      <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚙️</div>
      <Text variant="bodySm" tone="subdued">Select a block to edit its settings</Text>
    </div>
  );
}

// ── Registry dispatch ─────────────────────────────────────────────────────────

function RegistryBlockPreview({ block, isSelected, onUpdate }) {
  const meta = getBlockMeta(block?.type);
  if (!block) return null;
  if (meta) {
    const { PreviewComponent } = meta;
    return <PreviewComponent block={block} isSelected={isSelected} onUpdate={onUpdate} />;
  }
  return <BlockPreview block={block} />;
}

function RegistryBlockSettings({ block, onUpdate, onClose }) {
  const meta = getBlockMeta(block?.type);
  if (!block) return null;

  return (
    <div>
      {/* Unified header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #e1e3e5',
        background: '#f9fafb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {meta && (
            <span style={{ fontSize: '16px' }}>{meta.icon}</span>
          )}
          <span style={{ fontWeight: '600', fontSize: '13px' }}>
            {meta ? meta.label : block.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Settings
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: '#6d7175', lineHeight: 1 }}
        >
          ✕
        </button>
      </div>

      <div style={{ padding: '16px' }}>
        {meta ? (
          <meta.SettingsComponent block={block} onUpdate={onUpdate} />
        ) : (
          <BlockSettings block={block} onUpdate={onUpdate} onClose={onClose} _noHeader />
        )}
      </div>
    </div>
  );
}

// ── Legacy block defaults (unchanged) ─────────────────────────────────────────
function getLegacyDefaults(type) {
  const map = {
    product:          { shopifyProductId: '', title: '', image: '', price: '', handle: '', variantId: '', compareAtPrice: null, float: false, align: 'center' },
    product_slider:   { title: 'Featured Products', products: [] },
    product_sidebar:  { title: '', data: '', side: 'right', card_style: 'vertical', shopifyProductId: '', handle: '', image: '', price: '', variantId: '', compareAtPrice: null },
    product_switcher: { sections: [] },
    featured_product: { title: '', data: '', badge: 'FEATURED HERE', shopifyProductId: '', handle: '', image: '', price: '', variantId: '', compareAtPrice: null },
    html:             { code: '<!-- Your custom HTML -->' },
  };
  return { type, ...(map[type] || {}) };
}

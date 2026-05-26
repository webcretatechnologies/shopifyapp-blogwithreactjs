/**
 * editorStore.js
 * 
 * Zustand store for the Page Builder schema engine.
 * 
 * Design decisions:
 * - Keeps full blocks array as source of truth
 * - Provides atomic actions (addBlock, updateBlock, removeBlock, reorderBlocks)
 * - 50-step undo/redo via manual history stack (avoids zundo dep for now)
 * - Backward compatible: accepts both old flat-prop blocks and new {props} blocks
 * - PageBuilder still also accepts blocks/onChange props for existing new.jsx integration
 */
import { create } from 'zustand';
import { migrateBlocks } from '../components/builder/registry/BlockMigrator';

const MAX_HISTORY = 50;

function pushHistory(history, snapshot) {
  const next = [...history, snapshot];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

let _blockCounter = Date.now();
export const genBlockId = () => `block_${++_blockCounter}`;

export const useEditorStore = create((set, get) => ({
  // ── Core State ───────────────────────────────────────
  blocks: [],
  selectedBlockId: null,
  viewport: 'desktop', // 'desktop' | 'tablet' | 'mobile'
  isDirty: false,

  // Undo/redo
  _history: [],       // array of blocks snapshots (past)
  _future: [],        // array of blocks snapshots (future)

  // ── Schema I/O ───────────────────────────────────────
  /**
   * Load a full block array (e.g. from API on edit).
   * Migrates legacy blocks on load and clears history.
   */
  loadBlocks: (blocks) => set({
    blocks: migrateBlocks(blocks ?? []),
    selectedBlockId: null,
    _history: [],
    _future: [],
    isDirty: false,
  }),

  /**
   * Export current blocks for save/persist.
   */
  exportBlocks: () => get().blocks,

  // ── History helpers ───────────────────────────────────
  _snapshot: () => {
    const { blocks, _history, _future } = get();
    set({
      _history: pushHistory(_history, JSON.parse(JSON.stringify(blocks))),
      _future: [], // clear redo on new action
    });
  },

  undo: () => {
    const { blocks, _history, _future } = get();
    if (_history.length === 0) return;
    const prev = _history[_history.length - 1];
    set({
      blocks: prev,
      _history: _history.slice(0, -1),
      _future: [JSON.parse(JSON.stringify(blocks)), ..._future],
      isDirty: true,
    });
  },

  redo: () => {
    const { blocks, _history, _future } = get();
    if (_future.length === 0) return;
    const next = _future[0];
    set({
      blocks: next,
      _history: pushHistory(_history, JSON.parse(JSON.stringify(blocks))),
      _future: _future.slice(1),
      isDirty: true,
    });
  },

  canUndo: () => get()._history.length > 0,
  canRedo: () => get()._future.length > 0,

  // ── Block CRUD ────────────────────────────────────────
  /**
   * Add block after a specific block ID, or at end if afterId is null.
   */
  addBlock: (block, afterId = null) => {
    get()._snapshot();
    set((state) => {
      const newBlock = { id: genBlockId(), ...block };
      if (!afterId) {
        return { blocks: [...state.blocks, newBlock], isDirty: true };
      }
      const idx = state.blocks.findIndex(b => b.id === afterId);
      const next = [...state.blocks];
      next.splice(idx + 1, 0, newBlock);
      return { blocks: next, isDirty: true };
    });
  },

  /**
   * Update a block's fields. Merges patch into top-level block object.
   * Supports both old flat-prop style and new {props} style.
   */
  updateBlock: (id, patch) => {
    set((state) => ({
      blocks: state.blocks.map(b => b.id === id ? { ...b, ...patch } : b),
      isDirty: true,
    }));
  },

  removeBlock: (id) => {
    get()._snapshot();
    set((state) => ({
      blocks: state.blocks.filter(b => b.id !== id),
      selectedBlockId: state.selectedBlockId === id ? null : state.selectedBlockId,
      isDirty: true,
    }));
  },

  duplicateBlock: (id) => {
    get()._snapshot();
    set((state) => {
      const idx = state.blocks.findIndex(b => b.id === id);
      if (idx === -1) return {};
      const copy = { ...JSON.parse(JSON.stringify(state.blocks[idx])), id: genBlockId() };
      const next = [...state.blocks];
      next.splice(idx + 1, 0, copy);
      return { blocks: next, isDirty: true };
    });
  },

  reorderBlocks: (oldIndex, newIndex) => {
    get()._snapshot();
    set((state) => {
      const next = [...state.blocks];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      return { blocks: next, isDirty: true };
    });
  },

  // ── Selection ─────────────────────────────────────────
  selectBlock: (id) => set({ selectedBlockId: id }),
  deselectBlock: () => set({ selectedBlockId: null }),

  // ── Viewport ─────────────────────────────────────────
  setViewport: (v) => set({ viewport: v }),

  // ── Dirty flag ───────────────────────────────────────
  markClean: () => set({ isDirty: false }),
}));

import { create } from "zustand";
import { enablePatches, produceWithPatches, applyPatches } from "immer";
import { nanoid } from "./nanoid";
import { normalizeBlocksAst, createBlock } from "../BlockRegistry";
import { normalizeAst, denormalizeAst } from "./normalize";

enablePatches();

const MAX_HISTORY = 50;

export const useBuilderStore = create((set, get) => ({
  blocksById: {},
  rootIds: [],
  selectedBlockId: null,
  hoveredBlockId: null,
  past: [],
  future: [],
  deviceMode: "desktop", // 'desktop' | 'tablet' | 'mobile'
  zoomLevel: 1.0,

  _commit(recipe) {
    const current = { blocksById: get().blocksById, rootIds: get().rootIds };
    const [nextState, patches, inversePatches] = produceWithPatches(current, recipe);
    set((state) => ({
      blocksById: nextState.blocksById,
      rootIds: nextState.rootIds,
      past: [...state.past, { patches, inversePatches }].slice(-MAX_HISTORY),
      future: [],
    }));
  },

  addBlock(type, defaultSettings = {}, parentId = null, index = null) {
    let created = null;
    try {
      created = createBlock(type);
    } catch {
      created = { type, settings: {}, children: [] };
    }
    const block = {
      id: nanoid(),
      type: created.type,
      settings: { ...created.settings, ...defaultSettings },
      childrenIds: [],
      parentId: parentId,
    };
    
    get()._commit((draft) => {
      draft.blocksById[block.id] = block;
      const targetArr = parentId ? draft.blocksById[parentId].childrenIds : draft.rootIds;
      if (index === null || index === undefined || index >= targetArr.length) {
        targetArr.push(block.id);
      } else {
        targetArr.splice(index, 0, block.id);
      }
    });
    set({ selectedBlockId: block.id });
    return block.id;
  },

  deleteBlock(id) {
    const { selectedBlockId } = get();
    get()._commit((draft) => {
      const block = draft.blocksById[id];
      if (!block) return;
      const parentId = block.parentId;
      const targetArr = parentId ? draft.blocksById[parentId]?.childrenIds : draft.rootIds;
      
      if (targetArr) {
        const idx = targetArr.indexOf(id);
        if (idx !== -1) targetArr.splice(idx, 1);
      }

      // Recursively delete children
      const deleteRecursive = (blockId) => {
        const b = draft.blocksById[blockId];
        if (b && b.childrenIds) {
          b.childrenIds.forEach(deleteRecursive);
        }
        delete draft.blocksById[blockId];
      };
      deleteRecursive(id);
    });
    if (selectedBlockId === id) set({ selectedBlockId: null });
  },

  duplicateBlock(id) {
    const { blocksById, rootIds } = get();
    const original = blocksById[id];
    if (!original) return;

    // We can denormalize the original to get a full AST, deep clone it, then re-normalize
    const ast = denormalizeAst(blocksById, [id]);
    const cloneAst = JSON.parse(JSON.stringify(ast[0]));
    
    // Re-id all children
    const reId = (node) => {
      node.id = nanoid();
      node.children?.forEach(reId);
    };
    reId(cloneAst);
    
    const { blocksById: clonedBlocksById, rootIds: clonedRootIds } = normalizeAst([cloneAst], original.parentId);

    get()._commit((draft) => {
      // merge cloned into draft
      Object.assign(draft.blocksById, clonedBlocksById);
      const targetArr = original.parentId ? draft.blocksById[original.parentId].childrenIds : draft.rootIds;
      const originalIndex = targetArr.indexOf(id);
      if (originalIndex !== -1) {
        targetArr.splice(originalIndex + 1, 0, clonedRootIds[0]);
      } else {
        targetArr.push(clonedRootIds[0]);
      }
    });
    set({ selectedBlockId: clonedRootIds[0] });
  },

  updateBlockSettings(id, settingsPatch) {
    get()._commit((draft) => {
      const block = draft.blocksById[id];
      if (block) {
        Object.assign(block.settings, settingsPatch);

        if (block.type === "ColumnLayout" && settingsPatch.columns !== undefined) {
          const targetCols = parseInt(settingsPatch.columns) || 2;
          if (!Array.isArray(block.childrenIds)) {
            block.childrenIds = [];
          }
          while (block.childrenIds.length < targetCols) {
            const newColId = nanoid();
            draft.blocksById[newColId] = {
              id: newColId,
              type: "Column",
              settings: { width: "100%" },
              childrenIds: [],
              parentId: id
            };
            block.childrenIds.push(newColId);
          }
          if (block.childrenIds.length > targetCols) {
            const removedIds = block.childrenIds.splice(targetCols);
            const deleteRecursive = (blockId) => {
              const b = draft.blocksById[blockId];
              if (b && b.childrenIds) {
                b.childrenIds.forEach(deleteRecursive);
              }
              delete draft.blocksById[blockId];
            };
            removedIds.forEach(deleteRecursive);
          }
        }
      }
    });
  },

  updateBlockSettingsLive(id, settingsPatch) {
    // Live update — does NOT push to undo stack. Used for continuous inputs
    // (color pickers, range sliders) so every intermediate value doesn't create
    // a history entry. The debounced updateBlockSettings call that follows
    // this will commit the final value to the undo stack once dragging stops.
    set((state) => {
      const block = state.blocksById[id];
      if (!block) return {};
      return {
        blocksById: {
          ...state.blocksById,
          [id]: { ...block, settings: { ...block.settings, ...settingsPatch } },
        },
      };
    });
  },

  setDeviceMode(mode) {
    set({ deviceMode: mode });
  },

  setZoomLevel(level) {
    // Clamp between 0.5 and 1.5
    set({ zoomLevel: Math.min(1.5, Math.max(0.5, level)) });
  },

  moveBlock(id, newParentId, newIndex) {
    get()._commit((draft) => {
      const block = draft.blocksById[id];
      if (!block) return;
      
      const oldParentId = block.parentId;
      const sourceArr = oldParentId ? draft.blocksById[oldParentId]?.childrenIds : draft.rootIds;
      
      if (sourceArr) {
        const sourceIdx = sourceArr.indexOf(id);
        if (sourceIdx !== -1) sourceArr.splice(sourceIdx, 1);
      }
      
      block.parentId = newParentId;
      const targetArr = newParentId ? draft.blocksById[newParentId]?.childrenIds : draft.rootIds;
      
      if (targetArr) {
        if (newIndex === null || newIndex === undefined || newIndex >= targetArr.length) {
          targetArr.push(id);
        } else {
          targetArr.splice(newIndex, 0, id);
        }
      }
    });
  },

  moveBlockUp(id) {
    get()._commit((draft) => {
      const block = draft.blocksById[id];
      if (!block) return;
      const parentId = block.parentId;
      const targetArr = parentId ? draft.blocksById[parentId]?.childrenIds : draft.rootIds;
      if (targetArr) {
        const idx = targetArr.indexOf(id);
        if (idx > 0) {
          targetArr.splice(idx, 1);
          targetArr.splice(idx - 1, 0, id);
        }
      }
    });
  },

  moveBlockDown(id) {
    get()._commit((draft) => {
      const block = draft.blocksById[id];
      if (!block) return;
      const parentId = block.parentId;
      const targetArr = parentId ? draft.blocksById[parentId]?.childrenIds : draft.rootIds;
      if (targetArr) {
        const idx = targetArr.indexOf(id);
        if (idx !== -1 && idx < targetArr.length - 1) {
          targetArr.splice(idx, 1);
          targetArr.splice(idx + 1, 0, id);
        }
      }
    });
  },

  selectBlock(id) {
    set({ selectedBlockId: id });
  },

  clearSelection() {
    set({ selectedBlockId: null });
  },

  setHovered(id) {
    set({ hoveredBlockId: id });
  },

  hydrate(blocksAst) {
    const currentSelectedId = get().selectedBlockId;
    const normalizedAst = normalizeBlocksAst(blocksAst ?? []);
    const { blocksById, rootIds } = normalizeAst(normalizedAst);
    const stillExists = currentSelectedId && blocksById[currentSelectedId];
    set({
      blocksById,
      rootIds,
      past: [],
      future: [],
      selectedBlockId: stillExists ? currentSelectedId : null,
    });
  },

  undo() {
    const { past, blocksById, rootIds, future } = get();
    if (!past.length) return;
    const { patches, inversePatches } = past[past.length - 1];
    const prevState = applyPatches({ blocksById, rootIds }, inversePatches);
    set({
      blocksById: prevState.blocksById,
      rootIds: prevState.rootIds,
      past: past.slice(0, -1),
      future: [{ patches, inversePatches }, ...future].slice(0, MAX_HISTORY),
    });
  },

  redo() {
    const { past, blocksById, rootIds, future } = get();
    if (!future.length) return;
    const { patches, inversePatches } = future[0];
    const nextState = applyPatches({ blocksById, rootIds }, patches);
    set({
      blocksById: nextState.blocksById,
      rootIds: nextState.rootIds,
      past: [...past, { patches, inversePatches }].slice(-MAX_HISTORY),
      future: future.slice(1),
    });
  },

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  getBlocksAst: () => denormalizeAst(get().blocksById, get().rootIds),
}));

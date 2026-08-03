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
  _liveSnapshots: {},
  selectedBlockId: null,
  selectedBlockIds: [],
  hoveredBlockId: null,
  past: [],
  future: [],
  deviceMode: "desktop", // 'desktop' | 'tablet' | 'mobile'
  zoomLevel: 1.0,
  activeDragId: null,
  lastDropTarget: null,
  pendingDeleteBlockIds: [],
  isDeleteModalOpen: false,

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
    
    // Override with any explicit settings
    created.settings = { ...created.settings, ...defaultSettings };
    // Ensure the root node gets a fresh ID if createBlock didn't supply one, or override it.
    created.id = nanoid();

    // Use normalizeAst to correctly flatten this block and all its default children
    const { blocksById: newBlocks, rootIds } = normalizeAst([created], parentId);
    const newBlockId = rootIds[0];

    get()._commit((draft) => {
      // Merge all newly created blocks (the parent + its children) into the store
      Object.assign(draft.blocksById, newBlocks);
      
      const targetArr = parentId ? draft.blocksById[parentId].childrenIds : draft.rootIds;
      if (index === null || index === undefined || index >= targetArr.length) {
        targetArr.push(newBlockId);
      } else {
        targetArr.splice(index, 0, newBlockId);
      }
    });
    set({ selectedBlockId: newBlockId, selectedBlockIds: [newBlockId] });
    return newBlockId;
  },

  deleteBlocks(ids) {
    const targetIds = Array.isArray(ids) ? ids.filter(Boolean) : [ids].filter(Boolean);
    if (targetIds.length === 0) return;

    const { selectedBlockIds, selectedBlockId } = get();

    get()._commit((draft) => {
      targetIds.forEach((id) => {
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
    });

    const deletedSet = new Set(targetIds);
    const newSelectedIds = selectedBlockIds.filter((id) => !deletedSet.has(id));
    const newSelectedId = deletedSet.has(selectedBlockId) ? (newSelectedIds[newSelectedIds.length - 1] || null) : selectedBlockId;

    set({
      selectedBlockIds: newSelectedIds,
      selectedBlockId: newSelectedId,
    });
  },

  deleteBlock(id) {
    get().deleteBlocks([id]);
  },

  deleteSelectedBlocks() {
    const { selectedBlockIds, selectedBlockId } = get();
    const idsToDelete = selectedBlockIds.length > 0 ? selectedBlockIds : (selectedBlockId ? [selectedBlockId] : []);
    if (idsToDelete.length > 0) {
      get().deleteBlocks(idsToDelete);
    }
  },

  requestDeleteBlocks(ids) {
    const targetIds = Array.isArray(ids) ? ids.filter(Boolean) : [ids].filter(Boolean);
    if (!targetIds.length) return;
    set({
      pendingDeleteBlockIds: targetIds,
      isDeleteModalOpen: true,
    });
  },

  requestDeleteSelectedBlocks() {
    const { selectedBlockIds, selectedBlockId } = get();
    const ids = selectedBlockIds.length > 0 ? selectedBlockIds : selectedBlockId ? [selectedBlockId] : [];
    if (!ids.length) return;
    set({
      pendingDeleteBlockIds: ids,
      isDeleteModalOpen: true,
    });
  },

  confirmDelete() {
    const { pendingDeleteBlockIds } = get();
    if (pendingDeleteBlockIds && pendingDeleteBlockIds.length > 0) {
      get().deleteBlocks(pendingDeleteBlockIds);
    }
    set({
      pendingDeleteBlockIds: [],
      isDeleteModalOpen: false,
    });
  },

  cancelDelete() {
    set({
      pendingDeleteBlockIds: [],
      isDeleteModalOpen: false,
    });
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
    const liveSnapshot = get()._liveSnapshots?.[id];
    if (liveSnapshot) {
      set((state) => {
        const b = state.blocksById[id];
        if (!b) return {};
        const { [id]: omitted, ...remainingSnapshots } = state._liveSnapshots || {};
        return {
          _liveSnapshots: remainingSnapshots,
          blocksById: {
            ...state.blocksById,
            [id]: { ...b, settings: liveSnapshot },
          },
        };
      });
    }

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
      const currentSnapshots = state._liveSnapshots || {};
      const existingSnapshot = currentSnapshots[id];
      const newSnapshots = existingSnapshot
        ? currentSnapshots
        : { ...currentSnapshots, [id]: { ...block.settings } };

      return {
        _liveSnapshots: newSnapshots,
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

  selectBlock(id, isMulti = false) {
    if (!id) {
      set({ selectedBlockId: null, selectedBlockIds: [] });
      return;
    }
    const { selectedBlockIds } = get();
    if (isMulti) {
      const exists = selectedBlockIds.includes(id);
      const nextIds = exists ? selectedBlockIds.filter((bId) => bId !== id) : [...selectedBlockIds, id];
      set({
        selectedBlockIds: nextIds,
        selectedBlockId: nextIds[nextIds.length - 1] || null,
      });
    } else {
      set({
        selectedBlockId: id,
        selectedBlockIds: [id],
      });
    }
  },

  toggleBlockSelection(id) {
    get().selectBlock(id, true);
  },

  setSelectedBlockIds(ids) {
    const arr = Array.isArray(ids) ? ids : [];
    set({
      selectedBlockIds: arr,
      selectedBlockId: arr[arr.length - 1] || null,
    });
  },

  selectAllBlocks() {
    const { blocksById } = get();
    const allIds = Object.keys(blocksById);
    set({
      selectedBlockIds: allIds,
      selectedBlockId: allIds[allIds.length - 1] || null,
    });
  },

  clearSelection() {
    set({ selectedBlockId: null, selectedBlockIds: [] });
  },

  setHovered(id) {
    set({ hoveredBlockId: id });
  },

  setActiveDragId(id) {
    set({ activeDragId: id });
  },

  setLastDropTarget(target) {
    set({ lastDropTarget: target });
  },

  hydrate(blocksAst) {
    const currentSelectedId = get().selectedBlockId;
    const normalizedAst = normalizeBlocksAst(blocksAst ?? []);
    const { blocksById, rootIds } = normalizeAst(normalizedAst);
    const stillExists = currentSelectedId && blocksById[currentSelectedId];
    set({
      blocksById,
      rootIds,
      _liveSnapshots: {},
      past: [],
      future: [],
      selectedBlockId: stillExists ? currentSelectedId : null,
      selectedBlockIds: stillExists ? [currentSelectedId] : [],
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

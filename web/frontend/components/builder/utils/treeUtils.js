/**
 * treeUtils.js
 *
 * Utilities for working with the normalized builder block tree.
 */

export function getActiveCenterY(active) {
  if (!active || !active.rect?.current) return 0;
  if (active.rect.current.translated) {
    return active.rect.current.translated.top + active.rect.current.translated.height / 2;
  }
  const initial = active.rect.current.initial;
  const transform = active.transform;
  if (initial) {
    const top = initial.top + (transform?.y || 0);
    const height = initial.height || 0;
    return top + height / 2;
  }
  return 0;
}

export function getTreeIds(blocksById, rootIds) {
  const result = [];
  function traverse(id) {
    result.push(id);
    const block = blocksById[id];
    if (block && block.childrenIds) {
      block.childrenIds.forEach(traverse);
    }
  }
  rootIds.forEach(traverse);
  return result;
}

export function resolveDropTarget(blocksById, rootIds, activeId, overId, overIsSection, isBelow = false) {
  if (activeId === overId) return null;

  if (overIsSection) {
    // Drop as first child of the section
    return { newParentId: overId, newIndex: 0 };
  }

  // Drop after the over block, at the same level
  const overBlock = blocksById[overId];
  if (!overBlock) return null;
  
  const parentId = overBlock.parentId;
  const siblings = parentId ? blocksById[parentId].childrenIds : rootIds;
  let overIndex = siblings.indexOf(overId);

  // If dropping below the center of the block, we insert after it
  // This is particularly critical for dropping new blocks at the end of a list.
  if (isBelow) {
    overIndex += 1;
  }

  // When we use overIndex directly:
  // - If dragging down (activeIndex < overIndex), removing activeId shrinks the array before overIndex.
  //   Inserting at overIndex then places it exactly where we want (effectively swapping or shifting).
  // - If dragging up (activeIndex > overIndex), removing activeId doesn't affect indices before it.
  //   Inserting at overIndex places it exactly where overId was, pushing overId down.
  // This perfectly matches dnd-kit's SortableContext swap behavior.
  return { newParentId: parentId, newIndex: overIndex };
}

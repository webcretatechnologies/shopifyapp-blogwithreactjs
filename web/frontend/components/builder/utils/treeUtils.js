/**
 * treeUtils.js
 *
 * Utilities for working with the normalized builder block tree.
 */

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

export function resolveDropTarget(blocksById, rootIds, activeId, overId, overIsSection) {
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
  const overIndex = siblings.indexOf(overId);

  // When we use overIndex directly:
  // - If dragging down (activeIndex < overIndex), removing activeId shrinks the array before overIndex.
  //   Inserting at overIndex then places it exactly where we want (effectively swapping or shifting).
  // - If dragging up (activeIndex > overIndex), removing activeId doesn't affect indices before it.
  //   Inserting at overIndex places it exactly where overId was, pushing overId down.
  // This perfectly matches dnd-kit's SortableContext swap behavior.
  return { newParentId: parentId, newIndex: overIndex };
}

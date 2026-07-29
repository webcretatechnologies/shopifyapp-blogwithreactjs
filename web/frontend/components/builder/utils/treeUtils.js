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

  // If the active block is currently before the over block in the same parent,
  // we actually want to drop it at overIndex (it will shift things).
  // Otherwise, drop at overIndex + 1.
  const activeBlock = blocksById[activeId];
  const activeIndex = siblings.indexOf(activeId);
  const isSameParent = activeBlock.parentId === parentId;
  
  let newIndex = overIndex;
  if (!isSameParent || activeIndex > overIndex) {
    newIndex = overIndex + 1;
  }

  return { newParentId: parentId, newIndex };
}

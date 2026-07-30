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

  const overBlock = blocksById[overId];

  // 1. Check if the over target is a container block (Section, Column, ColumnLayout)
  const isContainer = 
    overIsSection || 
    overBlock?.type === "Section" || 
    overBlock?.type === "Column" || 
    overBlock?.type === "ColumnLayout";

  if (isContainer && overBlock) {
    // If dropping onto a ColumnLayout, automatically delegate to its first column child
    if (overBlock.type === "ColumnLayout") {
      const firstColId = overBlock.childrenIds?.[0];
      if (firstColId) {
        const colBlock = blocksById[firstColId];
        return { 
          newParentId: firstColId, 
          newIndex: isBelow ? (colBlock?.childrenIds?.length || 0) : 0 
        };
      }
    }

    // Direct drop onto a Section or Column container
    const children = overBlock.childrenIds || [];
    return {
      newParentId: overId,
      newIndex: isBelow ? children.length : 0
    };
  }

  // 2. Drop relative to a content block (sibling insertion)
  if (!overBlock) return null;
  
  const parentId = overBlock.parentId;
  const parentBlock = parentId ? blocksById[parentId] : null;

  // Prevent dropping non-Column blocks as direct siblings of a Column inside ColumnLayout
  if (parentBlock?.type === "ColumnLayout" && overBlock.type === "Column") {
    // Drop inside the target column instead
    const colChildren = overBlock.childrenIds || [];
    return {
      newParentId: overId,
      newIndex: isBelow ? colChildren.length : 0
    };
  }

  const siblings = parentId ? blocksById[parentId]?.childrenIds || [] : rootIds;
  let overIndex = siblings.indexOf(overId);
  if (overIndex === -1) overIndex = siblings.length;

  if (isBelow) {
    overIndex += 1;
  }

  return { newParentId: parentId, newIndex: overIndex };
}

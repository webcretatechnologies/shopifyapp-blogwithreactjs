export function normalizeAst(ast, parentId = null) {
  const blocksById = {};
  const rootIds = [];

  function traverse(node, currentParentId) {
    const id = node.id;
    const childrenIds = [];
    if (node.children) {
      for (const child of node.children) {
        childrenIds.push(child.id);
        traverse(child, id);
      }
    }
    blocksById[id] = { ...node, childrenIds, parentId: currentParentId };
    delete blocksById[id].children;
    return id;
  }

  if (Array.isArray(ast)) {
    for (const node of ast) {
      rootIds.push(traverse(node, parentId));
    }
  }

  return { blocksById, rootIds };
}

export function denormalizeAst(blocksById, rootIds) {
  function traverse(id) {
    const node = blocksById[id];
    if (!node) return null;
    const clone = { ...node };
    if (clone.childrenIds) {
      clone.children = clone.childrenIds.map(traverse).filter(Boolean);
      delete clone.childrenIds;
    }
    delete clone.parentId;
    return clone;
  }

  return (rootIds || []).map(traverse).filter(Boolean);
}

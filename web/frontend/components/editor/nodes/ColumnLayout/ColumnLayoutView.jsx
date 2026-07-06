import React, { useCallback } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';

export default function ColumnLayoutView({ node, editor, getPos, deleteNode }) {
  const colCount = node.childCount;

  /**
   * Sets the column count in a single transaction (one undo step):
   * - increasing appends empty columns
   * - decreasing merges the content of removed columns into the last kept one
   * - all widths are rebalanced to equal shares
   */
  const setColumns = useCallback((count) => {
    if (count === colCount || count < 1 || count > 4) return;
    const pos = getPos();
    if (pos === undefined) return;

    const { schema, tr } = editor.state;
    const columnType = schema.nodes.column;
    const width = Math.round((100 / count) * 100) / 100;

    const newColumns = [];
    for (let i = 0; i < count; i++) {
      if (i < colCount) {
        let content = node.child(i).content;
        if (i === count - 1 && count < colCount) {
          // last kept column absorbs the content of all removed columns
          for (let j = count; j < colCount; j++) {
            content = content.append(node.child(j).content);
          }
        }
        newColumns.push(columnType.create({ width }, content));
      } else {
        newColumns.push(columnType.createAndFill({ width }));
      }
    }

    const newLayout = node.type.create({ ...node.attrs, columns: count }, newColumns);
    editor.view.dispatch(tr.replaceWith(pos, pos + node.nodeSize, newLayout));
  }, [colCount, editor, getPos, node]);

  return (
    <NodeViewWrapper className="column-layout-wrapper tiptap-block" style={{ position: 'relative', margin: '1.5rem 0' }}>
      <div
        className="column-layout-toolbar tiptap-block-toolbar"
        contentEditable={false}
        style={{
          display: 'flex',
          gap: '8px',
          padding: '4px',
          background: '#f4f6f8',
          border: '1px solid #dfe3e8',
          borderRadius: '4px',
          position: 'absolute',
          top: '-36px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
        }}
      >
        {[2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setColumns(n)}
            className={`tiptap-btn ${colCount === n ? 'tiptap-btn--active' : ''}`}
            title={n < colCount ? `${n} columns (content of removed columns is kept)` : `${n} columns`}
          >
            {n} cols
          </button>
        ))}
        <button type="button" onClick={() => deleteNode()} className="tiptap-btn" style={{ color: '#d82c0d' }}>🗑</button>
      </div>

      <NodeViewContent
        className="column-layout-content"
        style={{
          display: 'flex',
          gap: '16px',
          flexWrap: 'nowrap',
          width: '100%'
        }}
      />
    </NodeViewWrapper>
  );
}

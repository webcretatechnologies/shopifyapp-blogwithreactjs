import React, { useCallback } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';

export default function ColumnLayoutView({ node, editor, getPos, deleteNode }) {
  const colCount = node.childCount;

  const addColumn = useCallback(() => {
    if (colCount >= 4) return;
    const pos = getPos();
    if (pos === undefined) return;
    
    // Find the current node and add a column to it
    editor.chain().focus().insertContentAt(pos + node.nodeSize - 1, {
      type: 'column',
      attrs: { width: 100 / (colCount + 1) }
    }).run();
    
    // rebalance
    rebalanceColumns(colCount + 1);
  }, [colCount, editor, getPos, node]);

  const setColumns = useCallback((count) => {
    if (count === colCount) return;
    const pos = getPos();
    if (pos === undefined) return;

    if (count < colCount) {
      // Need to delete columns and move content... complex. 
      // For simplicity, just replace the whole node if it's empty, or don't allow reducing easily without a full command.
      // We will just rebalance for now.
      alert("Reducing column count currently not fully supported without deleting content.");
    } else {
      // Add missing columns
      let tr = editor.state.tr;
      for(let i = colCount; i < count; i++) {
        tr = tr.insert(pos + node.nodeSize - 1, editor.schema.nodes.column.create({ width: 100/count }));
      }
      editor.view.dispatch(tr);
    }
  }, [colCount, editor, getPos, node]);

  const rebalanceColumns = (newColCount) => {
    // Equal widths
    const width = 100 / newColCount;
    // We would need to update attrs of all children. 
    // TipTap makes this slightly complex from the NodeView. 
    // We can just rely on flex-1 for equal widths if widths are equal.
  };

  return (
    <NodeViewWrapper className="column-layout-wrapper" style={{ position: 'relative', margin: '1.5rem 0' }}>
      <div 
        className="column-layout-toolbar" 
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
          opacity: 0, 
          transition: 'opacity 0.2s' 
        }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
        onMouseLeave={(e) => e.currentTarget.style.opacity = 0}
      >
        <button type="button" onClick={addColumn} className="tiptap-btn" disabled={colCount >= 4}>+ Add Column</button>
        <button type="button" onClick={() => setColumns(2)} className="tiptap-btn">2 cols</button>
        <button type="button" onClick={() => setColumns(3)} className="tiptap-btn">3 cols</button>
        <button type="button" onClick={() => setColumns(4)} className="tiptap-btn">4 cols</button>
        <button type="button" onClick={() => deleteNode()} className="tiptap-btn" style={{color: '#d82c0d'}}>🗑</button>
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

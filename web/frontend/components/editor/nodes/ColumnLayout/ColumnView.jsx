import React from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';

export default function ColumnView({ node, updateAttributes }) {
  const width = node.attrs.width || 50;

  return (
    <NodeViewWrapper 
      className="tiptap-column" 
      style={{ 
        flex: `0 0 ${width}%`,
        minWidth: '20%',
        position: 'relative',
        border: '1px dashed transparent',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={(e) => {
        if (e.currentTarget === e.target) {
          e.currentTarget.style.borderColor = 'rgba(0,0,0,0.15)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'transparent';
      }}
    >
      <NodeViewContent className="tiptap-column-content" style={{ minHeight: '40px' }} />
      {/* 
        A drag handle for width adjustment could be placed here.
        Updating node.attrs.width on drag will rerender this component.
      */}
      <div 
        className="tiptap-column-resize-handle"
        contentEditable={false}
        style={{
          position: 'absolute',
          right: '-8px',
          top: 0,
          bottom: 0,
          width: '6px',
          cursor: 'col-resize',
          zIndex: 5,
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          const startX = e.pageX;
          const startWidth = width;
          const parentWidth = e.currentTarget.parentElement.parentElement.getBoundingClientRect().width;
          
          const onMouseMove = (moveEvent) => {
            const diffX = moveEvent.pageX - startX;
            const diffPercent = (diffX / parentWidth) * 100;
            let newWidth = startWidth + diffPercent;
            newWidth = Math.max(20, Math.min(newWidth, 80)); // Limit between 20% and 80%
            updateAttributes({ width: newWidth });
          };
          
          const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
          };
          
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        }}
      />
    </NodeViewWrapper>
  );
}

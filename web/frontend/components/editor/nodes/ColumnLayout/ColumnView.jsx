import React, { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';

const MIN_WIDTH = 15;

export default function ColumnView({ node, editor, getPos }) {
  const width = node.attrs.width || 50;
  // Transient widths during drag: [ownWidth, neighborWidth]. The document is
  // only updated once, on mouseup, so a resize is a single undo step.
  const [dragWidths, setDragWidths] = useState(null);
  const cleanupRef = useRef(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const getSiblingInfo = () => {
    const pos = getPos();
    if (pos === undefined) return null;
    const $pos = editor.state.doc.resolve(pos);
    const parent = $pos.parent;
    if (parent.type.name !== 'columnLayout') return null;
    const index = $pos.index();
    if (index + 1 >= parent.childCount) return null; // last column has no right handle
    const next = parent.child(index + 1);
    return { pos, nextPos: pos + node.nodeSize, next };
  };

  const startResize = (e) => {
    e.preventDefault();
    const info = getSiblingInfo();
    if (!info) return;

    const startX = e.pageX;
    const startWidth = node.attrs.width || 50;
    const startNextWidth = info.next.attrs.width || 50;
    const pair = startWidth + startNextWidth;
    const parentEl = e.currentTarget.parentElement?.parentElement;
    if (!parentEl) return;
    const parentWidth = parentEl.getBoundingClientRect().width;
    let latest = [startWidth, startNextWidth];

    const onMouseMove = (moveEvent) => {
      const diffPercent = ((moveEvent.pageX - startX) / parentWidth) * 100;
      let newWidth = startWidth + diffPercent;
      newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, pair - MIN_WIDTH));
      latest = [
        Math.round(newWidth * 100) / 100,
        Math.round((pair - newWidth) * 100) / 100,
      ];
      setDragWidths(latest);
    };

    const onMouseUp = () => {
      cleanupRef.current?.();
      // Commit both widths in one transaction; positions are stable because
      // setNodeMarkup doesn't change node sizes
      const current = getSiblingInfo();
      if (current) {
        const tr = editor.state.tr
          .setNodeMarkup(current.pos, null, { ...node.attrs, width: latest[0] })
          .setNodeMarkup(current.nextPos, null, { ...current.next.attrs, width: latest[1] });
        editor.view.dispatch(tr);
      }
      setDragWidths(null);
    };

    cleanupRef.current = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      cleanupRef.current = null;
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const displayWidth = dragWidths ? dragWidths[0] : width;
  const hasRightNeighbor = !!getSiblingInfo();

  return (
    <NodeViewWrapper
      className="tiptap-column"
      style={{
        flex: `${displayWidth} ${displayWidth} 0%`,
        minWidth: 0,
        position: 'relative',
        border: '1px dashed transparent',
        transition: dragWidths ? 'none' : 'border-color 0.2s',
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
      {hasRightNeighbor && (
        <div
          className="tiptap-column-resize-handle"
          contentEditable={false}
          title="Drag to resize columns"
          style={{
            position: 'absolute',
            right: '-11px',
            top: 0,
            bottom: 0,
            width: '6px',
            cursor: 'col-resize',
            zIndex: 5,
            background: dragWidths ? 'rgba(44,110,203,0.4)' : 'transparent',
            borderRadius: '3px',
          }}
          onMouseDown={startResize}
        />
      )}
    </NodeViewWrapper>
  );
}

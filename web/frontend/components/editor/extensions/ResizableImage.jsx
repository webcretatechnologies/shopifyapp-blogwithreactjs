import { mergeAttributes } from '@tiptap/core';
import { Image as BaseImage } from '@tiptap/extension-image';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useState, useRef, useEffect } from 'react';

const Handle = ({ dir, onMouseDown }) => {
  const isTop = dir.includes('n');
  const isBottom = dir.includes('s');
  const isLeft = dir.includes('w');
  const isRight = dir.includes('e');
  
  let top = 'auto';
  let bottom = 'auto';
  let left = 'auto';
  let right = 'auto';

  if (isTop) top = '-5px';
  if (isBottom) bottom = '-5px';
  if (isLeft) left = '-5px';
  if (isRight) right = '-5px';

  if (!isLeft && !isRight) left = '50%';
  if (!isTop && !isBottom) top = '50%';

  const transform = (!isLeft && !isRight) ? 'translateX(-50%)' : (!isTop && !isBottom) ? 'translateY(-50%)' : 'none';
  
  return (
    <div
      className="resize-handle"
      onMouseDown={(e) => onMouseDown(e, dir)}
      style={{
        position: 'absolute',
        top,
        bottom,
        left,
        right,
        transform,
        width: '10px',
        height: '10px',
        backgroundColor: '#008060',
        border: '2px solid white',
        borderRadius: '50%',
        cursor: `${dir}-resize`,
        zIndex: 10,
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
      }}
    />
  );
};

const ResizableImageComponent = (props) => {
  const { node, updateAttributes, selected } = props;
  const { src, alt, title, width, height } = node.attrs;
  const imageRef = useRef(null);

  const [isResizing, setIsResizing] = useState(false);
  const [resizeDir, setResizeDir] = useState(null);
  const [initialWidth, setInitialWidth] = useState(0);
  const [initialHeight, setInitialHeight] = useState(0);
  const [initialMouseX, setInitialMouseX] = useState(0);
  const [initialMouseY, setInitialMouseY] = useState(0);

  const handleMouseDown = (e, dir) => {
    e.preventDefault();
    setIsResizing(true);
    setResizeDir(dir);
    setInitialMouseX(e.clientX);
    setInitialMouseY(e.clientY);
    
    if (imageRef.current) {
      setInitialWidth(imageRef.current.clientWidth);
      setInitialHeight(imageRef.current.clientHeight);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing || !resizeDir) return;
      
      const dx = e.clientX - initialMouseX;
      const dy = e.clientY - initialMouseY;
      
      let newWidth = initialWidth;
      const ratio = initialHeight / initialWidth;
      
      if (resizeDir === 'e') newWidth = initialWidth + dx;
      else if (resizeDir === 'w') newWidth = initialWidth - dx;
      else if (resizeDir === 's') newWidth = (initialHeight + dy) / ratio;
      else if (resizeDir === 'n') newWidth = (initialHeight - dy) / ratio;
      else if (resizeDir === 'ne' || resizeDir === 'se') newWidth = initialWidth + dx;
      else if (resizeDir === 'nw' || resizeDir === 'sw') newWidth = initialWidth - dx;
      
      newWidth = Math.max(50, newWidth);
      
      updateAttributes({ width: Math.round(newWidth) });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeDir(null);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeDir, initialMouseX, initialMouseY, initialWidth, initialHeight, updateAttributes]);

  return (
    <NodeViewWrapper
      className={`resizable-image-wrapper ${selected ? 'ProseMirror-selectednode' : ''}`}
      style={{ 
        display: 'inline-block', 
        position: 'relative', 
        width: width ? `${width}px` : 'auto',
        maxWidth: '100%',
        lineHeight: 0
      }}
    >
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        title={title}
        style={{ 
          width: '100%', 
          height: 'auto', 
          display: 'block',
          outline: selected ? '2px solid #008060' : 'none',
          borderRadius: '4px'
        }}
      />
      
      {/* Resize Handles */}
      {selected && (
        <>
          <Handle dir="nw" onMouseDown={handleMouseDown} />
          <Handle dir="n" onMouseDown={handleMouseDown} />
          <Handle dir="ne" onMouseDown={handleMouseDown} />
          <Handle dir="e" onMouseDown={handleMouseDown} />
          <Handle dir="se" onMouseDown={handleMouseDown} />
          <Handle dir="s" onMouseDown={handleMouseDown} />
          <Handle dir="sw" onMouseDown={handleMouseDown} />
          <Handle dir="w" onMouseDown={handleMouseDown} />
        </>
      )}
      
      {isResizing && (
        <div style={{
          position: 'absolute',
          bottom: '10px',
          right: '10px',
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '12px',
          pointerEvents: 'none',
          zIndex: 11
        }}>
          {Math.round(width || initialWidth)}px
        </div>
      )}
    </NodeViewWrapper>
  );
};

export const ResizableImage = BaseImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: element => element.getAttribute('width'),
        renderHTML: attributes => {
          if (!attributes.width) return {};
          return {
            width: attributes.width,
            style: `width: ${attributes.width}px; height: auto; max-width: 100%;`
          };
        },
      },
      height: {
        default: null,
        parseHTML: element => element.getAttribute('height'),
        renderHTML: attributes => {
          if (!attributes.height) return {};
          return { height: attributes.height };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});

import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import { useState } from 'react';
import { Modal } from '@shopify/polaris';

export function createBlockExtension({
  name,
  PreviewComponent,
  SettingsComponent,
  defaultAttributes = {},
  title = 'Edit Block'
}) {
  const NodeView = (props) => {
    const { node, updateAttributes, selected } = props;
    // Flatten attributes for the block props so it matches the expected structure
    const attrs = node.attrs;
    
    const [isEditing, setIsEditing] = useState(false);

    return (
      <NodeViewWrapper 
        className={`custom-block-node ${selected ? 'ProseMirror-selectednode' : ''}`} 
        style={{ 
          position: 'relative', 
          margin: '1.5rem 0', 
          outline: selected ? '2px solid #008060' : 'none',
          borderRadius: '4px'
        }}
      >
        {selected && (
          <div style={{ position: 'absolute', top: '-14px', right: '10px', zIndex: 10 }}>
            <button 
              type="button" 
              onClick={() => setIsEditing(true)}
              style={{ background: '#008060', color: 'white', border: 'none', padding: '4px 12px', borderRadius: '12px', cursor: 'pointer', fontSize: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
            >
              {title}
            </button>
          </div>
        )}

        {/* pointerEvents: 'none' ensures that dragging inside the preview doesn't cause issues, 
            and links inside the preview aren't clickable in the editor canvas. */}
        <div style={{ pointerEvents: 'none' }}>
          <PreviewComponent block={attrs} isSelected={selected} onUpdate={updateAttributes} />
        </div>

        {isEditing && (
          <Modal
            open={isEditing}
            onClose={() => setIsEditing(false)}
            title={title}
            large
          >
            <Modal.Section>
              <div style={{ display: "grid", gap: "16px" }}>
                <div
                  style={{
                    border: "1px solid #e1e3e5",
                    borderRadius: "10px",
                    padding: "12px",
                    background: "#f6f6f7",
                  }}
                >
                  <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px", color: "#616161" }}>
                    Live preview
                  </div>
                  <PreviewComponent block={attrs} isSelected={true} onUpdate={updateAttributes} />
                </div>

                <SettingsComponent
                  block={attrs}
                  onUpdate={(updates) => {
                    updateAttributes(updates);
                  }}
                />
              </div>
            </Modal.Section>
          </Modal>
        )}
      </NodeViewWrapper>
    );
  };

  const attributesConfig = {};
  for (const [key, value] of Object.entries(defaultAttributes)) {
    attributesConfig[key] = {
      default: value,
      parseHTML: element => {
        try {
          const val = element.getAttribute(`data-${key.toLowerCase()}`);
          if (val === 'true') return true;
          if (val === 'false') return false;
          if (val && (val.startsWith('{') || val.startsWith('['))) return JSON.parse(val);
          return val || value;
        } catch {
          return value;
        }
      },
      renderHTML: attributes => {
        const val = attributes[key];
        if (val === undefined || val === null) return {};
        return {
          [`data-${key.toLowerCase()}`]: typeof val === 'object' ? JSON.stringify(val) : String(val)
        };
      }
    };
  }

  return Node.create({
    name,
    group: 'block',
    atom: true,

    addAttributes() {
      return attributesConfig;
    },

    parseHTML() {
      return [
        {
          tag: `div[data-type="${name}"]`,
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      return ['div', mergeAttributes(HTMLAttributes, { 'data-type': name })];
    },

    addNodeView() {
      return ReactNodeViewRenderer(NodeView);
    },
  });
}

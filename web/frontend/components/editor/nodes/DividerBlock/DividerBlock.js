import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import DividerBlockView from "./DividerBlockView";

export const DividerBlock = Node.create({
  name: "dividerBlock",
  group: "block",
  atom: true,
  
  addAttributes() {
    return {
      style: { default: "solid" },
      color: { default: "#e0e0e0" },
      thickness: { default: 1 },
      spacing: { default: 24 }
    };
  },

  parseHTML() {
    return [{ tag: 'hr[data-type="dividerBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["hr", mergeAttributes(HTMLAttributes, { "data-type": "dividerBlock", style: `border-top: ${HTMLAttributes.thickness}px ${HTMLAttributes.style} ${HTMLAttributes.color}; margin: ${HTMLAttributes.spacing}px 0; border-left: 0; border-right: 0; border-bottom: 0;` })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DividerBlockView);
  },
});

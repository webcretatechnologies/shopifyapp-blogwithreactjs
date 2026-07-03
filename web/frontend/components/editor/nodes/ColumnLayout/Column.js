import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import ColumnView from "./ColumnView";

export const Column = Node.create({
  name: "column",
  content: "block+",
  
  addAttributes() {
    return {
      width: {
        default: 50,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="column"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "column", class: "tiptap-column", style: `width: ${HTMLAttributes.width}%` }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnView);
  },
});

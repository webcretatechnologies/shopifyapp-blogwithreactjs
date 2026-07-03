import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import ColumnLayoutView from "./ColumnLayoutView";

export const ColumnLayout = Node.create({
  name: "columnLayout",
  group: "block",
  content: "column+",
  
  addAttributes() {
    return {
      columns: {
        default: 2,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="columnLayout"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "columnLayout", class: "tiptap-column-layout" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnLayoutView);
  },
});

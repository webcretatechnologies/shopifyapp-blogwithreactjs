import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import ColumnLayoutView from "./ColumnLayoutView";
import { numAttr } from "../attrHelpers";

export const ColumnLayout = Node.create({
  name: "columnLayout",
  group: "block",
  content: "column+",

  addAttributes() {
    return {
      columns: numAttr("columns", 2),
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
    // Inline flex styles so published articles don't depend on editor CSS;
    // mobile stacking comes from EditorContentCompiler.generateStyles()
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "columnLayout", class: "tiptap-column-layout", style: "display: flex; gap: 16px; margin: 1rem 0; flex-wrap: wrap;" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnLayoutView);
  },
});

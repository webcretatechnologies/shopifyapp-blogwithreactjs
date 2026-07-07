import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import ColumnView from "./ColumnView";
import { numAttr } from "../attrHelpers";

export const Column = Node.create({
  name: "column",
  content: "block+",

  addAttributes() {
    return {
      width: numAttr("width", 50),
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="column"]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    // flex-grow proportional to width keeps totals valid regardless of gap
    const width = node.attrs.width || 50;
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "column", class: "tiptap-column", style: `flex: ${width} ${width} 0%; min-width: 240px;` }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnView);
  },
});

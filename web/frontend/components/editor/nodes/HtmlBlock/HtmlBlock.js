import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import HtmlBlockView from "./HtmlBlockView";

export const HtmlBlock = Node.create({
  name: "htmlBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      html: { default: "" }
    };
  },

  parseHTML() {
    return [
      { 
        tag: 'div[data-type="htmlBlock"]',
        getAttrs: (node) => ({
          html: node.getAttribute('data-html') ? decodeURIComponent(node.getAttribute('data-html')) : ''
        })
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "htmlBlock", "data-html": encodeURIComponent(HTMLAttributes.html) })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(HtmlBlockView);
  },
});

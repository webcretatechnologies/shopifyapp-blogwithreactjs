import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import HtmlBlockView from "./HtmlBlockView";

export const HtmlBlock = Node.create({
  name: "htmlBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      // rendered: false — serialized only via the encoded data-html attribute
      html: { default: "", rendered: false }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="htmlBlock"]',
        getAttrs: (node) => {
          const raw = node.getAttribute('data-html') || '';
          let html = '';
          try {
            html = decodeURIComponent(raw);
          } catch (e) {
            // malformed escape sequence (hand-edited HTML) — keep raw value
            html = raw;
          }
          return { html };
        }
      }
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "htmlBlock", "data-html": encodeURIComponent(node.attrs.html || "") })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(HtmlBlockView);
  },
});

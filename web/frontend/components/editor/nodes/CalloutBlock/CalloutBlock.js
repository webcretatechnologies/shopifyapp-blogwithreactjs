import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import CalloutBlockView from "./CalloutBlockView";
import { strAttr } from "../attrHelpers";

export const CalloutBlock = Node.create({
  name: "calloutBlock",
  group: "block",
  content: "inline*",

  addAttributes() {
    return {
      // "data-type" marks the node itself, so the callout type gets its own name
      type: strAttr("type", "info", "data-callout-type"),
      emoji: strAttr("emoji", "💡"),
      backgroundColor: strAttr("backgroundColor", "#f0f9ff"),
      borderColor: strAttr("borderColor", "#0ea5e9"),
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="calloutBlock"]',
        // Only the content div holds editable text; without this the rendered
        // emoji span would be re-parsed into content on every reload
        contentElement: ".callout-content",
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs;
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "calloutBlock", style: `background-color: ${attrs.backgroundColor}; border-left: 4px solid ${attrs.borderColor}; padding: 12px; display: flex; align-items: center; gap: 12px; border-radius: 4px; margin: 1rem 0;` }), ["span", { class: "callout-emoji", contenteditable: "false", style: "font-size: 1.5em;" }, attrs.emoji], ["div", { class: "callout-content", style: "flex: 1" }, 0]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutBlockView);
  },
});

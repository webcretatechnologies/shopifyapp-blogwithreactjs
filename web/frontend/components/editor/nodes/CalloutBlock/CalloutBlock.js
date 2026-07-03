import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import CalloutBlockView from "./CalloutBlockView";

export const CalloutBlock = Node.create({
  name: "calloutBlock",
  group: "block",
  content: "inline*",
  
  addAttributes() {
    return {
      type: { default: "info" },
      emoji: { default: "💡" },
      backgroundColor: { default: "#f0f9ff" },
      borderColor: { default: "#0ea5e9" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="calloutBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "calloutBlock", style: `background-color: ${HTMLAttributes.backgroundColor}; border-left: 4px solid ${HTMLAttributes.borderColor}; padding: 12px; display: flex; align-items: center; gap: 12px; border-radius: 4px; margin: 1rem 0;` }), ["span", { class: "callout-emoji", contenteditable: "false", style: "font-size: 1.5em;" }, HTMLAttributes.emoji], ["div", { class: "callout-content", style: "flex: 1" }, 0]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutBlockView);
  },
});

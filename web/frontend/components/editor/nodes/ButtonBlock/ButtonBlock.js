import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import ButtonBlockView from "./ButtonBlockView";

export const ButtonBlock = Node.create({
  name: "buttonBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      text: { default: "Click here" },
      url: { default: "" },
      target: { default: "_self" },
      style: { default: "filled" },
      color: { default: "#2d6a4f" },
      textColor: { default: "#ffffff" },
      size: { default: "medium" },
      alignment: { default: "left" },
      borderRadius: { default: 6 },
      fullWidth: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="buttonBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    let padding = "8px 16px";
    let fontSize = "14px";
    if (HTMLAttributes.size === "small") { padding = "4px 8px"; fontSize = "12px"; }
    else if (HTMLAttributes.size === "large") { padding = "12px 24px"; fontSize = "16px"; }

    let bg = HTMLAttributes.style === "filled" ? HTMLAttributes.color : "transparent";
    let border = HTMLAttributes.style === "ghost" ? "none" : `1px solid ${HTMLAttributes.color}`;
    let color = HTMLAttributes.style === "filled" ? HTMLAttributes.textColor : HTMLAttributes.color;

    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "buttonBlock", style: `text-align: ${HTMLAttributes.alignment}; margin: 1rem 0;` }), 
      ["a", { 
        href: HTMLAttributes.url || "#", 
        target: HTMLAttributes.target, 
        style: `display: ${HTMLAttributes.fullWidth ? 'block' : 'inline-block'}; padding: ${padding}; font-size: ${fontSize}; background-color: ${bg}; border: ${border}; color: ${color}; border-radius: ${HTMLAttributes.borderRadius}px; text-decoration: none; text-align: center;` 
      }, HTMLAttributes.text]
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ButtonBlockView);
  },
});

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import ButtonBlockView from "./ButtonBlockView";
import { strAttr, numAttr, boolAttr } from "../attrHelpers";

export function getButtonStyles(attrs) {
  let padding = "8px 16px";
  let fontSize = "14px";
  if (attrs.size === "small") { padding = "4px 8px"; fontSize = "12px"; }
  else if (attrs.size === "large") { padding = "12px 24px"; fontSize = "16px"; }

  const bg = attrs.variant === "filled" ? attrs.color : "transparent";
  const border = attrs.variant === "ghost" ? "none" : `1px solid ${attrs.color}`;
  const color = attrs.variant === "filled" ? attrs.textColor : attrs.color;

  return { padding, fontSize, bg, border, color };
}

export const ButtonBlock = Node.create({
  name: "buttonBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      text: strAttr("text", "Click here"),
      url: strAttr("url", ""),
      target: strAttr("target", "_self"),
      variant: strAttr("variant", "filled"),
      color: strAttr("color", "#2d6a4f"),
      textColor: strAttr("textColor", "#ffffff"),
      size: strAttr("size", "medium"),
      alignment: strAttr("alignment", "left"),
      borderRadius: numAttr("borderRadius", 6),
      fullWidth: boolAttr("fullWidth", false),
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="buttonBlock"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs;
    const { padding, fontSize, bg, border, color } = getButtonStyles(attrs);

    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "buttonBlock", style: `text-align: ${attrs.alignment}; margin: 1rem 0;` }),
      ["a", {
        href: attrs.url || "#",
        target: attrs.target,
        rel: attrs.target === "_blank" ? "noopener noreferrer" : null,
        style: `display: ${attrs.fullWidth ? "block" : "inline-block"}; padding: ${padding}; font-size: ${fontSize}; background-color: ${bg}; border: ${border}; color: ${color}; border-radius: ${attrs.borderRadius}px; text-decoration: none; text-align: center;`,
      }, attrs.text],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ButtonBlockView);
  },
});

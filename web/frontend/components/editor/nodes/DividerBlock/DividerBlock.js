import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import DividerBlockView from "./DividerBlockView";
import { strAttr, numAttr } from "../attrHelpers";

export const DividerBlock = Node.create({
  name: "dividerBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      lineStyle: strAttr("lineStyle", "solid"),
      color: strAttr("color", "#e0e0e0"),
      thickness: numAttr("thickness", 1),
      spacing: numAttr("spacing", 24),
    };
  },

  parseHTML() {
    return [
      // Outranks StarterKit's HorizontalRule generic `hr` rule, which would
      // otherwise swallow dividers on reload
      { tag: 'hr[data-type="dividerBlock"]', priority: 100 },
      // Legacy div-based dividerBlock (createBlockExtension format)
      {
        tag: 'div[data-type="dividerBlock"]',
        getAttrs: (el) => ({
          lineStyle: el.getAttribute("data-style") || "solid",
          color: el.getAttribute("data-color") || "#e0e0e0",
          thickness: parseInt(el.getAttribute("data-thickness")) || 1,
          spacing: parseInt(el.getAttribute("data-margin")) || 24,
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs;
    return ["hr", mergeAttributes(HTMLAttributes, { "data-type": "dividerBlock", style: `border-top: ${attrs.thickness}px ${attrs.lineStyle} ${attrs.color}; margin: ${attrs.spacing}px 0; border-left: 0; border-right: 0; border-bottom: 0;` })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DividerBlockView);
  },
});

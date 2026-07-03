import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import ImageBlockView from "./ImageBlockView";

export const ImageBlock = Node.create({
  name: "imageBlock",
  group: "block",
  content: "inline*",
  
  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      width: { default: "100%" },
      alignment: { default: "center" },
      borderRadius: { default: 0 },
      linkUrl: { default: "" },
      linkTarget: { default: "_self" },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-type="imageBlock"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes, { "data-type": "imageBlock", style: `text-align: ${HTMLAttributes.alignment}` }), ["img", { src: HTMLAttributes.src, alt: HTMLAttributes.alt, style: `width: ${HTMLAttributes.width}; border-radius: ${HTMLAttributes.borderRadius}px` }], ["figcaption", 0]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView);
  },
});

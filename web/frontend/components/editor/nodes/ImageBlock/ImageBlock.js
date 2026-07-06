import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import ImageBlockView from "./ImageBlockView";
import { strAttr, numAttr } from "../attrHelpers";

export const ImageBlock = Node.create({
  name: "imageBlock",
  group: "block",
  content: "inline*",

  addAttributes() {
    return {
      src: strAttr("src", ""),
      alt: strAttr("alt", ""),
      width: strAttr("width", "100%"),
      alignment: strAttr("alignment", "center"),
      borderRadius: numAttr("borderRadius", 0),
      linkUrl: strAttr("linkUrl", ""),
      linkTarget: strAttr("linkTarget", "_self"),
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-type="imageBlock"]',
        contentElement: "figcaption",
      },
      // Legacy div-based imageBlock (createBlockExtension format); caption
      // lived in data-caption and is not migrated into content
      {
        tag: 'div[data-type="imageBlock"]',
        getAttrs: (el) => ({
          src: el.getAttribute("data-src") || "",
          alt: el.getAttribute("data-alt") || "",
          width: el.getAttribute("data-width") || "100%",
          alignment: el.getAttribute("data-align") || "center",
          borderRadius: parseInt(el.getAttribute("data-borderradius")) || 0,
          linkUrl: el.getAttribute("data-linkurl") || "",
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs;
    const img = ["img", { src: attrs.src, alt: attrs.alt, style: `width: ${attrs.width}; max-width: 100%; border-radius: ${attrs.borderRadius}px` }];
    const media = attrs.linkUrl
      ? ["a", { href: attrs.linkUrl, target: attrs.linkTarget, rel: attrs.linkTarget === "_blank" ? "noopener noreferrer" : null }, img]
      : img;
    return ["figure", mergeAttributes(HTMLAttributes, { "data-type": "imageBlock", style: `text-align: ${attrs.alignment}; margin: 1.5rem 0;` }), media, ["figcaption", { style: "margin-top: 8px; font-size: 14px; color: #6d7175; text-align: center;" }, 0]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView);
  },
});

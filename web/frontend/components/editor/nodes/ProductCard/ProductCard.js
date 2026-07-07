import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import ProductCardView from "./ProductCardView";
import { strAttr, numAttr, boolAttr } from "../attrHelpers";

export const ProductCard = Node.create({
  name: "productCard",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      productId: strAttr("productId", ""),
      title: strAttr("title", ""),
      price: strAttr("price", ""),
      currency: strAttr("currency", ""),
      imageUrl: strAttr("imageUrl", ""),
      compareAtPrice: strAttr("compareAtPrice", ""),
      handle: strAttr("handle", ""),
      buttonText: strAttr("buttonText", "Add to Cart"),
      buttonColor: strAttr("buttonColor", "#2d6a4f"),
      showImage: boolAttr("showImage", true),
      showPrice: boolAttr("showPrice", true),
      showButton: boolAttr("showButton", true),
      layout: strAttr("layout", "vertical"),
      borderRadius: numAttr("borderRadius", 8),
      borderColor: strAttr("borderColor", "#e0e0e0"),
      backgroundColor: strAttr("backgroundColor", "#ffffff"),
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="productCard"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    // Storefront markup is generated server-side by EditorContentCompiler
    // from the data-* attributes; this wrapper only carries the config.
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "productCard" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ProductCardView);
  },
});

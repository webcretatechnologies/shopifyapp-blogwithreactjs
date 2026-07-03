import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import ProductCardView from "./ProductCardView";

export const ProductCard = Node.create({
  name: "productCard",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      productId: { default: "" },
      title: { default: "" },
      price: { default: "" },
      imageUrl: { default: "" },
      compareAtPrice: { default: "" },
      handle: { default: "" },
      buttonText: { default: "Add to Cart" },
      buttonColor: { default: "#2d6a4f" },
      showImage: { default: true },
      showPrice: { default: true },
      showButton: { default: true },
      layout: { default: "vertical" },
      borderRadius: { default: 8 },
      borderColor: { default: "#e0e0e0" },
      backgroundColor: { default: "#ffffff" },
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
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "productCard" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ProductCardView);
  },
});

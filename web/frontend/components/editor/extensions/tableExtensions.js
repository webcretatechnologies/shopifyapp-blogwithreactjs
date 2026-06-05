import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";

export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-background-color") ||
          element.style.backgroundColor ||
          null,
        renderHTML: (attributes) => {
          if (!attributes.backgroundColor) return {};
          return {
            "data-background-color": attributes.backgroundColor,
            style: `background-color: ${attributes.backgroundColor};`,
          };
        },
      },
    };
  },
});

export const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-background-color") ||
          element.style.backgroundColor ||
          null,
        renderHTML: (attributes) => {
          if (!attributes.backgroundColor) return {};
          return {
            "data-background-color": attributes.backgroundColor,
            style: `background-color: ${attributes.backgroundColor};`,
          };
        },
      },
    };
  },
});

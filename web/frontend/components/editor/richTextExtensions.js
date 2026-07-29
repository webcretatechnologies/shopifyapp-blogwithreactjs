/**
 * richTextExtensions.js
 *
 * Single source of truth for the Tiptap extension list used by the
 * Builder's RichText block (RichTextBlock.jsx / RichTextEditor.jsx).
 *
 * Includes Table, TableRow, TableHeader, TableCell, Image, Highlight, Color, and TextStyle
 * so that copy-pasted content containing tables, images, or custom colors is preserved
 * with full structural fidelity.
 */

import StarterKit from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";

export const builderRichTextExtensions = (placeholder = "") => [
  StarterKit.configure({
    link: false,
    underline: false,
    history: false, // Builder's Immer store handles undo/redo
  }),
  Placeholder.configure({ placeholder }),
  Underline,
  Link.configure({ openOnClick: false }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  Image.configure({ inline: true, allowBase64: true }),
  Table.configure({
    resizable: true,
    HTMLAttributes: {
      class: "tiptap-table",
    },
  }),
  TableRow,
  TableHeader,
  TableCell,
];

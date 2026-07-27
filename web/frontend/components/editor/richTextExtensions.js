/**
 * richTextExtensions.js
 *
 * Single source of truth for the Tiptap extension list shared between:
 *  - Classic editor (TiptapEditor.jsx)  — uses `classicRichTextExtensions`
 *  - Builder RichText block (RichTextBlock.jsx) — uses `builderRichTextExtensions`
 *
 * Key differences between the two variants:
 *  - History: enabled in classic (StarterKit default), disabled in Builder so
 *    the Builder's own Zustand/Immer undo stack is the single source of truth.
 *  - DragHandle / NodeRange: included in classic for intra-editor node reordering;
 *    excluded in Builder where dnd-kit handles block-level reordering instead.
 */

import StarterKit from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { ResizableImage } from "./extensions/ResizableImage";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Highlight } from "@tiptap/extension-highlight";
import { Youtube } from "@tiptap/extension-youtube";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import {
  CustomTableHeader,
  CustomTableCell,
} from "./extensions/tableExtensions";
import { ColumnLayout } from "./nodes/ColumnLayout/ColumnLayout";
import { Column } from "./nodes/ColumnLayout/Column";
import { ProductCard } from "./nodes/ProductCard/ProductCard";
import { ImageBlock } from "./nodes/ImageBlock/ImageBlock";
import { DividerBlock } from "./nodes/DividerBlock/DividerBlock";
import { CalloutBlock } from "./nodes/CalloutBlock/CalloutBlock";
import { VideoEmbedBlock } from "./nodes/VideoEmbedBlock/VideoEmbedBlock";
import { ButtonBlock } from "./nodes/ButtonBlock/ButtonBlock";
import { HtmlBlock } from "./nodes/HtmlBlock/HtmlBlock";
import { BuyButtonExtension } from "./extensions/BuyButtonExtension";
import { ProductGridExtension } from "./extensions/ProductGridExtension";
import { CollectionExtension } from "./extensions/CollectionExtension";
import { CTAButtonExtension } from "./extensions/CTAButtonExtension";
import { HeroExtension } from "./extensions/HeroExtension";
import { VideoExtension } from "./extensions/VideoExtension";
import { SpacerExtension } from "./extensions/SpacerExtension";
import { ProductSliderExtension } from "./extensions/ProductSliderExtension";
import {
  LegacyProductCardExtension,
  LegacyStickyProductExtension,
  LegacyFeaturedProductExtension,
} from "./extensions/LegacyBuyButtonExtensions";
import { LegacyProductSwitcherExtension } from "./extensions/LegacyProductGridExtensions";
import NodeRange from "@tiptap/extension-node-range";
import Dropcursor from "@tiptap/extension-dropcursor";
import Gapcursor from "@tiptap/extension-gapcursor";

// ---------------------------------------------------------------------------
// Shared content extensions (same in both variants)
// ---------------------------------------------------------------------------
const sharedContentExtensions = [
  Underline,
  ResizableImage.configure({ inline: false }),
  Link.configure({ openOnClick: false }),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Youtube.configure({ width: "100%", height: 400 }),
  Table.configure({ resizable: true }),
  TableRow,
  CustomTableHeader,
  CustomTableCell,
  ColumnLayout,
  Column,
  ProductCard,
  ImageBlock,
  DividerBlock,
  CalloutBlock,
  VideoEmbedBlock,
  ButtonBlock,
  HtmlBlock,
  BuyButtonExtension,
  ProductGridExtension,
  CollectionExtension,
  CTAButtonExtension,
  HeroExtension,
  VideoExtension,
  SpacerExtension,
  ProductSliderExtension,
  LegacyProductCardExtension,
  LegacyStickyProductExtension,
  LegacyFeaturedProductExtension,
  LegacyProductSwitcherExtension,
  Dropcursor,
  Gapcursor,
];

// ---------------------------------------------------------------------------
// Classic mode — History ON, DragHandle + NodeRange included.
// Used by TiptapEditor.jsx (the existing full-page WYSIWYG editor).
// ---------------------------------------------------------------------------
export const classicRichTextExtensions = (placeholder = "") => [
  StarterKit.configure({
    link: false,
    underline: false,
    // History stays enabled (StarterKit default) for classic undo/redo
  }),
  Placeholder.configure({ placeholder }),
  NodeRange.configure({
    keymap: {
      "Alt-ArrowUp": "nodeRangeUp",
      "Alt-ArrowDown": "nodeRangeDown",
    },
  }),
  ...sharedContentExtensions,
];

// ---------------------------------------------------------------------------
// Builder mode — History OFF, no DragHandle / NodeRange.
// Used by RichTextBlock.jsx inside the drag-and-drop builder.
// Undo/redo is handled by the Zustand/Immer store instead.
// ---------------------------------------------------------------------------
export const builderRichTextExtensions = (placeholder = "") => [
  StarterKit.configure({
    link: false,
    underline: false,
    history: false, // Builder's Immer store handles undo/redo
  }),
  Placeholder.configure({ placeholder }),
  // NodeRange and DragHandle intentionally excluded — dnd-kit manages
  // block-level reordering; having both active in the same DOM region
  // creates ambiguous drag affordances and potential DOM conflicts.
  ...sharedContentExtensions,
];

/**
 * richTextExtensions.js
 *
 * Single source of truth for the Tiptap extension list used by the
 * Builder's RichText block (RichTextBlock.jsx).
 *
 * Scope: Basic text formatting only.
 * Color, Highlight, and Table are handled outside of the Tiptap document.
 * History is disabled because the Builder's Zustand/Immer store handles undo/redo.
 */

import StarterKit from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextAlign } from "@tiptap/extension-text-align";

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
];

/**
 * useBuilderKeyboard.js
 *
 * Global keyboard shortcuts for the Page Builder.
 * Only active when the builder is mounted (not in WYSIWYG mode).
 *
 * Shortcuts:
 *   Ctrl+Z          → Undo
 *   Ctrl+Y          → Redo
 *   Ctrl+Shift+Z    → Redo (Mac convention)
 *   Delete/Backspace → Delete selected block (when not in a text input)
 *   Escape          → Deselect block
 */
import { useEffect } from 'react';
import { useEditorStore } from '../stores/editorStore';

export function useBuilderKeyboard({ enabled = true } = {}) {
  const { undo, redo, canUndo, canRedo, selectedBlockId, removeBlock, deselectBlock } = useEditorStore();

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e) {
      const target = e.target;

      // Skip if typing in an input, textarea, or contenteditable
      const isTyping =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable ||
        target.closest('[data-tiptap-editor]') !== null;

      // Ctrl+Z — Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (canUndo()) {
          e.preventDefault();
          undo();
        }
        return;
      }

      // Ctrl+Y or Ctrl+Shift+Z — Redo
      if (
        ((e.ctrlKey || e.metaKey) && e.key === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')
      ) {
        if (canRedo()) {
          e.preventDefault();
          redo();
        }
        return;
      }

      // Skip remaining shortcuts when typing
      if (isTyping) return;

      // Delete / Backspace — remove selected block
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBlockId) {
        e.preventDefault();
        removeBlock(selectedBlockId);
        return;
      }

      // Escape — deselect
      if (e.key === 'Escape' && selectedBlockId) {
        e.preventDefault();
        deselectBlock();
        return;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, undo, redo, canUndo, canRedo, selectedBlockId, removeBlock, deselectBlock]);
}

/**
 * useAutoSave.js
 *
 * Debounced auto-save hook. Calls the provided save function
 * 1 second after the last change, only if content has changed.
 *
 * Usage:
 *   useAutoSave(blocks, (blocks) => savePost(blocks), { delay: 1000 });
 */
import { useEffect, useRef, useCallback } from 'react';

/**
 * @param {any}      data      - The data to watch (blocks array, or any value)
 * @param {Function} saveFn    - Async function called with (data) on save
 * @param {Object}   options
 * @param {number}   options.delay      - Debounce delay in ms (default: 1000)
 * @param {boolean}  options.enabled    - Set false to disable autosave
 * @param {Function} options.onSave     - Called after successful save
 * @param {Function} options.onError    - Called on save error
 */
export function useAutoSave(data, saveFn, {
  delay = 1000,
  enabled = true,
  onSave,
  onError,
} = {}) {
  const timerRef = useRef(null);
  const lastSavedRef = useRef(null);
  const isSavingRef = useRef(false);

  const save = useCallback(async (dataToSave) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      await saveFn(dataToSave);
      lastSavedRef.current = JSON.stringify(dataToSave);
      onSave?.();
    } catch (err) {
      console.error('[AutoSave] Save failed:', err);
      onError?.(err);
    } finally {
      isSavingRef.current = false;
    }
  }, [saveFn, onSave, onError]);

  useEffect(() => {
    if (!enabled) return;

    const serialized = JSON.stringify(data);
    // Skip if nothing changed since last save
    if (serialized === lastSavedRef.current) return;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      save(data);
    }, delay);

    return () => clearTimeout(timerRef.current);
  }, [data, delay, enabled, save]);

  // Force immediate save (e.g. on page unload)
  const flush = useCallback(() => {
    clearTimeout(timerRef.current);
    const serialized = JSON.stringify(data);
    if (serialized !== lastSavedRef.current) {
      save(data);
    }
  }, [data, save]);

  return { flush };
}

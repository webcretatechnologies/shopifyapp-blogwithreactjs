/**
 * jsonPatchHelper.js
 *
 * Provides utilities for generating JSON Patch (RFC 6902) operations
 * between two object states, enabling incremental saves.
 */

/**
 * Very basic, naive JSON patch generator for demonstration purposes.
 * In production, you would use a robust library like 'fast-json-patch'.
 */
export function generatePatch(oldObj, newObj) {
  const patches = [];
  
  if (!oldObj || typeof oldObj !== 'object') return [{ op: 'replace', path: '', value: newObj }];
  
  const oldStr = JSON.stringify(oldObj);
  const newStr = JSON.stringify(newObj);
  
  if (oldStr !== newStr) {
    // A real implementation would diff the trees. For now we just replace.
    patches.push({ op: 'replace', path: '', value: newObj });
  }

  return patches;
}

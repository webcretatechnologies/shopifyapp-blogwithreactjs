/**
 * nanoid.js — tiny collision-resistant ID generator (no external dep needed)
 * Produces a 21-char URL-safe string. Drop-in for the `nanoid` package.
 */
export function nanoid(size = 21) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let id = "";
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  for (let i = 0; i < size; i++) {
    id += chars[bytes[i] & 63];
  }
  return id;
}

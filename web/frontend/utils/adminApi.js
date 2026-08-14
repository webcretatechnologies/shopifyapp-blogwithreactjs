// Shared helpers for the Super Admin panel's modules (web/frontend/components/admin/modules/*).
// Pulled out of the old monolithic admin.jsx so every module gets the exact same
// auth-header/401-handling/error-shape behavior without each one reimplementing it.

/**
 * Builds a fetch wrapper that attaches the admin's Bearer token, throws on non-2xx (using the
 * server's `{ error }` body when present), and calls `onUnauthorized()` (typically "log out and
 * show the login screen") on a 401 instead of leaving the caller to detect it.
 */
export function createAdminFetch(token, onUnauthorized) {
  return async function adminFetch(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    };
    const res = await fetch(path, { ...options, headers });
    if (res.status === 401) {
      onUnauthorized();
      throw new Error("Session expired. Please log in again.");
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  };
}

/** Downloads a CSV (or any blob) response from an authenticated admin endpoint. */
export async function downloadAdminFile(token, path, filename) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

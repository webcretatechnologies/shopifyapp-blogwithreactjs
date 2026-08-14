/**
 * Builds a Polaris <Page> backAction that returns to wherever the user actually came from
 * within this app (SPA history) when there is such an entry, falling back to a fixed route only
 * when there isn't one — e.g. a fresh page load, a hard refresh, or a deep link. React Router
 * marks that first entry's location.key as "default" (confirmed in @remix-run/router's history
 * implementation: it's the literal fallback used whenever there's no router-assigned history
 * state yet), which is the reliable signal to tell the two cases apart. Without this fallback,
 * "back" on a freshly-loaded page would either do nothing or exit the embedded admin iframe.
 *
 * `navigate` may be the raw react-router navigate function, or a wrapper (e.g. posts/new.jsx's
 * leaveEditor, which hides the App Bridge save bar first) — anything that forwards its argument
 * to react-router's navigate() works, since navigate(-1) is just as valid as navigate("/path").
 */
export function smartBackAction(navigate, location, fallbackPath, label = "Back") {
  const hasInAppHistory = location.key !== "default";
  return {
    content: label,
    onAction: () => navigate(hasInAppHistory ? -1 : fallbackPath),
  };
}

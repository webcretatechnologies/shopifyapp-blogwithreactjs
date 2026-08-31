/**
 * Shared article-content CSS used by the live preview modal (ArticlePreview) and the
 * template gallery live previews (TemplateLivePreview). Scoped to `.blogger-preview-content`
 * so it never leaks onto Polaris chrome.
 */
export const PREVIEW_CONTENT_CSS = `
/* ── Base typography ──────────────────────────────────────────── */
.blogger-preview-content {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.75;
  color: #202223;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* ── Headings ─────────────────────────────────────────────────── */
.blogger-preview-content h1 {
  font-size: 2em;
  font-weight: 800;
  line-height: 1.25;
  margin: 1.2em 0 0.6em;
  color: #121212;
  letter-spacing: -0.02em;
}
.blogger-preview-content h2 {
  font-size: 1.6em;
  font-weight: 700;
  line-height: 1.3;
  margin: 1.1em 0 0.5em;
  color: #121212;
  letter-spacing: -0.01em;
}
.blogger-preview-content h3 {
  font-size: 1.3em;
  font-weight: 600;
  line-height: 1.35;
  margin: 1em 0 0.4em;
  color: #202223;
}
.blogger-preview-content h4 {
  font-size: 1.1em;
  font-weight: 600;
  line-height: 1.4;
  margin: 0.8em 0 0.3em;
  color: #202223;
}
.blogger-preview-content h5,
.blogger-preview-content h6 {
  font-size: 1em;
  font-weight: 600;
  line-height: 1.4;
  margin: 0.6em 0 0.3em;
  color: #6d7175;
}

/* ── Paragraphs ───────────────────────────────────────────────── */
.blogger-preview-content p {
  margin: 0 0 1.2em;
  line-height: 1.75;
}
.blogger-preview-content p:last-child {
  margin-bottom: 0;
}

/* ── Links ────────────────────────────────────────────────────── */
.blogger-preview-content a {
  color: #008060;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.15s ease;
}
.blogger-preview-content a:hover {
  color: #006e52;
}

/* ── Lists ────────────────────────────────────────────────────── */
.blogger-preview-content ul,
.blogger-preview-content ol {
  margin: 0 0 1.2em;
  padding-left: 1.8em;
}
.blogger-preview-content ul {
  list-style-type: disc;
}
.blogger-preview-content ol {
  list-style-type: decimal;
}
.blogger-preview-content li {
  margin-bottom: 0.4em;
  line-height: 1.7;
}
.blogger-preview-content li:last-child {
  margin-bottom: 0;
}
.blogger-preview-content ul ul,
.blogger-preview-content ol ol,
.blogger-preview-content ul ol,
.blogger-preview-content ol ul {
  margin-top: 0.4em;
  margin-bottom: 0.4em;
}

/* ── Blockquotes ──────────────────────────────────────────────── */
.blogger-preview-content blockquote {
  margin: 1.5em 0;
  padding: 16px 20px;
  border-left: 4px solid #008060;
  background: #f6f6f7;
  border-radius: 0 8px 8px 0;
  font-style: italic;
  color: #333;
}
.blogger-preview-content blockquote p:last-child {
  margin-bottom: 0;
}

/* ── Code ─────────────────────────────────────────────────────── */
.blogger-preview-content code {
  font-family: "SF Mono", "Fira Code", "Fira Mono", "Roboto Mono", Menlo, Monaco, Consolas, monospace;
  background: #f1f2f3;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
  color: #d72c0d;
}
.blogger-preview-content pre {
  margin: 1.5em 0;
  padding: 16px 20px;
  background: #1a1a2e;
  color: #e0e0e0;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 14px;
  line-height: 1.6;
}
.blogger-preview-content pre code {
  background: none;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
  color: inherit;
}

/* ── Horizontal rules ─────────────────────────────────────────── */
.blogger-preview-content hr {
  border: none;
  border-top: 2px solid #e1e3e5;
  margin: 2em 0;
}

/* ── Images ───────────────────────────────────────────────────── */
.blogger-preview-content img {
  max-width: 100%;
  height: auto;
  display: block;
  border-radius: 8px;
  margin: 1.2em auto;
}
.blogger-preview-content img[style*="display: inline"] {
  display: inline;
}

/* ── Tables ───────────────────────────────────────────────────── */
.blogger-preview-content table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #dfe3e8;
  border-radius: 8px;
  overflow: hidden;
  margin: 1.5em 0;
  font-size: 14px;
  background: #fff;
}
.blogger-preview-content thead {
  background: #f6f6f7;
}
.blogger-preview-content th {
  padding: 12px 16px;
  text-align: left;
  font-weight: 700;
  color: #202223;
  border-bottom: 2px solid #dfe3e8;
  white-space: nowrap;
}
.blogger-preview-content td {
  padding: 10px 16px;
  border-bottom: 1px solid #f1f2f3;
  vertical-align: top;
  color: #333;
}
.blogger-preview-content tr:last-child td {
  border-bottom: none;
}
.blogger-preview-content tbody tr:hover {
  background: #f9fafb;
}
.blogger-preview-content tr:nth-child(even) td {
  background: #fafbfc;
}

/* ── YouTube embeds ───────────────────────────────────────────── */
.blogger-preview-content iframe[src*="youtube"],
.blogger-preview-content iframe[src*="vimeo"] {
  width: 100%;
  aspect-ratio: 16 / 9;
  border: none;
  border-radius: 8px;
  margin: 1.5em 0;
}

/* ── Product / commerce blocks ────────────────────────────────── */
.blogger-preview-content [data-type] {
  margin: 1.5em 0;
}

/* ── Responsive adjustments for mobile preview ────────────────── */
@media (max-width: 480px) {
  .blogger-preview-content {
    font-size: 15px;
  }
  .blogger-preview-content h1 {
    font-size: 1.6em;
  }
  .blogger-preview-content h2 {
    font-size: 1.35em;
  }
  .blogger-preview-content table {
    font-size: 13px;
    display: block;
    overflow-x: auto;
  }
  .blogger-preview-content pre {
    font-size: 13px;
    padding: 12px 14px;
  }
}
`;

/**
 * Injects PREVIEW_CONTENT_CSS into <head> exactly once (id-guarded, never removed).
 * Used by components that render many previews at once (e.g. the template gallery),
 * where per-instance mount/unmount removal would race and strip the styles.
 */
export function ensurePreviewContentCss() {
  if (typeof document === "undefined") return;
  const id = "blogger-template-preview-css";
  if (document.getElementById(id)) return;
  const styleEl = document.createElement("style");
  styleEl.id = id;
  styleEl.textContent = PREVIEW_CONTENT_CSS;
  document.head.appendChild(styleEl);
}

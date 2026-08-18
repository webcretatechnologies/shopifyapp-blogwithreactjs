// Shared CSV export helper for the Analytics dashboard and its per-post drill-down page.
// Emits multiple stacked "sections" in a single CSV file (a `# Section Name` comment row,
// then a header row, then data rows, then a blank line) — a common convention for multi-table
// exports without pulling in a zip/xlsx dependency, none of which exists in this repo.

function escapeCsvValue(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function sectionToRows(title, headers, rows) {
  const lines = [`# ${title}`];
  lines.push(headers.map(escapeCsvValue).join(","));
  rows.forEach((row) => lines.push(row.map(escapeCsvValue).join(",")));
  return lines;
}

/**
 * sections: [{ title, headers: string[], rows: any[][] }]
 */
export function downloadAnalyticsCsv(filename, sections) {
  const lines = [];
  sections.forEach((s, i) => {
    if (i > 0) lines.push("");
    lines.push(...sectionToRows(s.title, s.headers, s.rows));
  });
  const csv = lines.join("\n");
  // Leading UTF-8 BOM — without it, Excel (still the most common CSV consumer for merchants)
  // guesses the encoding from content and reliably mangles non-ASCII characters (accented post
  // titles, country names, currency symbols) into garbled text. Every other consumer (Numbers,
  // Google Sheets, a text editor) ignores the BOM harmlessly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Rounds to 2 decimals as a plain number (not a string) — avoids floating-point summation
 * artifacts (e.g. 2147.398159129008 from repeated float addition) showing up raw in an export. */
export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Formats a numeric amount using the store's currency (falls back to USD). */
export function formatMoney(value, currencyCode = "USD") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  } catch {
    return `${(Number(value) || 0).toFixed(2)} ${currencyCode}`;
  }
}

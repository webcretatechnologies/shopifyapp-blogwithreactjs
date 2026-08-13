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
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

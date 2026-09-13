import type { CrapRecord } from "./crap/index.js";

export const HIGH_CRAP_THRESHOLD = 15;

export function renderJson(records: CrapRecord[]): string {
  return JSON.stringify(records, null, 2);
}

function formatNullable(
  value: number | null,
  format: (n: number) => string,
): string {
  return value === null ? "-" : format(value);
}

function formatCoverage(coverage: number | null): string {
  return formatNullable(coverage, (c) => `${(c * 100).toFixed(1)}%`);
}

function formatCrap(crap: number | null): string {
  return formatNullable(crap, (c) => c.toFixed(2));
}

export interface HtmlRow extends CrapRecord {
  endLine: number;
  excerpt: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compareHtmlRows(a: HtmlRow, b: HtmlRow): number {
  if (a.crap === null && b.crap === null) {
    return a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line;
  }
  if (a.crap === null) {
    return 1;
  }
  if (b.crap === null) {
    return -1;
  }
  if (b.crap !== a.crap) {
    return b.crap - a.crap;
  }
  return a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line;
}

export function renderHtml(rows: HtmlRow[]): string {
  const sorted = [...rows].sort(compareHtmlRows);
  const body = sorted
    .map((r) => {
      const rowClass =
        r.crap !== null && r.crap > HIGH_CRAP_THRESHOLD
          ? ` class="high-crap"`
          : "";
      return (
        `<tr${rowClass}>` +
        `<td>${escapeHtml(r.file)}</td>` +
        `<td>${r.line}</td>` +
        `<td>${escapeHtml(r.name)}</td>` +
        `<td>${r.complexity}</td>` +
        `<td>${formatCoverage(r.coverage)}</td>` +
        `<td>${formatCrap(r.crap)}</td>` +
        `</tr>` +
        `<tr><td colspan="6">` +
        `<details><summary>${escapeHtml(r.name)}</summary>` +
        `<div>${escapeHtml(r.file)}:${r.line}-${r.endLine}</div>` +
        `<pre>${escapeHtml(r.excerpt)}</pre>` +
        `</details></td></tr>`
      );
    })
    .join("");
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<title>CRAP report</title>` +
    `<style>table{border-collapse:collapse}.high-crap{background-color:#fdd}th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}</style>` +
    `</head><body><table>` +
    `<thead><tr><th>FILE</th><th>LINE</th><th>NAME</th><th>COMPLEXITY</th><th>COVERAGE</th><th>CRAP</th></tr></thead>` +
    `<tbody>${body}</tbody>` +
    `</table></body></html>`
  );
}

export function renderTable(records: CrapRecord[]): string {
  const lines = ["FILE  LINE  NAME  COMPLEXITY  COVERAGE  CRAP"];
  for (const r of records) {
    const marker = r.crap !== null && r.crap > HIGH_CRAP_THRESHOLD ? "!" : " ";
    lines.push(
      `${marker}${r.file}  ${r.line}  ${r.name}  ${r.complexity}  ${formatCoverage(r.coverage)}  ${formatCrap(r.crap)}`,
    );
  }
  return lines.join("\n");
}

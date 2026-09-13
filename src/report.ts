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

const REPORT_SCRIPT = `<script>(function(){var search=document.getElementById("crap-search");var tbody=document.querySelector("tbody");var numeric={line:true,complexity:true,coverage:true,crap:true};var state={key:null,dir:1};function cellText(row,idx){var c=row.children[idx];return c?c.textContent.trim():"";}function parseNum(text){if(!text||text==="-")return null;var n=parseFloat(text.replace("%",""));return isNaN(n)?null:n;}function compareRows(a,b,key,idx,dir){var ta=cellText(a,idx);var tb=cellText(b,idx);if(numeric[key]){var na=parseNum(ta);var nb=parseNum(tb);if(na===null&&nb===null)return 0;if(na===null)return 1;if(nb===null)return -1;return (na-nb)*dir;}if(!ta&&!tb)return 0;if(!ta)return 1;if(!tb)return -1;return (ta<tb?-1:ta>tb?1:0)*dir;}search.addEventListener("input",function(){var q=search.value.toLowerCase();tbody.querySelectorAll("tr[data-name]").forEach(function(row){var hay=((row.getAttribute("data-name")||"")+" "+(row.getAttribute("data-file")||"")).toLowerCase();row.style.display=hay.indexOf(q)!==-1?"":"none";});});document.querySelectorAll("th[data-sort]").forEach(function(th){th.addEventListener("click",function(){var key=th.getAttribute("data-sort");var idx=Array.prototype.indexOf.call(th.parentNode.children,th);state.dir=state.key===key?-state.dir:1;state.key=key;var pairs=[];var current=null;Array.prototype.slice.call(tbody.rows).forEach(function(row){var first=row.children[0];if(first&&first.hasAttribute("colspan")&&current){current.push(row);}else{current=[row];pairs.push(current);}});pairs.sort(function(x,y){return compareRows(x[0],y[0],key,idx,state.dir);});pairs.forEach(function(pair){pair.forEach(function(row){tbody.appendChild(row);});});});});})();</script>`;

export function renderHtml(rows: HtmlRow[]): string {
  const sorted = [...rows].sort(compareHtmlRows);
  const body = sorted
    .map((r) => {
      const rowClass =
        r.crap !== null && r.crap > HIGH_CRAP_THRESHOLD
          ? ` class="high-crap"`
          : "";
      const tags = ` data-name="${escapeHtml(r.name)}" data-file="${escapeHtml(r.file)}"`;
      return (
        `<tr${rowClass}${tags}>` +
        `<td>${escapeHtml(r.file)}</td>` +
        `<td>${r.line}</td>` +
        `<td>${escapeHtml(r.name)}</td>` +
        `<td>${r.complexity}</td>` +
        `<td>${formatCoverage(r.coverage)}</td>` +
        `<td>${formatCrap(r.crap)}</td>` +
        `</tr>` +
        `<tr${tags}><td colspan="6">` +
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
    `<style>table{border-collapse:collapse}.high-crap{background-color:#fdd}th,td{border:1px solid #ccc;padding:4px 8px;text-align:left}thead th{position: sticky; top: 0; background:#fff}</style>` +
    `</head><body>` +
    `<input id="crap-search" type="search" placeholder="Filter by function or file">` +
    `<table>` +
    `<thead><tr><th data-sort="file">FILE</th><th data-sort="line">LINE</th><th data-sort="name">NAME</th><th data-sort="complexity">COMPLEXITY</th><th data-sort="coverage">COVERAGE</th><th data-sort="crap">CRAP</th></tr></thead>` +
    `<tbody>${body}</tbody>` +
    `</table>${REPORT_SCRIPT}</body></html>`
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

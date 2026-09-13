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

function compareFileLine(a: HtmlRow, b: HtmlRow): number {
  return a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line;
}

function compareHtmlRows(a: HtmlRow, b: HtmlRow): number {
  if (a.crap === null && b.crap === null) {
    return compareFileLine(a, b);
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
  return compareFileLine(a, b);
}

const REPORT_STYLE =
  `body{font-family:system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;` +
  `margin:0 auto;max-width:1240px;padding:24px 24px 48px;color:#24292f;` +
  `font-size:14px;line-height:1.5;background:#fff}` +
  `h1{font-size:20px;margin:0 0 4px}` +
  `.meta{margin:0 0 8px;color:#57606a}` +
  `.toolbar{position:sticky;top:0;left:0;z-index:3;background:#fff;height:60px;` +
  `display:flex;align-items:center;border-bottom:1px solid #d0d7de;box-sizing:border-box}` +
  `#crap-search{flex:1;max-width:480px;font:inherit;padding:8px 12px;` +
  `border:1px solid #d0d7de;border-radius:6px;background:#fff}` +
  `#crap-search:focus{outline:2px solid #0969da;outline-offset:-1px;border-color:#0969da}` +
  `table{width:100%;min-width:960px;border-collapse:separate;border-spacing:0}` +
  `thead th{position: sticky; top: 60px;z-index:2;background:#f6f8fa;white-space:nowrap;` +
  `cursor:pointer;user-select:none;border-top:1px solid #d0d7de}` +
  `th,td{border-bottom:1px solid #d0d7de;border-right:1px solid #d0d7de;` +
  `padding:8px 12px;text-align:left;vertical-align:top}` +
  `th:first-child,td:first-child{border-left:1px solid #d0d7de}` +
  `tbody tr:not(.detail) td:nth-child(2),tbody tr:not(.detail) td:nth-child(4),` +
  `tbody tr:not(.detail) td:nth-child(5),tbody tr:not(.detail) td:nth-child(6)` +
  `{text-align:right;font-variant-numeric:tabular-nums}` +
  `tbody tr:not(.detail):hover{background:#f6f8fa}` +
  `tbody tr.high-crap{background:#ffebe9}` +
  `tbody tr.high-crap:hover{background:#ffddd8}` +
  `tbody tr.high-crap td:nth-child(6){font-weight:700;color:#cf222e}` +
  `tbody td:nth-child(1),tbody td:nth-child(3)` +
  `{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px}` +
  `tbody tr.detail td{background:#fafbfc}` +
  `summary{cursor:pointer;font-weight:600}` +
  `details div{color:#57606a;font-size:12px;margin:4px 0;` +
  `font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}` +
  `pre{background:#fff;border:1px solid #d0d7de;border-radius:6px;padding:12px;` +
  `overflow:auto;max-height:420px;font-size:12.5px;` +
  `font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}`;

const REPORT_SCRIPT = `<script>(function(){var search=document.getElementById("crap-search");var tbody=document.querySelector("tbody");var numeric={line:true,complexity:true,coverage:true,crap:true};var state={key:null,dir:1};function attr(row,key){return row.getAttribute("data-"+key)||"";}function compareRows(a,b,key,dir){var ta=attr(a,key);var tb=attr(b,key);if(numeric[key]){var na=ta===""?null:parseFloat(ta);var nb=tb===""?null:parseFloat(tb);if(na===null&&nb===null)return 0;if(na===null)return 1;if(nb===null)return -1;return (na-nb)*dir;}if(!ta&&!tb)return 0;if(!ta)return 1;if(!tb)return -1;return (ta<tb?-1:ta>tb?1:0)*dir;}search.addEventListener("input",function(){var q=search.value.toLowerCase();tbody.querySelectorAll("tr[data-name]").forEach(function(row){var hay=((row.getAttribute("data-name")||"")+" "+(row.getAttribute("data-file")||"")).toLowerCase();row.style.display=hay.indexOf(q)!==-1?"":"none";});});document.querySelectorAll("th[data-sort]").forEach(function(th){th.addEventListener("click",function(){var key=th.getAttribute("data-sort");state.dir=state.key===key?-state.dir:1;state.key=key;var pairs=[];var current=null;Array.prototype.slice.call(tbody.rows).forEach(function(row){if(row.classList.contains("detail")&&current){current.push(row);}else{current=[row];pairs.push(current);}});pairs.sort(function(x,y){return compareRows(x[0],y[0],key,state.dir);});pairs.forEach(function(pair){pair.forEach(function(row){tbody.appendChild(row);});});});});})();</script>`;

export function renderHtml(rows: HtmlRow[]): string {
  const sorted = [...rows].sort(compareHtmlRows);
  const body = sorted
    .map((r) => {
      const rowClass =
        r.crap !== null && r.crap > HIGH_CRAP_THRESHOLD
          ? ` class="high-crap"`
          : "";
      const coverageKey = r.coverage === null ? "" : String(r.coverage);
      const crapKey = r.crap === null ? "" : String(r.crap);
      const tags = ` data-name="${escapeHtml(r.name)}" data-file="${escapeHtml(r.file)}"`;
      const keys =
        ` data-line="${r.line}" data-complexity="${r.complexity}"` +
        ` data-coverage="${coverageKey}" data-crap="${crapKey}"`;
      return (
        `<tr${rowClass}${tags}${keys}>` +
        `<td>${escapeHtml(r.file)}</td>` +
        `<td>${r.line}</td>` +
        `<td>${escapeHtml(r.name)}</td>` +
        `<td>${r.complexity}</td>` +
        `<td>${formatCoverage(r.coverage)}</td>` +
        `<td>${formatCrap(r.crap)}</td>` +
        `</tr>` +
        `<tr class="detail"${tags}><td colspan="6">` +
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
    `<style>${REPORT_STYLE}</style>` +
    `</head><body>` +
    `<h1>CRAP report</h1>` +
    `<p class="meta">${sorted.length} functions, sorted by CRAP descending</p>` +
    `<div class="toolbar">` +
    `<input id="crap-search" type="search" placeholder="Filter by function or file">` +
    `</div>` +
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

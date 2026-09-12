import type { CrapRecord } from "./crap.js";

export function renderJson(records: CrapRecord[]): string {
  return JSON.stringify(records, null, 2);
}

function formatCoverage(coverage: number | null): string {
  return coverage === null ? "-" : `${(coverage * 100).toFixed(1)}%`;
}

function formatCrap(crap: number | null): string {
  return crap === null ? "-" : crap.toFixed(2);
}

export function renderTable(records: CrapRecord[]): string {
  const lines = ["FILE  LINE  NAME  COMPLEXITY  COVERAGE  CRAP"];
  for (const r of records) {
    const marker = r.crap !== null && r.crap > 15 ? "!" : " ";
    lines.push(
      `${marker}${r.file}  ${r.line}  ${r.name}  ${r.complexity}  ${formatCoverage(r.coverage)}  ${formatCrap(r.crap)}`,
    );
  }
  return lines.join("\n");
}

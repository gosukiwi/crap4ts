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

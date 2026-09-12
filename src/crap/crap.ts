import type { FunctionComplexity } from "./complexity.js";

export interface CrapRecord {
  file: string;
  line: number;
  col: number;
  name: string;
  complexity: number;
  coverage: number | null;
  crap: number | null;
}

export function crapScore(complexity: number, coverage: number): number {
  return complexity ** 2 * (1 - coverage) ** 3 + complexity;
}

export function assembleRecord(
  fn: FunctionComplexity,
  coverage: number | null,
): CrapRecord {
  return {
    file: fn.file,
    line: fn.line,
    col: fn.col,
    name: fn.name,
    complexity: fn.complexity,
    coverage,
    crap: coverage === null ? null : crapScore(fn.complexity, coverage),
  };
}

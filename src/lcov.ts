import * as path from "node:path";

export interface LcovFunction {
  file: string;
  name: string;
  line: number;
  hit: boolean;
}

export interface LcovLine {
  line: number;
  hits: number;
}

export interface LcovFile {
  file: string;
  functions: LcovFunction[];
  lines: LcovLine[];
}

export function normalize(p: string): string {
  let s = p.replace(/\\/g, "/");
  if (s.startsWith("./")) s = s.slice(2);
  return s;
}

function toAbsolute(p: string, cwd: string): string {
  return normalize(path.resolve(cwd, p));
}

function segments(p: string): string[] {
  return normalize(p)
    .split("/")
    .filter((s) => s !== "" && s !== ".");
}

function suffixJoin(a: string, b: string): boolean {
  const sa = segments(a);
  const sb = segments(b);
  if (sa.length === 0 || sb.length === 0) return false;
  const longer = sa.length >= sb.length ? sa : sb;
  const shorter = sa.length >= sb.length ? sb : sa;
  if (longer.length === shorter.length) return false;
  const tail = longer.slice(longer.length - shorter.length);
  return tail.every((s, i) => s === shorter[i]);
}

// Join policy for matching an analyzed file against parsed lcov records:
// relative exact-match first, then absolute-path equality, then a
// segment-suffix match where the shorter segment list is a trailing
// subsequence of the longer.
export function matchLcovFile(
  lcovFiles: LcovFile[],
  relPath: string,
  cwd: string,
): LcovFile | null {
  for (const f of lcovFiles) {
    if (normalize(f.file) === relPath) return f;
  }
  const analyzedAbs = toAbsolute(relPath, cwd);
  for (const f of lcovFiles) {
    if (toAbsolute(f.file, cwd) === analyzedAbs) return f;
  }
  for (const f of lcovFiles) {
    if (suffixJoin(normalize(f.file), relPath)) return f;
  }
  return null;
}

export function parseLcov(traceText: string): LcovFile[] {
  const files: LcovFile[] = [];
  const byFile = new Map<string, LcovFile>();
  const fnIndexByFile = new Map<string, Map<string, number>>();

  function recordFor(file: string): {
    rec: LcovFile;
    index: Map<string, number>;
  } {
    let rec = byFile.get(file);
    if (rec === undefined) {
      rec = { file, functions: [], lines: [] };
      byFile.set(file, rec);
      files.push(rec);
    }
    let index = fnIndexByFile.get(file);
    if (index === undefined) {
      index = new Map();
      fnIndexByFile.set(file, index);
    }
    return { rec, index };
  }

  let current: string | null = null;

  // Handlers for records that only make sense inside a section (after an
  // SF: line) share one guard: outside a section they are no-ops.
  function inSection(
    handle: (file: string, rest: string) => void,
  ): (rest: string) => void {
    return (rest) => {
      if (current === null) return;
      handle(current, rest);
    };
  }

  const handlers = new Map<string, (rest: string) => void>([
    [
      "SF:",
      (rest) => {
        current = rest;
        recordFor(rest);
      },
    ],
    [
      "FN:",
      inSection((file, rest) => {
        const comma = rest.indexOf(",");
        if (comma === -1) return;
        const lineNo = Number(rest.slice(0, comma));
        const name = rest.slice(comma + 1);
        if (!Number.isFinite(lineNo)) return;
        const { rec, index } = recordFor(file);
        const existing = index.get(name);
        if (existing === undefined) {
          index.set(name, rec.functions.length);
          rec.functions.push({ file, name, line: lineNo, hit: false });
        } else {
          rec.functions[existing].line = lineNo;
        }
      }),
    ],
    [
      "FNDA:",
      inSection((file, rest) => {
        const comma = rest.indexOf(",");
        if (comma === -1) return;
        const count = Number(rest.slice(0, comma));
        const name = rest.slice(comma + 1);
        if (!Number.isFinite(count)) return;
        const { rec, index } = recordFor(file);
        const existing = index.get(name);
        if (existing === undefined) {
          index.set(name, rec.functions.length);
          rec.functions.push({
            file,
            name,
            line: 0,
            hit: count > 0,
          });
        } else {
          rec.functions[existing].hit = count > 0;
        }
      }),
    ],
    [
      "DA:",
      inSection((file, rest) => {
        const parts = rest.split(",");
        if (parts.length < 2) return;
        const lineNo = Number(parts[0]);
        const hits = Number(parts[1]);
        if (!Number.isFinite(lineNo) || !Number.isFinite(hits)) return;
        recordFor(file).rec.lines.push({ line: lineNo, hits });
      }),
    ],
    ["BRDA:", () => {}],
  ]);

  for (const rawLine of traceText.split("\n")) {
    const line = rawLine.trim();
    if (line === "end_of_record") {
      current = null;
      continue;
    }
    const colon = line.indexOf(":");
    const prefix = colon === -1 ? line : line.slice(0, colon + 1);
    // Unknown prefixes (TN:, etc.) have no handler and are ignored.
    handlers.get(prefix)?.(line.slice(prefix.length));
  }

  return files;
}

export function functionCoverage(
  record: LcovFile,
  startLine: number,
  endLine: number,
): number | null {
  const inSpan = record.lines.filter(
    (l) => l.line >= startLine && l.line <= endLine,
  );
  if (inSpan.length === 0) return null;
  const covered = inSpan.filter((l) => l.hits > 0).length;
  return covered / inSpan.length;
}

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

  for (const rawLine of traceText.split("\n")) {
    const line = rawLine.trim();
    if (line === "end_of_record") {
      current = null;
      continue;
    }
    if (line.startsWith("SF:")) {
      current = line.slice(3);
      recordFor(current);
    } else if (line.startsWith("FN:")) {
      if (current === null) continue;
      const rest = line.slice(3);
      const comma = rest.indexOf(",");
      if (comma === -1) continue;
      const lineNo = Number(rest.slice(0, comma));
      const name = rest.slice(comma + 1);
      if (!Number.isFinite(lineNo)) continue;
      const { rec, index } = recordFor(current);
      const existing = index.get(name);
      if (existing === undefined) {
        index.set(name, rec.functions.length);
        rec.functions.push({ file: current, name, line: lineNo, hit: false });
      } else {
        rec.functions[existing].line = lineNo;
      }
    } else if (line.startsWith("FNDA:")) {
      if (current === null) continue;
      const rest = line.slice(5);
      const comma = rest.indexOf(",");
      if (comma === -1) continue;
      const count = Number(rest.slice(0, comma));
      const name = rest.slice(comma + 1);
      if (!Number.isFinite(count)) continue;
      const { rec, index } = recordFor(current);
      const existing = index.get(name);
      if (existing === undefined) {
        index.set(name, rec.functions.length);
        rec.functions.push({
          file: current,
          name,
          line: 0,
          hit: count > 0,
        });
      } else {
        rec.functions[existing].hit = count > 0;
      }
    } else if (line.startsWith("DA:")) {
      if (current === null) continue;
      const parts = line.slice(3).split(",");
      if (parts.length < 2) continue;
      const lineNo = Number(parts[0]);
      const hits = Number(parts[1]);
      if (!Number.isFinite(lineNo) || !Number.isFinite(hits)) continue;
      recordFor(current).rec.lines.push({ line: lineNo, hits });
    } else if (line.startsWith("BRDA:")) {
      continue;
    }
    // Unknown prefixes (TN:, etc.) are ignored.
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

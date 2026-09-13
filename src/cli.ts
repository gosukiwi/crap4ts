#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import {
  analyzeComplexity,
  assembleRecord,
  type ComplexityProfile,
  type CrapRecord,
} from "./crap/index.js";
import {
  functionCoverage,
  matchLcovFile,
  normalize,
  parseLcov,
} from "./lcov.js";
import type { LcovFile } from "./lcov.js";
import { renderHtml, renderJson, renderTable, type HtmlRow } from "./report.js";

type Format = "json" | "table" | "html";

interface Options {
  src: string;
  coveragePath: string | null;
  format: Format;
  maxCrap: number | null;
  profile: ComplexityProfile;
  out: string | null;
}

const USAGE = `usage: crap4ts [src] [--coverage <path>] [--format json|table|html] [--out <path>] [--max-crap <n>] [--complexity-profile strict|balanced|permissive] [--help]`;

class ParseError extends Error {}

class HelpRequested extends Error {}

function fail(message: string): never {
  throw new ParseError(`crap4ts: ${message}`);
}

interface FlagSpec {
  name: string;
  validate: (value: string) => void;
  assign: (options: Options, value: string) => void;
}

const FLAG_SPECS: FlagSpec[] = [
  {
    name: "--coverage",
    validate: () => {},
    assign: (options, value) => {
      options.coveragePath = value;
    },
  },
  {
    name: "--format",
    validate: (value) => {
      if (value !== "json" && value !== "table" && value !== "html") {
        fail(`invalid --format: ${value}`);
      }
    },
    assign: (options, value) => {
      options.format = value as Format;
    },
  },
  {
    name: "--out",
    validate: (value) => {
      if (value === "") {
        fail("invalid --out: value must not be empty");
      }
    },
    assign: (options, value) => {
      options.out = value;
    },
  },
  {
    name: "--max-crap",
    validate: (value) => {
      if (!Number.isFinite(Number(value))) {
        fail(`invalid --max-crap: ${value}`);
      }
    },
    assign: (options, value) => {
      options.maxCrap = Number(value);
    },
  },
  {
    name: "--complexity-profile",
    validate: (value) => {
      if (
        value !== "strict" &&
        value !== "balanced" &&
        value !== "permissive"
      ) {
        fail(`invalid --complexity-profile: ${value}`);
      }
    },
    assign: (options, value) => {
      options.profile = value as ComplexityProfile;
    },
  },
];

// Splits `--flag=value` from `--flag value` in one place.
function takeValue(
  flag: string,
  args: string[],
  i: number,
): { value: string; next: number } {
  const eq = args[i].indexOf("=");
  if (eq !== -1) {
    return { value: args[i].slice(eq + 1), next: i };
  }
  if (i + 1 >= args.length) {
    fail(`${flag} requires a value`);
  }
  return { value: args[i + 1], next: i + 1 };
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    src: "src",
    coveragePath: null,
    format: "table",
    maxCrap: null,
    profile: "strict",
    out: null,
  };
  let positional: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const name = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (name === "--help") {
      console.log(USAGE);
      throw new HelpRequested();
    }
    const spec = FLAG_SPECS.find((s) => s.name === name);
    if (spec !== undefined) {
      const taken = takeValue(spec.name, argv, i);
      spec.validate(taken.value);
      spec.assign(options, taken.value);
      i = taken.next;
    } else if (arg.startsWith("--")) {
      fail(`unknown flag: ${arg}`);
    } else if (positional === null) {
      positional = arg;
    } else {
      fail(`unexpected argument: ${arg}`);
    }
  }

  if (positional !== null) {
    options.src = positional;
  }
  return options;
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (
      entry.isFile() &&
      (full.endsWith(".ts") ||
        full.endsWith(".tsx") ||
        full.endsWith(".mts") ||
        full.endsWith(".cts")) &&
      !full.endsWith(".d.ts") &&
      !full.endsWith(".d.tsx") &&
      !full.endsWith(".d.mts") &&
      !full.endsWith(".d.cts")
    ) {
      out.push(full);
    }
  }
  return out;
}

function resolveSrcDir(cwd: string, src: string): string {
  const srcDir = path.resolve(cwd, src);
  let srcStat: fs.Stats;
  try {
    srcStat = fs.statSync(srcDir);
  } catch {
    return fail(`src dir not found: ${src}`);
  }
  if (!srcStat.isDirectory()) {
    return fail(`src dir not found: ${src}`);
  }
  return srcDir;
}

function loadCoverageData(
  cwd: string,
  coveragePath: string | null,
): LcovFile[] | null {
  if (coveragePath !== null) {
    const coverageAbs = path.resolve(cwd, coveragePath);
    if (!fs.existsSync(coverageAbs)) {
      return fail(`coverage file not found: ${coveragePath}`);
    }
    return parseLcov(fs.readFileSync(coverageAbs, "utf8"));
  }
  const defaultCoverage = path.join(cwd, "coverage", "lcov.info");
  if (fs.existsSync(defaultCoverage)) {
    return parseLcov(fs.readFileSync(defaultCoverage, "utf8"));
  }
  return null;
}

function buildOutputs(
  cwd: string,
  srcDir: string,
  profile: ComplexityProfile,
  lcovFiles: LcovFile[] | null,
): { records: CrapRecord[]; rows: HtmlRow[] } {
  const records: CrapRecord[] = [];
  const rows: HtmlRow[] = [];
  const files = collectTsFiles(srcDir).sort();
  for (const full of files) {
    const rel = normalize(path.relative(cwd, full));
    const sourceText = fs.readFileSync(full, "utf8");
    const fns = analyzeComplexity(rel, sourceText, profile);
    const lcovFile =
      lcovFiles === null ? null : matchLcovFile(lcovFiles, rel, cwd);
    for (const fn of fns) {
      const coverage =
        lcovFiles === null
          ? null
          : ((lcovFile === null
              ? undefined
              : functionCoverage(lcovFile, fn.line, fn.endLine)) ?? 0);
      const record = assembleRecord(fn, coverage);
      records.push(record);
      rows.push({
        ...record,
        endLine: fn.endLine,
        excerpt: sourceText
          .split("\n")
          .slice(fn.line - 1, fn.endLine)
          .join("\n"),
      });
    }
  }
  records.sort((a, b) =>
    a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line,
  );
  return { records, rows };
}

function requireCoverageForGate(
  lcovFiles: LcovFile[] | null,
  maxCrap: number | null,
): void {
  if (maxCrap !== null && lcovFiles === null) {
    fail("--max-crap requires coverage data");
  }
}

function hasCrapBreach(records: CrapRecord[], maxCrap: number | null): boolean {
  return (
    maxCrap !== null && records.some((r) => r.crap !== null && r.crap > maxCrap)
  );
}

async function run(argv: string[]): Promise<number> {
  const options = parseArgs(argv);

  const cwd = process.cwd();
  const srcDir = resolveSrcDir(cwd, options.src);
  const lcovFiles = loadCoverageData(cwd, options.coveragePath);
  const { records, rows } = buildOutputs(
    cwd,
    srcDir,
    options.profile,
    lcovFiles,
  );
  requireCoverageForGate(lcovFiles, options.maxCrap);
  const breach = hasCrapBreach(records, options.maxCrap);

  if (options.format === "html") {
    try {
      fs.writeFileSync(
        path.resolve(cwd, options.out ?? "crap-report.html"),
        renderHtml(rows),
      );
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  } else if (options.format === "json") {
    console.log(renderJson(records));
  } else {
    console.log(renderTable(records));
  }

  if (breach) {
    return 1;
  }
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  try {
    return await run(argv);
  } catch (err) {
    if (err instanceof HelpRequested) {
      return 0;
    }
    if (err instanceof ParseError) {
      console.error(err.message);
      return 2;
    }
    throw err;
  }
}

function isMainEntry(argv1: string | undefined): boolean {
  if (argv1 === undefined) {
    return false;
  }
  let resolved: string;
  try {
    resolved = fs.realpathSync(argv1);
  } catch {
    resolved = argv1;
  }
  return import.meta.url === pathToFileURL(resolved).href;
}
if (isMainEntry(process.argv[1])) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(
        `crap4ts: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exitCode = 2;
    },
  );
}

#!/usr/bin/env node
// @types/node is not a dependency and package.json is owned by another
// slice, so node imports are @ts-ignore'd to keep `npm run build` green.
declare const process: any;
// @ts-ignore: no node types in this repo
import * as fs from "node:fs";
// @ts-ignore: no node types in this repo
import * as path from "node:path";
// @ts-ignore: no node types in this repo
import { pathToFileURL } from "node:url";
import { analyzeComplexity } from "./complexity.js";
import type { ComplexityProfile } from "./complexity.js";
import { assembleRecord } from "./crap.js";
import type { CrapRecord } from "./crap.js";
import { functionCoverage, parseLcov } from "./lcov.js";
import type { LcovFile } from "./lcov.js";
import { renderJson, renderTable } from "./report.js";

type Format = "json" | "table";

interface Options {
  src: string;
  coveragePath: string | null;
  format: Format;
  maxCrap: number | null;
  profile: ComplexityProfile;
}

const USAGE = `usage: crap4ts [src] [--coverage <path>] [--format json|table] [--max-crap <n>] [--complexity-profile strict|balanced|permissive] [--help]`;

function fail(message: string): number {
  console.error(`crap4ts: ${message}`);
  return 2;
}

function parseArgs(argv: string[]): { options: Options } | { code: number } {
  const options: Options = {
    src: "src",
    coveragePath: null,
    format: "table",
    maxCrap: null,
    profile: "strict",
  };
  let positional: string | null = null;

  const takeValue = (
    flag: string,
    args: string[],
    i: number,
  ): { value: string; next: number } | { code: number } => {
    const eq = args[i].indexOf("=");
    if (eq !== -1) {
      return { value: args[i].slice(eq + 1), next: i };
    }
    if (i + 1 >= args.length) {
      return { code: fail(`${flag} requires a value`) };
    }
    return { value: args[i + 1], next: i + 1 };
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const name = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;
    if (name === "--help") {
      console.log(USAGE);
      return { code: 0 };
    } else if (name === "--coverage") {
      const taken = takeValue("--coverage", argv, i);
      if ("code" in taken) return taken;
      options.coveragePath = taken.value;
      i = taken.next;
    } else if (name === "--format") {
      const taken = takeValue("--format", argv, i);
      if ("code" in taken) return taken;
      if (taken.value !== "json" && taken.value !== "table") {
        return { code: fail(`invalid --format: ${taken.value}`) };
      }
      options.format = taken.value;
      i = taken.next;
    } else if (name === "--max-crap") {
      const taken = takeValue("--max-crap", argv, i);
      if ("code" in taken) return taken;
      const n = Number(taken.value);
      if (!Number.isFinite(n)) {
        return { code: fail(`invalid --max-crap: ${taken.value}`) };
      }
      options.maxCrap = n;
      i = taken.next;
    } else if (name === "--complexity-profile") {
      const taken = takeValue("--complexity-profile", argv, i);
      if ("code" in taken) return taken;
      if (
        taken.value !== "strict" &&
        taken.value !== "balanced" &&
        taken.value !== "permissive"
      ) {
        return {
          code: fail(`invalid --complexity-profile: ${taken.value}`),
        };
      }
      options.profile = taken.value;
      i = taken.next;
    } else if (arg.startsWith("--")) {
      return { code: fail(`unknown flag: ${arg}`) };
    } else if (positional === null) {
      positional = arg;
    } else {
      return { code: fail(`unexpected argument: ${arg}`) };
    }
  }

  if (positional !== null) {
    options.src = positional;
  }
  return { options };
}

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.isFile() && full.endsWith(".ts") && !full.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function normalize(p: string): string {
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

function findLcovFile(
  lcovFiles: LcovFile[],
  rel: string,
  cwd: string,
): LcovFile | null {
  for (const f of lcovFiles) {
    if (normalize(f.file) === rel) return f;
  }
  const analyzedAbs = toAbsolute(rel, cwd);
  for (const f of lcovFiles) {
    if (toAbsolute(f.file, cwd) === analyzedAbs) return f;
  }
  for (const f of lcovFiles) {
    if (suffixJoin(normalize(f.file), rel)) return f;
  }
  return null;
}

export async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (!("options" in parsed)) {
    return parsed.code;
  }
  const options = parsed.options;

  const cwd = process.cwd();
  const srcDir = path.resolve(cwd, options.src);
  let srcStat: fs.Stats;
  try {
    srcStat = fs.statSync(srcDir);
  } catch {
    return fail(`src dir not found: ${options.src}`);
  }
  if (!srcStat.isDirectory()) {
    return fail(`src dir not found: ${options.src}`);
  }

  let lcovFiles: LcovFile[] | null = null;
  if (options.coveragePath !== null) {
    const coverageAbs = path.resolve(cwd, options.coveragePath);
    if (!fs.existsSync(coverageAbs)) {
      return fail(`coverage file not found: ${options.coveragePath}`);
    }
    lcovFiles = parseLcov(fs.readFileSync(coverageAbs, "utf8"));
  } else {
    const defaultCoverage = path.join(cwd, "coverage", "lcov.info");
    if (fs.existsSync(defaultCoverage)) {
      lcovFiles = parseLcov(fs.readFileSync(defaultCoverage, "utf8"));
    }
  }

  if (options.maxCrap !== null && lcovFiles === null) {
    return fail("--max-crap requires coverage data");
  }

  const records: CrapRecord[] = [];
  const files = collectTsFiles(srcDir).sort();
  for (const full of files) {
    const rel = normalize(path.relative(cwd, full));
    const sourceText = fs.readFileSync(full, "utf8");
    const fns = analyzeComplexity(rel, sourceText, options.profile);
    const lcovFile =
      lcovFiles === null ? null : findLcovFile(lcovFiles, rel, cwd);
    for (const fn of fns) {
      const coverage =
        lcovFile === null
          ? null
          : functionCoverage(lcovFile, fn.line, fn.endLine);
      records.push(assembleRecord(fn, coverage));
    }
  }
  records.sort((a, b) =>
    a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line,
  );

  if (options.format === "json") {
    console.log(renderJson(records));
  } else {
    console.log(renderTable(records));
  }

  if (
    options.maxCrap !== null &&
    !records.some((r) => r.coverage !== null)
  ) {
    return fail("--max-crap requires coverage data");
  }

  if (
    options.maxCrap !== null &&
    records.some((r) => r.crap !== null && r.crap > options.maxCrap!)
  ) {
    return 1;
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(`crap4ts: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 2;
    },
  );
}

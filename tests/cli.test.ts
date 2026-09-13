import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../src/cli.js";
import { crapScore } from "../src/crap/index.js";

const { sourceReads } = vi.hoisted(() => ({ sourceReads: [] as string[] }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const readFileSync = (...args: unknown[]): unknown => {
    if (typeof args[0] === "string" && args[0].endsWith(".ts")) {
      sourceReads.push(args[0]);
    }
    return (actual.readFileSync as (...inner: unknown[]) => unknown)(...args);
  };
  return { ...actual, readFileSync };
});

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));
const projA = path.join(fixturesDir, "fixtures", "projA");
const projB = path.join(fixturesDir, "fixtures", "projB");

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let savedCwd: string;

beforeEach(() => {
  savedCwd = process.cwd();
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(savedCwd);
});

function stdout(): string {
  return logSpy.mock.calls.map((args: unknown[]) => String(args[0])).join("\n");
}

describe("cli", () => {
  it("json output parses and matches formula values", async () => {
    process.chdir(projA);
    const code = await main(["--format", "json"]);
    expect(code).toBe(0);
    const records = JSON.parse(stdout());
    expect(records).toHaveLength(2);
    const simple = records.find((r: { name: string }) => r.name === "simple");
    const risky = records.find((r: { name: string }) => r.name === "risky");
    expect(simple.coverage).toBe(1);
    expect(simple.crap).toBe(crapScore(simple.complexity, 1));
    expect(risky.coverage).toBeCloseTo(0.2, 10);
    expect(risky.crap).toBeCloseTo(crapScore(risky.complexity, 0.2), 10);
    expect(risky.crap).toBeGreaterThan(15);
  });

  it("null-coverage run without a coverage file exits 0 with nulls", async () => {
    process.chdir(projB);
    const code = await main(["--format", "json"]);
    expect(code).toBe(0);
    const records = JSON.parse(stdout());
    expect(records).toHaveLength(1);
    expect(records[0].coverage).toBeNull();
    expect(records[0].crap).toBeNull();
  });

  it("table output flags the high-CRAP row with !", async () => {
    process.chdir(projA);
    const code = await main([]);
    expect(code).toBe(0);
    const out = stdout();
    expect(out).toContain("!");
    const riskyRow = out.split("\n").find((line) => line.includes("risky"));
    expect(riskyRow).toBeDefined();
    expect(riskyRow!.startsWith("!")).toBe(true);
  });

  it("--max-crap triggers exit 1 after printing", async () => {
    process.chdir(projA);
    const code = await main(["--format", "json", "--max-crap", "15"]);
    expect(code).toBe(1);
    expect(JSON.parse(stdout())).toHaveLength(2);
  });

  it("--max-crap without coverage returns 2", async () => {
    process.chdir(projB);
    const code = await main(["--max-crap", "15"]);
    expect(code).toBe(2);
    expect(errorSpy).toHaveBeenCalled();
    expect(stdout()).toBe("");
  });

  it("explicit missing --coverage path returns 2", async () => {
    process.chdir(projA);
    const code = await main(["--coverage", "nope/lcov.info"]);
    expect(code).toBe(2);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("--help returns 0 and prints usage", async () => {
    process.chdir(projA);
    const code = await main(["--help"]);
    expect(code).toBe(0);
    expect(stdout().toLowerCase()).toContain("usage");
  });

  it("joins lcov records with an absolute SF path", async () => {
    process.chdir(projA);
    const raw = fs.readFileSync(
      path.join(projA, "coverage", "lcov.info"),
      "utf8",
    );
    const absSf = path.join(projA, "src", "a.ts");
    const tmp = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "crap4ts-")),
      "lcov.info",
    );
    fs.writeFileSync(tmp, raw.replace("SF:src/a.ts", `SF:${absSf}`));
    const code = await main(["--coverage", tmp, "--format", "json"]);
    expect(code).toBe(0);
    const records = JSON.parse(stdout());
    const simple = records.find((r: { name: string }) => r.name === "simple");
    expect(simple.coverage).toBe(1);
    expect(simple.crap).toBe(crapScore(simple.complexity, 1));
  });

  it("--max-crap with an absolute-SF lcov that breaches returns 1", async () => {
    process.chdir(projA);
    const raw = fs.readFileSync(
      path.join(projA, "coverage", "lcov.info"),
      "utf8",
    );
    const absSf = path.join(projA, "src", "a.ts");
    const tmp = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "crap4ts-")),
      "lcov.info",
    );
    fs.writeFileSync(tmp, raw.replace("SF:src/a.ts", `SF:${absSf}`));
    const code = await main([
      "--coverage",
      tmp,
      "--format",
      "json",
      "--max-crap",
      "15",
    ]);
    expect(code).toBe(1);
  });

  it("joins lcov SF from a different checkout root via segment suffix", async () => {
    process.chdir(projA);
    const raw = fs.readFileSync(
      path.join(projA, "coverage", "lcov.info"),
      "utf8",
    );
    const tmp = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "crap4ts-")),
      "lcov.info",
    );
    fs.writeFileSync(
      tmp,
      raw.replace("SF:src/a.ts", "SF:/builds/runner/other-root/src/a.ts"),
    );
    const code = await main(["--coverage", tmp, "--format", "json"]);
    expect(code).toBe(0);
    const records = JSON.parse(stdout());
    const simple = records.find((r: { name: string }) => r.name === "simple");
    expect(simple.coverage).toBe(1);
    expect(simple.crap).toBe(crapScore(simple.complexity, 1));
  });

  it("joins lcov SF with a partial-relative basename via segment suffix", async () => {
    process.chdir(projA);
    const raw = fs.readFileSync(
      path.join(projA, "coverage", "lcov.info"),
      "utf8",
    );
    const tmp = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "crap4ts-")),
      "lcov.info",
    );
    fs.writeFileSync(tmp, raw.replace("SF:src/a.ts", "SF:a.ts"));
    const code = await main(["--coverage", tmp, "--format", "json"]);
    expect(code).toBe(0);
    const records = JSON.parse(stdout());
    const simple = records.find((r: { name: string }) => r.name === "simple");
    expect(simple.coverage).toBe(1);
    expect(simple.crap).toBe(crapScore(simple.complexity, 1));
  });

  it("walk collects ts tsx mts cts and skips jsx and d files", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crap4ts-"));
    fs.mkdirSync(path.join(tmpRoot, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, "src", "Component.tsx"),
      "export const Widget = ({ show }: { show: boolean }) => {\n  if (!show) {\n    return null;\n  }\n  return show ? <div>yes</div> : <div>no</div>;\n};\n",
    );
    fs.writeFileSync(
      path.join(tmpRoot, "src", "util.mts"),
      "export function util() { return 1; }\n",
    );
    fs.writeFileSync(
      path.join(tmpRoot, "src", "legacy.cts"),
      "export function legacy() { return 2; }\n",
    );
    fs.writeFileSync(
      path.join(tmpRoot, "src", "keep.ts"),
      "export function keep() { return 3; }\n",
    );
    fs.writeFileSync(
      path.join(tmpRoot, "src", "skip.jsx"),
      "export function skipped() { return 4; }\n",
    );
    fs.writeFileSync(
      path.join(tmpRoot, "src", "types.d.tsx"),
      "export function declared() { return 5; }\n",
    );
    fs.writeFileSync(
      path.join(tmpRoot, "src", "extra.d.mts"),
      "export function extraDecl() { return 6; }",
    );
    fs.writeFileSync(
      path.join(tmpRoot, "src", "more.d.cts"),
      "export function moreDecl() { return 7; }",
    );
    process.chdir(tmpRoot);
    const code = await main(["src", "--format", "json"]);
    expect(code).toBe(0);
    const records = JSON.parse(stdout());
    const names = records.map((r: { name: string }) => r.name);
    expect(names).toContain("Widget");
    expect(names).toContain("util");
    expect(names).toContain("legacy");
    expect(names).toContain("keep");
    expect(names).not.toContain("skipped");
    expect(names).not.toContain("declared");
    expect(names).not.toContain("extraDecl");
    expect(names).not.toContain("moreDecl");
    const widget = records.find((r: { name: string }) => r.name === "Widget");
    expect(widget.file).toBe("src/Component.tsx");
    expect(widget.coverage).toBeNull();
    expect(widget.crap).toBeNull();
  });

  it("join coverage for tsx file via default lcov path", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crap4ts-"));
    fs.mkdirSync(path.join(tmpRoot, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, "src", "Component.tsx"),
      "export const Widget = ({ show }: { show: boolean }) => {\n  if (!show) {\n    return null;\n  }\n  return show ? <div>yes</div> : <div>no</div>;\n};\n",
    );
    fs.writeFileSync(
      path.join(tmpRoot, "src", "util.mts"),
      "export function util() { return 1; }\n",
    );
    fs.writeFileSync(
      path.join(tmpRoot, "src", "legacy.cts"),
      "export function legacy() { return 2; }\n",
    );
    fs.writeFileSync(
      path.join(tmpRoot, "src", "keep.ts"),
      "export function keep() { return 3; }\n",
    );
    fs.writeFileSync(
      path.join(tmpRoot, "src", "skip.jsx"),
      "export function skipped() { return 4; }\n",
    );
    fs.writeFileSync(
      path.join(tmpRoot, "src", "types.d.tsx"),
      "export function declared() { return 5; }\n",
    );
    fs.writeFileSync(
      path.join(tmpRoot, "src", "extra.d.mts"),
      "export function extraDecl() { return 6; }",
    );
    fs.writeFileSync(
      path.join(tmpRoot, "src", "more.d.cts"),
      "export function moreDecl() { return 7; }",
    );
    fs.mkdirSync(path.join(tmpRoot, "coverage"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, "coverage", "lcov.info"),
      "TN:\nSF:src/Component.tsx\nDA:1,1\nDA:2,1\nDA:3,1\nDA:4,1\nDA:5,1\nDA:6,1\nend_of_record\n",
    );
    process.chdir(tmpRoot);
    const code = await main(["src", "--format", "json"]);
    expect(code).toBe(0);
    const records = JSON.parse(stdout());
    const names = records.map((r: { name: string }) => r.name);
    expect(names).not.toContain("extraDecl");
    expect(names).not.toContain("moreDecl");
    const widget = records.find((r: { name: string }) => r.name === "Widget");
    expect(widget.coverage).toBe(1);
    expect(widget.crap).toBe(crapScore(widget.complexity, 1));
    const util = records.find((r: { name: string }) => r.name === "util");
    expect(util.coverage).toBe(0);
    expect(util.crap).toBe(crapScore(util.complexity, 0));
  });

  it("coverage file that matches no analyzed file scores coverage 0", async () => {
    process.chdir(projA);
    const raw = fs.readFileSync(
      path.join(projA, "coverage", "lcov.info"),
      "utf8",
    );
    const tmp = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "crap4ts-")),
      "lcov.info",
    );
    fs.writeFileSync(tmp, raw.replace("SF:src/a.ts", "SF:src/nope.ts"));
    const code = await main(["--coverage", tmp, "--format", "json"]);
    expect(code).toBe(0);
    const records = JSON.parse(stdout());
    expect(records).toHaveLength(2);
    for (const r of records as {
      complexity: number;
      coverage: number;
      crap: number;
    }[]) {
      expect(r.coverage).toBe(0);
      expect(r.crap).toBe(crapScore(r.complexity, 0));
    }
  });

  it("matched file with no DA data for the function span scores coverage 0", async () => {
    process.chdir(projA);
    const tmp = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "crap4ts-")),
      "lcov.info",
    );
    fs.writeFileSync(tmp, "TN:\nSF:src/a.ts\nDA:100,1\nend_of_record\n");
    const code = await main(["--coverage", tmp, "--format", "json"]);
    expect(code).toBe(0);
    const records = JSON.parse(stdout());
    expect(records).toHaveLength(2);
    for (const r of records as {
      complexity: number;
      coverage: number;
      crap: number;
    }[]) {
      expect(r.coverage).toBe(0);
      expect(r.crap).toBe(crapScore(r.complexity, 0));
    }
  });

  it("--max-crap breaches on a tmp project whose coverage matches nothing", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crap4ts-"));
    fs.mkdirSync(path.join(tmpRoot, "src"), { recursive: true });
    fs.copyFileSync(
      path.join(projA, "src", "a.ts"),
      path.join(tmpRoot, "src", "a.ts"),
    );
    fs.mkdirSync(path.join(tmpRoot, "coverage"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, "coverage", "lcov.info"),
      "TN:\nSF:src/nope.ts\nDA:1,1\nend_of_record\n",
    );
    process.chdir(tmpRoot);
    const code = await main(["src", "--format", "json", "--max-crap", "15"]);
    expect(code).toBe(1);
    const records = JSON.parse(stdout());
    const risky = records.find((r: { name: string }) => r.name === "risky");
    expect(risky.coverage).toBe(0);
    expect(risky.crap).toBeGreaterThan(15);
  });

  it("tmp project with no coverage file keeps nulls and --max-crap exits 2", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crap4ts-"));
    fs.mkdirSync(path.join(tmpRoot, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, "src", "a.ts"),
      "export function tiny(x: number): number {\n  return x * 2;\n}\n",
    );
    process.chdir(tmpRoot);
    const code = await main(["src", "--format", "json"]);
    expect(code).toBe(0);
    const records = JSON.parse(stdout());
    expect(records).toHaveLength(1);
    expect(records[0].coverage).toBeNull();
    expect(records[0].crap).toBeNull();
    const gate = await main(["src", "--max-crap", "15"]);
    expect(gate).toBe(2);
  });

  it("--max-crap with a coverage file that matches nothing returns 1", async () => {
    process.chdir(projA);
    const raw = fs.readFileSync(
      path.join(projA, "coverage", "lcov.info"),
      "utf8",
    );
    const tmp = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "crap4ts-")),
      "lcov.info",
    );
    fs.writeFileSync(tmp, raw.replace("SF:src/a.ts", "SF:src/nope.ts"));
    const code = await main([
      "--coverage",
      tmp,
      "--format",
      "json",
      "--max-crap",
      "15",
    ]);
    expect(code).toBe(1);
    const records = JSON.parse(stdout());
    expect(records).toHaveLength(2);
    for (const r of records as { coverage: number }[]) {
      expect(r.coverage).toBe(0);
    }
    const risky = records.find((r: { name: string }) => r.name === "risky");
    expect(risky.crap).toBeGreaterThan(15);
  });

  it("invalid --complexity-profile returns 2", async () => {
    process.chdir(projA);
    const code = await main(["--complexity-profile", "bogus"]);
    expect(code).toBe(2);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("missing src dir returns 2", async () => {
    process.chdir(projA);
    const code = await main(["nope-src-dir"]);
    expect(code).toBe(2);
    expect(errorSpy).toHaveBeenCalled();
    expect(stdout()).toBe("");
  });

  it("src path that is a file returns 2", async () => {
    process.chdir(projA);
    const code = await main([path.join("src", "a.ts")]);
    expect(code).toBe(2);
    expect(errorSpy).toHaveBeenCalled();
    expect(stdout()).toBe("");
  });

  it("html format with --out writes a file and leaves stdout empty", async () => {
    process.chdir(projA);
    const tmpFile = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "crap4ts-")),
      "report.html",
    );
    const code = await main(["--format", "html", "--out", tmpFile]);
    expect(code).toBe(0);
    const html = fs.readFileSync(tmpFile, "utf8");
    expect(html).toContain("simple");
    expect(html).toContain("risky");
    expect(html).toContain("<table");
    expect(stdout()).toBe("");
  });

  it("html format defaults to crap-report.html in the cwd", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crap4ts-"));
    fs.cpSync(projA, tmpRoot, { recursive: true });
    process.chdir(tmpRoot);
    const code = await main(["--format", "html"]);
    expect(code).toBe(0);
    const html = fs.readFileSync(
      path.join(tmpRoot, "crap-report.html"),
      "utf8",
    );
    expect(html).toContain("<table");
    expect(stdout()).toBe("");
  });

  it("html format with a breach exits 1 and still writes the file", async () => {
    process.chdir(projA);
    const tmpFile = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "crap4ts-")),
      "report.html",
    );
    const code = await main([
      "--format",
      "html",
      "--out",
      tmpFile,
      "--max-crap",
      "15",
    ]);
    expect(code).toBe(1);
    expect(fs.readFileSync(tmpFile, "utf8")).toContain("<table");
  });

  it("html mode reads each source file exactly once", async () => {
    process.chdir(projA);
    const tmpFile = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "crap4ts-")),
      "report.html",
    );
    sourceReads.length = 0;
    const code = await main(["--format", "html", "--out", tmpFile]);
    expect(code).toBe(0);
    const counts = new Map<string, number>();
    for (const file of sourceReads) {
      counts.set(file, (counts.get(file) ?? 0) + 1);
    }
    expect(counts.size).toBeGreaterThan(0);
    for (const count of counts.values()) {
      expect(count).toBe(1);
    }
  });

  it("invalid --format returns 2", async () => {
    process.chdir(projA);
    const code = await main(["--format", "xml"]);
    expect(code).toBe(2);
    expect(errorSpy).toHaveBeenCalled();
    expect(stdout()).toBe("");
  });

  it("--help mentions html and --out", async () => {
    process.chdir(projA);
    const code = await main(["--help"]);
    expect(code).toBe(0);
    expect(stdout()).toContain("html");
    expect(stdout()).toContain("--out");
  });

  it("html write failure exits 2 with a crap4ts stderr line", async () => {
    process.chdir(projA);
    const badOut = path.join("nope-missing-dir", "r.html");
    expect(fs.existsSync(path.join(projA, "nope-missing-dir", "r.html"))).toBe(
      false,
    );
    const code = await main(["--format", "html", "--out", badOut]);
    expect(code).toBe(2);
    expect(fs.existsSync(path.join(projA, "nope-missing-dir", "r.html"))).toBe(
      false,
    );
    expect(stdout()).toBe("");
    const stderr = errorSpy.mock.calls
      .map((args: unknown[]) => String(args[0]))
      .join("\n");
    expect(stderr).toContain("crap4ts:");
  });
});

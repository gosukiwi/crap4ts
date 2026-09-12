import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../src/cli.js";
import { crapScore } from "../src/crap/index.js";

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
  return logSpy.mock.calls.map((args) => String(args[0])).join("\n");
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
    fs.writeFileSync(path.join(tmpRoot, "src", "Component.tsx"), "export const Widget = ({ show }: { show: boolean }) => {\n  if (!show) {\n    return null;\n  }\n  return show ? <div>yes</div> : <div>no</div>;\n};\n");
    fs.writeFileSync(path.join(tmpRoot, "src", "util.mts"), "export function util() { return 1; }\n");
    fs.writeFileSync(path.join(tmpRoot, "src", "legacy.cts"), "export function legacy() { return 2; }\n");
    fs.writeFileSync(path.join(tmpRoot, "src", "keep.ts"), "export function keep() { return 3; }\n");
    fs.writeFileSync(path.join(tmpRoot, "src", "skip.jsx"), "export function skipped() { return 4; }\n");
    fs.writeFileSync(path.join(tmpRoot, "src", "types.d.tsx"), "export function declared() { return 5; }\n");
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
    const widget = records.find((r: { name: string }) => r.name === "Widget");
    expect(widget.file).toBe("src/Component.tsx");
    expect(widget.coverage).toBeNull();
    expect(widget.crap).toBeNull();
  });

  it("join coverage for tsx file via default lcov path", async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crap4ts-"));
    fs.mkdirSync(path.join(tmpRoot, "src"), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, "src", "Component.tsx"), "export const Widget = ({ show }: { show: boolean }) => {\n  if (!show) {\n    return null;\n  }\n  return show ? <div>yes</div> : <div>no</div>;\n};\n");
    fs.writeFileSync(path.join(tmpRoot, "src", "util.mts"), "export function util() { return 1; }\n");
    fs.writeFileSync(path.join(tmpRoot, "src", "legacy.cts"), "export function legacy() { return 2; }\n");
    fs.writeFileSync(path.join(tmpRoot, "src", "keep.ts"), "export function keep() { return 3; }\n");
    fs.writeFileSync(path.join(tmpRoot, "src", "skip.jsx"), "export function skipped() { return 4; }\n");
    fs.writeFileSync(path.join(tmpRoot, "src", "types.d.tsx"), "export function declared() { return 5; }\n");
    fs.mkdirSync(path.join(tmpRoot, "coverage"), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, "coverage", "lcov.info"), "TN:\nSF:src/Component.tsx\nDA:1,1\nDA:2,1\nDA:3,1\nDA:4,1\nDA:5,1\nDA:6,1\nend_of_record\n");
    process.chdir(tmpRoot);
    const code = await main(["src", "--format", "json"]);
    expect(code).toBe(0);
    const records = JSON.parse(stdout());
    const widget = records.find((r: { name: string }) => r.name === "Widget");
    expect(widget.coverage).toBe(1);
    expect(widget.crap).toBe(crapScore(widget.complexity, 1));
    const util = records.find((r: { name: string }) => r.name === "util");
    expect(util.coverage).toBeNull();
    expect(util.crap).toBeNull();
  });

  it("--max-crap with a coverage file that matches nothing returns 2", async () => {
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
    const code = await main(["--coverage", tmp, "--max-crap", "15"]);
    expect(code).toBe(2);
    expect(
      errorSpy.mock.calls.map((args) => String(args[0])).join("\n"),
    ).toContain("--max-crap requires coverage data");
  });
});

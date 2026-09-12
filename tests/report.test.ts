import { describe, expect, it } from "vitest";
import type { CrapRecord } from "../src/crap/index.js";
import { renderJson, renderTable } from "../src/report.js";

const records: CrapRecord[] = [
  {
    file: "src/a.ts",
    line: 1,
    col: 1,
    name: "simple",
    complexity: 1,
    coverage: 1,
    crap: 1,
  },
  {
    file: "src/a.ts",
    line: 5,
    col: 1,
    name: "risky",
    complexity: 7,
    coverage: null,
    crap: null,
  },
  {
    file: "src/b.ts",
    line: 2,
    col: 1,
    name: "hot",
    complexity: 6,
    coverage: 0.5,
    crap: 30,
  },
];

describe("renderJson", () => {
  it("round-trips back to the input records", () => {
    expect(JSON.parse(renderJson(records))).toEqual(records);
  });
});

describe("renderTable", () => {
  it("includes the header columns", () => {
    const table = renderTable(records);
    expect(table).toContain("FILE");
    expect(table).toContain("LINE");
    expect(table).toContain("NAME");
    expect(table).toContain("COMPLEXITY");
    expect(table).toContain("COVERAGE");
    expect(table).toContain("CRAP");
  });

  it("renders a null-coverage row with dashes", () => {
    const row = renderTable(records)
      .split("\n")
      .find((line) => line.includes("risky"));
    expect(row).toBeDefined();
    expect(row).toContain("-");
  });

  it("marks a crap-30 row with ! and two decimals", () => {
    const row = renderTable(records)
      .split("\n")
      .find((line) => line.includes("hot"));
    expect(row).toBeDefined();
    expect(row!.startsWith("!")).toBe(true);
    expect(row).toContain("30.00");
  });

  it("leads a crap-1 row with a space", () => {
    const row = renderTable(records)
      .split("\n")
      .find((line) => line.includes("simple"));
    expect(row).toBeDefined();
    expect(row!.startsWith(" ")).toBe(true);
    expect(row).toContain("1.00");
  });
});

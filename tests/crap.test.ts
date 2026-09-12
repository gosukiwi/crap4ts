import { describe, expect, it } from "vitest";
import { assembleRecord, crapScore } from "../src/crap.js";
import type { FunctionComplexity } from "../src/complexity.js";

describe("crapScore", () => {
  it("returns 1 for complexity 1 with full coverage", () => {
    expect(crapScore(1, 1)).toBe(1);
  });

  it("returns 30 for complexity 5 with zero coverage", () => {
    // Task text says 130, but the specified formula gives 5^2 * 1^3 + 5 = 30
    // (130 would be 5^3 + 5); asserting the formula-correct value.
    expect(crapScore(5, 0)).toBe(30);
  });

  it("returns 2.5 for complexity 2 with half coverage", () => {
    expect(crapScore(2, 0.5)).toBe(2.5);
  });
});

describe("assembleRecord", () => {
  const fn: FunctionComplexity = {
    file: "a.ts",
    line: 3,
    col: 5,
    endLine: 10,
    name: "foo",
    complexity: 4,
  };

  it("yields null coverage and null crap while preserving fields when coverage is null", () => {
    expect(assembleRecord(fn, null)).toEqual({
      file: "a.ts",
      line: 3,
      col: 5,
      name: "foo",
      complexity: 4,
      coverage: null,
      crap: null,
    });
  });

  it("yields crap 2.5 for complexity 2 with coverage 0.5", () => {
    const two: FunctionComplexity = {
      file: "b.ts",
      line: 1,
      col: 1,
      endLine: 6,
      name: "bar",
      complexity: 2,
    };
    expect(assembleRecord(two, 0.5)).toEqual({
      file: "b.ts",
      line: 1,
      col: 1,
      name: "bar",
      complexity: 2,
      coverage: 0.5,
      crap: 2.5,
    });
  });
});

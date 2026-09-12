import { describe, expect, it } from "vitest";
import { functionCoverage, parseLcov } from "../src/lcov.js";

describe("parseLcov", () => {
  it("parses two files into two LcovFiles", () => {
    const trace = `TN:
SF:a.ts
FN:1,foo
FNDA:1,foo
DA:1,1
end_of_record
TN:
SF:b.ts
FN:2,bar
FNDA:0,bar
DA:2,0
end_of_record
`;
    const files = parseLcov(trace);
    expect(files).toHaveLength(2);
    expect(files[0].file).toBe("a.ts");
    expect(files[1].file).toBe("b.ts");
  });

  it("maps FNDA hit/miss, including an FNDA hit on an undeclared name", () => {
    const trace = `TN:
SF:a.ts
FN:1,called
FN:5,missed
FNDA:3,called
FNDA:0,missed
FNDA:2,ghost
DA:1,1
end_of_record
`;
    const [rec] = parseLcov(trace);
    const byName = new Map(rec.functions.map((f) => [f.name, f]));
    expect(byName.get("called")).toMatchObject({
      file: "a.ts",
      name: "called",
      line: 1,
      hit: true,
    });
    expect(byName.get("missed")).toMatchObject({ hit: false, line: 5 });
    expect(byName.get("ghost")).toMatchObject({
      file: "a.ts",
      name: "ghost",
      line: 0,
      hit: true,
    });
  });

  it("tolerates DA checksum fields and ignores BRDA lines", () => {
    const trace = `TN:
SF:a.ts
FN:1,f
FNDA:1,f
DA:1,2,abc123
DA:2,0,def456
BRDA:1,0,0,1
BRDA:2,0,1,-
end_of_record
`;
    const [rec] = parseLcov(trace);
    expect(rec.lines).toEqual([
      { line: 1, hits: 2 },
      { line: 2, hits: 0 },
    ]);
  });

  it("splits on end_of_record and ignores unknown prefixes without throwing", () => {
    const trace = `TN:
SF:a.ts
XX:whatever
FN:1,f
FNDA:1,f
DA:1,1
end_of_record
TN:
SF:b.ts
DA:1,1
end_of_record
`;
    const files = parseLcov(trace);
    expect(files).toHaveLength(2);
    expect(files[0].lines).toEqual([{ line: 1, hits: 1 }]);
    expect(files[1].file).toBe("b.ts");
  });

  it("merges same-file repeat blocks", () => {
    const trace = `TN:
SF:a.ts
FN:1,f
FNDA:1,f
DA:1,1
end_of_record
TN:
SF:a.ts
FN:9,g
FNDA:0,g
DA:9,0
end_of_record
`;
    const files = parseLcov(trace);
    expect(files).toHaveLength(1);
    expect(files[0].file).toBe("a.ts");
    expect(files[0].functions.map((f) => f.name)).toEqual(["f", "g"]);
    expect(files[0].lines).toEqual([
      { line: 1, hits: 1 },
      { line: 9, hits: 0 },
    ]);
  });

  it("functionCoverage returns exact fractions and null for spans with no DA lines", () => {
    const rec = {
      file: "a.ts",
      functions: [],
      lines: [
        { line: 1, hits: 1 },
        { line: 2, hits: 1 },
        { line: 3, hits: 0 },
        { line: 4, hits: 0 },
      ],
    };
    expect(functionCoverage(rec, 1, 4)).toBe(0.5);
    expect(functionCoverage(rec, 1, 2)).toBe(1);
    expect(functionCoverage(rec, 3, 4)).toBe(0);
    expect(functionCoverage(rec, 10, 20)).toBeNull();
  });
});

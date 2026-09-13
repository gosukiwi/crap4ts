import { describe, expect, it } from "vitest";
import type { CrapRecord } from "../src/crap/index.js";
import type { HtmlRow } from "../src/report.js";
import { renderHtml, renderJson, renderTable } from "../src/report.js";

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

const htmlRows: HtmlRow[] = [
  {
    file: "src/a.ts",
    line: 1,
    col: 1,
    name: "simple",
    complexity: 1,
    coverage: 1,
    crap: 1,
    endLine: 3,
    excerpt: "function simple() {}",
  },
  {
    file: "src/a.ts",
    line: 5,
    col: 1,
    name: "risky",
    complexity: 7,
    coverage: null,
    crap: null,
    endLine: 8,
    excerpt: "function risky() {}",
  },
  {
    file: "src/b.ts",
    line: 2,
    col: 1,
    name: "hot",
    complexity: 6,
    coverage: 0.5,
    crap: 30,
    endLine: 9,
    excerpt: "function hot() {}",
  },
];

describe("renderHtml", () => {
  it("sorts crap 30 before crap 1 before null", () => {
    const html = renderHtml(htmlRows);
    expect(html.indexOf("hot")).toBeLessThan(html.indexOf("simple"));
    expect(html.indexOf("simple")).toBeLessThan(html.indexOf("risky"));
  });

  it("renders one row per input record", () => {
    const html = renderHtml(htmlRows);
    expect(html).toContain("simple");
    expect(html).toContain("risky");
    expect(html).toContain("hot");
  });

  it("flags only the crap-30 row with the high-crap class", () => {
    const html = renderHtml(htmlRows);
    const flagged = html.match(/class="[^"]*high-crap[^"]*"/g) ?? [];
    expect(flagged).toHaveLength(1);
    const segments = html.split("<tr");
    const hotSegment = segments.find((segment) => segment.includes("hot"));
    expect(hotSegment).toContain("high-crap");
  });

  it("escapes markup in names", () => {
    const evil: HtmlRow = {
      file: "src/a.ts",
      line: 10,
      col: 1,
      name: `<b>evil&"x"`,
      complexity: 2,
      coverage: 1,
      crap: 2,
      endLine: 12,
      excerpt: "function evil() {}",
    };
    const html = renderHtml([...htmlRows, evil]);
    expect(html).toContain(`&lt;b&gt;evil&amp;&quot;x&quot;`);
    expect(html).not.toContain(`<b>evil`);
  });

  it("renders an expander with excerpt and file:line-endLine header", () => {
    const html = renderHtml(htmlRows);
    expect(html).toContain("<details");
    expect(html).toContain("function simple() {}");
    expect(html).toContain("src/a.ts:1-3");
  });

  it("references no external assets", () => {
    const html = renderHtml(htmlRows);
    expect(html).not.toContain(`src="http`);
    expect(html).not.toContain(`href="http`);
    expect(html).not.toContain("<link");
    expect(html).not.toContain("<script src");
  });

  it("renders a search box filtering by function or file", () => {
    const html = renderHtml(htmlRows);
    expect(html).toContain(`id="crap-search"`);
    expect(html).toContain(`type="search"`);
    expect(html).toContain(`placeholder="Filter by function or file"`);
  });

  it("tags all six header cells with data-sort keys", () => {
    const html = renderHtml(htmlRows);
    for (const key of [
      "file",
      "line",
      "name",
      "complexity",
      "coverage",
      "crap",
    ]) {
      expect(html).toContain(`data-sort="${key}"`);
    }
    expect(html.match(/<th\b/g) ?? []).toHaveLength(6);
  });

  it("tags body rows with data-name and data-file", () => {
    const html = renderHtml(htmlRows);
    expect(html).toContain(`data-name="hot"`);
    expect(html).toContain(`data-file="src/b.ts"`);
    expect(html).toContain(`data-name="simple"`);
    expect(html).toContain(`data-file="src/a.ts"`);
  });

  it("includes exactly one inline script with search and sort wiring", () => {
    const html = renderHtml(htmlRows);
    expect(html.match(/<script/g) ?? []).toHaveLength(1);
    expect(html).not.toContain("<script src");
    const script = html.slice(
      html.indexOf("<script"),
      html.indexOf("</script>"),
    );
    expect(script).toContain("crap-search");
    expect(script).toContain("data-sort");
    expect(script).toContain("addEventListener");
  });

  it("keeps the table header sticky", () => {
    const html = renderHtml(htmlRows);
    expect(html).toContain("position: sticky");
    expect(html).toContain("top: 0");
  });
});

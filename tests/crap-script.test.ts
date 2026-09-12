import { describe, expect, it } from "vitest";
import pkg from "../package.json" with { type: "json" };

const manifest = pkg as {
  scripts?: Record<string, string>;
};

describe("crap script", () => {
  it("defines scripts.crap covering coverage, build, and gate", () => {
    const script = manifest.scripts?.crap;
    expect(script).toBeDefined();
    expect(script).toContain("vitest run --coverage");
    expect(script).toContain("--coverage.provider=v8");
    expect(script).toContain("--coverage.reporter=lcov");
    expect(script).toContain("dist/cli.js src");
    expect(script).toContain("--coverage ./coverage/lcov.info");
    expect(script).toContain("--max-crap 15");
  });
});

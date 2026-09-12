import { describe, expect, it } from "vitest";
import pkg from "../package.json";

describe("smoke", () => {
  it("runner works and bin resolves to dist/cli.js", () => {
    expect(true).toBe(true);
    expect((pkg as { bin: { crap4ts: string } }).bin.crap4ts).toBe(
      "dist/cli.js",
    );
  });
});

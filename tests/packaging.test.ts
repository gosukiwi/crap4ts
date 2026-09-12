import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);

describe("packaging", () => {
  it("has a publishable name, semver version, and bin target", () => {
    expect(pkg.name).toBe("crap4ts");
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    expect(pkg.bin?.crap4ts).toBe("dist/cli.js");
    expect(fs.existsSync(path.join(root, pkg.bin.crap4ts))).toBe(true);
  });

  it("ships compiled output plus README, not source", () => {
    expect(pkg.files).toContain("dist/");
    expect(pkg.files).toContain("README.md");
    for (const entry of pkg.files as string[]) {
      expect(entry).not.toMatch(/src\//);
      expect(entry).not.toMatch(/tests\//);
    }
  });

  it("npm pack lists the runnable entry and no src or tests files", () => {
    const output = execSync("npm pack --dry-run 2>&1", {
      cwd: root,
      encoding: "utf8",
    });
    expect(output).toContain("dist/cli.js");
    expect(output).not.toMatch(/src\//);
    expect(output).not.toMatch(/tests\//);
  });
});

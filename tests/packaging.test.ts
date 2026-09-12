import { beforeAll, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "../package.json" with { type: "json" };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = pkg as {
  name: string;
  version: string;
  bin?: Record<string, string>;
  files?: string[];
};

describe("packaging", () => {
  beforeAll(() => {
    if (!fs.existsSync(path.join(root, "dist", "cli.js"))) {
      execSync("npm run build", { cwd: root, stdio: "inherit" });
    }
  });

  it("has a publishable name, semver version, and bin target", () => {
    expect(manifest.name).toBe("crap4ts");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    expect(manifest.bin?.crap4ts).toBe("dist/cli.js");
    expect(fs.existsSync(path.join(root, manifest.bin?.crap4ts ?? ""))).toBe(
      true,
    );
  });

  it("ships compiled output plus README, not source", () => {
    expect(manifest.files).toContain("dist/");
    expect(manifest.files).toContain("README.md");
    for (const entry of manifest.files as string[]) {
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

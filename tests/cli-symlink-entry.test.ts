import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "dist", "cli.js");

describe("cli symlink entry", () => {
  it("runs through a node_modules/.bin-style symlink", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crap4ts-"));
    fs.mkdirSync(path.join(tmpRoot, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, "src", "tiny.ts"),
      "export function tiny(x: number): number {\n  return x * 2;\n}\n",
    );
    const binDir = path.join(tmpRoot, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const link = path.join(binDir, "crap4ts");
    fs.symlinkSync(entry, link);
    const result = spawnSync(process.execPath, [link, "src"], {
      cwd: tmpRoot,
      encoding: "utf8",
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect((result.stdout ?? "").trim().length).toBeGreaterThan(0);
    expect(result.stdout).toContain("tiny");
  }, 30000);
});

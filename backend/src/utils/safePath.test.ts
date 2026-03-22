import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { resolvePathWithinBase } from "./safePath";

describe("resolvePathWithinBase", () => {
  const baseDir = resolve("/tmp/docs-base");

  test("resolves nested relative paths inside the base directory", () => {
    expect(resolvePathWithinBase(baseDir, "/assets/app.js")).toBe(
      resolve(baseDir, "assets/app.js"),
    );
  });

  test("keeps base directory requests inside the base directory", () => {
    expect(resolvePathWithinBase(baseDir, "/")).toBe(baseDir);
  });

  test("rejects traversal outside the base directory", () => {
    expect(resolvePathWithinBase(baseDir, "/../../etc/passwd")).toBeNull();
  });

  test("contains repeated leading slashes within the base directory", () => {
    expect(resolvePathWithinBase(baseDir, "//etc/passwd")).toBe(
      resolve(baseDir, "etc/passwd"),
    );
  });
});

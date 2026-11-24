import { describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveStaticFile, resolveStaticPath } from "./staticFile";

describe("resolveStaticPath", () => {
  test("resolves request paths inside the static root", () => {
    expect(resolveStaticPath("/app/public", "/assets/main.js")).toBe(
      "/app/public/assets/main.js",
    );
  });

  test("allows the static root itself", () => {
    expect(resolveStaticPath("/app/public", "/")).toBe("/app/public");
  });

  test("allows path components that start with two dots", () => {
    expect(resolveStaticPath("/app/public", "/..assets/..theme.css")).toBe(
      "/app/public/..assets/..theme.css",
    );
  });

  test("blocks parent-directory traversal", () => {
    expect(resolveStaticPath("/app/public", "/../../etc/passwd")).toBeNull();
  });

  test("blocks traversal without a leading slash", () => {
    expect(resolveStaticPath("/app/public", "../../etc/passwd")).toBeNull();
  });

  test("normalizes dot segments that stay inside the root", () => {
    expect(resolveStaticPath("/app/public", "/assets/../index.html")).toBe(
      "/app/public/index.html",
    );
  });
});

describe("resolveStaticFile", () => {
  test("only accepts files canonically contained by the static root", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "nexusgate-static-"));
    try {
      const root = join(tempDir, "public");
      const sibling = join(tempDir, "public-sibling");
      await mkdir(root);
      await mkdir(join(root, "page"));
      await mkdir(sibling);
      const canonicalRoot = await realpath(root);
      const inTreeFile = join(canonicalRoot, "in-tree.txt");
      await writeFile(inTreeFile, "static test fixture");
      await writeFile(join(sibling, "other.txt"), "sibling test fixture");
      await symlink(inTreeFile, join(root, "alias.txt"));
      await symlink(sibling, join(root, "sibling"), "dir");
      await symlink(join(sibling, "missing.txt"), join(root, "broken.txt"));

      expect(await resolveStaticFile(canonicalRoot, "/alias.txt")).toBe(
        inTreeFile,
      );
      expect(
        await resolveStaticFile(canonicalRoot, "/page/missing.txt"),
      ).toBeUndefined();
      expect(
        await resolveStaticFile(canonicalRoot, "/sibling/other.txt"),
      ).toBeNull();
      expect(
        await resolveStaticFile(canonicalRoot, "/sibling/missing.txt"),
      ).toBeNull();
      expect(await resolveStaticFile(canonicalRoot, "/broken.txt")).toBeNull();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

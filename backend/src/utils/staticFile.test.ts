import { describe, expect, test } from "bun:test";
import { resolveStaticPath } from "./staticFile";

describe("resolveStaticPath", () => {
  test("resolves request paths inside the static root", () => {
    expect(resolveStaticPath("/app/public", "/assets/main.js")).toBe(
      "/app/public/assets/main.js",
    );
  });

  test("allows the static root itself", () => {
    expect(resolveStaticPath("/app/public", "/")).toBe("/app/public");
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

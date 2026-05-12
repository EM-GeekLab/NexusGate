import { resolve } from "node:path";

export function resolvePathWithinBase(
  baseDir: string,
  requestPath: string,
): string | null {
  const normalizedRequestPath = requestPath.replaceAll("\\", "/");
  const pathSegments = normalizedRequestPath
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);

  if (pathSegments.includes("..")) {
    return null;
  }

  return resolve(baseDir, ...pathSegments);
}

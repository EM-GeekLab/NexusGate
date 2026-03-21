import { isAbsolute, relative, resolve } from "node:path";

export function resolveStaticPath(
  rootDir: string,
  requestPath: string,
): string | null {
  const resolvedRoot = resolve(rootDir);
  const normalizedRequestPath = requestPath.replace(/^\/+/u, "");
  const resolvedPath = resolve(resolvedRoot, normalizedRequestPath);
  const relativePath = relative(resolvedRoot, resolvedPath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return null;
  }

  return resolvedPath;
}

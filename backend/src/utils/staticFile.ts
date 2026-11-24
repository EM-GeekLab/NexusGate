import { lstat, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

function isWithinRoot(root: string, path: string): boolean {
  const relativePath = relative(root, path);
  return (
    relativePath !== ".." &&
    !relativePath.startsWith(`..${sep}`) &&
    !isAbsolute(relativePath)
  );
}

export function resolveStaticPath(
  rootDir: string,
  requestPath: string,
): string | null {
  const resolvedRoot = resolve(rootDir);
  const normalizedRequestPath = requestPath.replace(/^\/+/u, "");
  const resolvedPath = resolve(resolvedRoot, normalizedRequestPath);
  return isWithinRoot(resolvedRoot, resolvedPath) ? resolvedPath : null;
}

// The root is canonicalized at startup and the deployment tree is trusted not
// to change during lookup. Return null for rejected paths, undefined for misses.
export async function resolveStaticFile(
  canonicalRoot: string,
  requestPath: string,
): Promise<string | null | undefined> {
  const path = resolveStaticPath(canonicalRoot, requestPath);
  if (path === null) {
    return null;
  }

  let candidate = path;
  while (candidate !== canonicalRoot) {
    let canonicalPath: string;
    try {
      canonicalPath = await realpath(candidate);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        return null;
      }

      // A missing child of an out-of-root directory is still rejected. Walk
      // back to an existing ancestor, but reject broken links on the way.
      if (await lstat(candidate).catch(() => null)) {
        return null;
      }
      candidate = dirname(candidate);
      continue;
    }

    if (!isWithinRoot(canonicalRoot, canonicalPath)) {
      return null;
    }
    return candidate === path && (await stat(canonicalPath)).isFile()
      ? canonicalPath
      : undefined;
  }
  return undefined;
}

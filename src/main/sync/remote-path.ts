import path from "node:path";
import posixPath from "node:path/posix";
import { toPosixPath } from "./ignore";

export function localToRemotePath(localRoot: string, remoteRoot: string, localFilePath: string): string {
  const relativePath = path.relative(path.resolve(localRoot), path.resolve(localFilePath));

  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`File is outside the configured local root: ${localFilePath}`);
  }

  return posixPath.join(normalizeRemoteRoot(remoteRoot), toPosixPath(relativePath));
}

export function normalizeRemoteRoot(remoteRoot: string): string {
  const normalized = remoteRoot.replace(/\\/g, "/").replace(/\/+$/, "");

  if (!normalized) {
    return "/";
  }

  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

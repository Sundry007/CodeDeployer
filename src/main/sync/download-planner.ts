import { promises as fs } from "node:fs";
import path from "node:path";
import posixPath from "node:path/posix";
import type { DownloadDiff, DownloadPreview, DownloadResult, LocalFileInfo, ProfileSecretInput, SyncProfile } from "../../shared/types";
import { createIgnoreMatcher, toPosixPath } from "./ignore";
import { downloadFileAtomic, listRemoteFiles } from "./transfer-client";

const MODIFIED_TIME_TOLERANCE_MS = 2000;

export async function scanDownloadDiff(profile: SyncProfile, secret: ProfileSecretInput): Promise<DownloadPreview> {
  const shouldSkipLocal = createIgnoreMatcher(profile.localPath, profile.ignore);
  const shouldSkipRelative = (relativePath: string) => shouldSkipLocal(path.join(profile.localPath, fromPosixPath(relativePath)));
  const [localFiles, remoteFiles] = await Promise.all([
    collectLocalFiles(profile.localPath, shouldSkipLocal),
    listRemoteFiles(profile, secret, shouldSkipRelative)
  ]);
  const localByRelative = new Map(localFiles.map((file) => [file.relativePath, file]));
  const remoteByRelative = new Map(remoteFiles.map((file) => [file.relativePath, file]));
  const diffs: DownloadDiff[] = [];

  for (const remoteFile of remoteFiles) {
    const localFile = localByRelative.get(remoteFile.relativePath);
    const localPath = safeLocalPath(profile.localPath, remoteFile.relativePath);

    if (!localFile) {
      diffs.push({
        type: "remote-only",
        relativePath: remoteFile.relativePath,
        selected: true,
        localPath,
        remotePath: remoteFile.remotePath,
        remoteSize: remoteFile.size,
        remoteModifiedAt: remoteFile.modifiedAt
      });
      continue;
    }

    if (isChanged(localFile, remoteFile)) {
      diffs.push({
        type: "changed",
        relativePath: remoteFile.relativePath,
        selected: true,
        localPath: localFile.localPath,
        remotePath: remoteFile.remotePath,
        localSize: localFile.size,
        remoteSize: remoteFile.size,
        localModifiedAt: localFile.modifiedAt,
        remoteModifiedAt: remoteFile.modifiedAt
      });
    }
  }

  for (const localFile of localFiles) {
    if (!remoteByRelative.has(localFile.relativePath)) {
      diffs.push({
        type: "local-only",
        relativePath: localFile.relativePath,
        selected: false,
        localPath: localFile.localPath,
        localSize: localFile.size,
        localModifiedAt: localFile.modifiedAt
      });
    }
  }

  return {
    scannedAt: new Date().toISOString(),
    totalLocalFiles: localFiles.length,
    totalRemoteFiles: remoteFiles.length,
    diffs: diffs.sort(sortDiffs)
  };
}

export async function downloadDiffs(
  profile: SyncProfile,
  secret: ProfileSecretInput,
  diffs: DownloadDiff[]
): Promise<DownloadResult> {
  const failed: DownloadResult["failed"] = [];
  let downloaded = 0;

  for (const diff of diffs) {
    if (diff.type === "local-only" || !diff.remotePath) {
      continue;
    }

    try {
      const localPath = safeLocalPath(profile.localPath, diff.relativePath);
      await downloadFileAtomic(profile, secret, diff.remotePath, localPath);
      downloaded += 1;
    } catch (error) {
      failed.push({
        relativePath: diff.relativePath,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { downloaded, failed };
}

async function collectLocalFiles(rootPath: string, shouldSkipLocal: (filePath: string) => boolean): Promise<LocalFileInfo[]> {
  const files: LocalFileInfo[] = [];

  async function visit(currentPath: string): Promise<void> {
    if (shouldSkipLocal(currentPath)) {
      return;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const nextPath = path.join(currentPath, entry.name);

      if (shouldSkipLocal(nextPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await visit(nextPath);
      } else if (entry.isFile()) {
        const stats = await fs.stat(nextPath);
        files.push({
          relativePath: toPosixPath(path.relative(rootPath, nextPath)),
          localPath: nextPath,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString()
        });
      }
    }
  }

  await visit(rootPath);
  return files;
}

function isChanged(localFile: LocalFileInfo, remoteFile: { size: number; modifiedAt?: string }): boolean {
  if (localFile.size !== remoteFile.size) {
    return true;
  }

  if (!localFile.modifiedAt || !remoteFile.modifiedAt) {
    return false;
  }

  return Math.abs(new Date(localFile.modifiedAt).getTime() - new Date(remoteFile.modifiedAt).getTime()) > MODIFIED_TIME_TOLERANCE_MS;
}

function safeLocalPath(rootPath: string, relativePath: string): string {
  const normalizedRelative = posixPath.normalize(relativePath);

  if (normalizedRelative.startsWith("../") || normalizedRelative === ".." || path.isAbsolute(normalizedRelative)) {
    throw new Error(`Unsafe remote path: ${relativePath}`);
  }

  return path.join(rootPath, fromPosixPath(normalizedRelative));
}

function fromPosixPath(value: string): string {
  return value.split("/").join(path.sep);
}

function sortDiffs(left: DownloadDiff, right: DownloadDiff): number {
  const rank = {
    changed: 0,
    "remote-only": 1,
    "local-only": 2
  };

  return rank[left.type] - rank[right.type] || left.relativePath.localeCompare(right.relativePath);
}

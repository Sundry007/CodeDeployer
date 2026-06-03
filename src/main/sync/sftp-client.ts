import { promises as fs } from "node:fs";
import posixPath from "node:path/posix";
import SftpClient from "ssh2-sftp-client";
import type { ProfileSecretInput, RemoteDirectoryListing, RemoteFileInfo, SyncProfile } from "../../shared/types";
import { normalizeRemoteRoot } from "./remote-path";

type SftpConnectionOptions = Parameters<SftpClient["connect"]>[0];

export async function testSftpConnection(
  profile: SyncProfile,
  secret: ProfileSecretInput
): Promise<void> {
  const sftp = new SftpClient();

  try {
    await sftp.connect(await buildConnectionOptions(profile, secret));
    await sftp.stat(normalizeRemoteRoot(profile.remote.remotePath));
  } finally {
    await sftp.end().catch(() => undefined);
  }
}

export async function uploadSftpFileAtomic(
  profile: SyncProfile,
  secret: ProfileSecretInput,
  localFilePath: string,
  remoteFilePath: string
): Promise<void> {
  const sftp = new SftpClient();
  const tempRemotePath = `${remoteFilePath}.__codedeployer_tmp__`;

  try {
    await sftp.connect(await buildConnectionOptions(profile, secret));
    await sftp.mkdir(posixPath.dirname(remoteFilePath), true);
    await sftp.fastPut(localFilePath, tempRemotePath);
    await renameOverExisting(sftp, tempRemotePath, remoteFilePath);
  } finally {
    await sftp.end().catch(() => undefined);
  }
}

export async function downloadSftpFileAtomic(
  profile: SyncProfile,
  secret: ProfileSecretInput,
  remoteFilePath: string,
  localFilePath: string
): Promise<void> {
  const sftp = new SftpClient();
  const tempLocalPath = `${localFilePath}.__codedeployer_tmp__`;

  try {
    await sftp.connect(await buildConnectionOptions(profile, secret));
    await fs.mkdir(posixPath.dirname(localFilePath), { recursive: true });
    await sftp.fastGet(remoteFilePath, tempLocalPath);
    await fs.rename(tempLocalPath, localFilePath);
  } finally {
    await fs.unlink(tempLocalPath).catch(() => undefined);
    await sftp.end().catch(() => undefined);
  }
}

export async function deleteSftpRemoteFile(
  profile: SyncProfile,
  secret: ProfileSecretInput,
  remoteFilePath: string
): Promise<void> {
  const sftp = new SftpClient();

  try {
    await sftp.connect(await buildConnectionOptions(profile, secret));
    await sftp.delete(remoteFilePath, true);
  } finally {
    await sftp.end().catch(() => undefined);
  }
}

export async function listSftpRemoteDirectories(
  profile: SyncProfile,
  secret: ProfileSecretInput,
  remotePath: string
): Promise<RemoteDirectoryListing> {
  const sftp = new SftpClient();
  const normalizedPath = normalizeRemoteRoot(remotePath || profile.remote.remotePath || "/");

  try {
    await sftp.connect(await buildConnectionOptions(profile, secret));
    const entries = await sftp.list(normalizedPath);
    const directories = entries
      .filter((entry) => entry.type === "d")
      .map((entry) => ({
        name: entry.name,
        path: posixPath.join(normalizedPath, entry.name)
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    return {
      path: normalizedPath,
      parentPath: normalizedPath === "/" ? undefined : posixPath.dirname(normalizedPath),
      directories
    };
  } finally {
    await sftp.end().catch(() => undefined);
  }
}

export async function listSftpRemoteFiles(
  profile: SyncProfile,
  secret: ProfileSecretInput,
  shouldSkipRelative: (relativePath: string) => boolean
): Promise<RemoteFileInfo[]> {
  const sftp = new SftpClient();
  const rootPath = normalizeRemoteRoot(profile.remote.remotePath);
  const files: RemoteFileInfo[] = [];

  try {
    await sftp.connect(await buildConnectionOptions(profile, secret));
    await visitRemoteDirectory(sftp, rootPath, "", shouldSkipRelative, files);
    return files;
  } finally {
    await sftp.end().catch(() => undefined);
  }
}

async function visitRemoteDirectory(
  sftp: SftpClient,
  remotePath: string,
  relativeRoot: string,
  shouldSkipRelative: (relativePath: string) => boolean,
  files: RemoteFileInfo[]
): Promise<void> {
  const entries = await sftp.list(remotePath);

  for (const entry of entries) {
    const relativePath = relativeRoot ? posixPath.join(relativeRoot, entry.name) : entry.name;

    if (shouldSkipRelative(relativePath)) {
      continue;
    }

    const nextRemotePath = posixPath.join(remotePath, entry.name);

    if (entry.type === "d") {
      await visitRemoteDirectory(sftp, nextRemotePath, relativePath, shouldSkipRelative, files);
    } else if (entry.type === "-") {
      files.push({
        relativePath,
        remotePath: nextRemotePath,
        size: Number(entry.size) || 0,
        modifiedAt: entry.modifyTime ? new Date(entry.modifyTime).toISOString() : undefined
      });
    }
  }
}

async function buildConnectionOptions(
  profile: SyncProfile,
  secret: ProfileSecretInput
): Promise<SftpConnectionOptions> {
  const base: SftpConnectionOptions = {
    host: profile.remote.host,
    port: profile.remote.port,
    username: profile.remote.username,
    readyTimeout: 15000
  };

  if (profile.remote.authMode === "password") {
    if (!secret.password) {
      throw new Error("Password auth is selected, but no encrypted password is saved for this profile.");
    }

    return { ...base, password: secret.password };
  }

  if (!profile.remote.privateKeyPath) {
    throw new Error("Private key auth is selected, but no private key path is configured.");
  }

  return {
    ...base,
    privateKey: await fs.readFile(profile.remote.privateKeyPath, "utf8"),
    ...(secret.privateKeyPassphrase ? { passphrase: secret.privateKeyPassphrase } : {})
  };
}

async function renameOverExisting(
  sftp: SftpClient,
  tempRemotePath: string,
  remoteFilePath: string
): Promise<void> {
  try {
    await sftp.posixRename(tempRemotePath, remoteFilePath);
    return;
  } catch {
    // Some SFTP servers do not expose POSIX rename. Fall back to replacing the target file.
  }

  await sftp.delete(remoteFilePath, true).catch(() => undefined);
  await sftp.rename(tempRemotePath, remoteFilePath);
}

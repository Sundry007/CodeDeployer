import { promises as fs } from "node:fs";
import path from "node:path";
import posixPath from "node:path/posix";
import SftpClient from "ssh2-sftp-client";
import type { AnyAuthMethod, SFTPWrapper } from "ssh2";
import type { ProfileSecretInput, RemoteDirectoryListing, RemoteFileInfo, SyncProfile } from "../../shared/types";
import { normalizeRemoteRoot } from "./remote-path";

type SftpConnectionOptions = Parameters<SftpClient["connect"]>[0];
type SftpClientWithRawClient = SftpClient & { sftp?: SFTPWrapper };

interface RemoteFileMetadata {
  mode: number;
  uid?: number;
  gid?: number;
}

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
    const existingMetadata = await readRemoteFileMetadata(sftp, remoteFilePath);

    await sftp.mkdir(posixPath.dirname(remoteFilePath), true);
    await sftp.fastPut(localFilePath, tempRemotePath);
    await applyRemoteFileMetadata(sftp, tempRemotePath, existingMetadata);
    await renameOverExisting(sftp, tempRemotePath, remoteFilePath);
  } finally {
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
  shouldSkipRelative?: (relativePath: string) => boolean
): Promise<RemoteFileInfo[]> {
  const sftp = new SftpClient();
  const remoteRoot = normalizeRemoteRoot(profile.remote.remotePath || "/");
  const files: RemoteFileInfo[] = [];

  try {
    await sftp.connect(await buildConnectionOptions(profile, secret));
    await visitSftpDirectory(sftp, remoteRoot, "", files, shouldSkipRelative);
    return files;
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
  const tempLocalPath = `${localFilePath}.codedeployer-download-${Date.now()}.tmp`;

  try {
    await fs.mkdir(path.dirname(localFilePath), { recursive: true });
    await sftp.connect(await buildConnectionOptions(profile, secret));
    await sftp.fastGet(remoteFilePath, tempLocalPath);
    await replaceLocalFile(tempLocalPath, localFilePath);
  } finally {
    await sftp.end().catch(() => undefined);
    await fs.rm(tempLocalPath, { force: true }).catch(() => undefined);
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

    const authHandler: AnyAuthMethod[] = [
      {
        type: "password",
        username: profile.remote.username,
        password: secret.password
      },
      {
        type: "keyboard-interactive",
        username: profile.remote.username,
        prompt: (_name, _instructions, _lang, prompts, finish) => {
          finish(prompts.map(() => secret.password ?? ""));
        }
      }
    ];

    return { ...base, password: secret.password, tryKeyboard: true, authHandler };
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

async function visitSftpDirectory(
  sftp: SftpClient,
  remoteDirectory: string,
  relativeDirectory: string,
  files: RemoteFileInfo[],
  shouldSkipRelative?: (relativePath: string) => boolean
): Promise<void> {
  const entries = await sftp.list(remoteDirectory);

  for (const entry of entries) {
    const relativePath = posixPath.join(relativeDirectory, entry.name);

    if (shouldSkipRelative?.(relativePath)) {
      continue;
    }

    const remotePath = posixPath.join(remoteDirectory, entry.name);

    if (entry.type === "d") {
      await visitSftpDirectory(sftp, remotePath, relativePath, files, shouldSkipRelative);
      continue;
    }

    if (entry.type === "-") {
      files.push({
        relativePath,
        remotePath,
        size: entry.size,
        modifiedAt: entry.modifyTime ? new Date(entry.modifyTime).toISOString() : undefined
      });
    }
  }
}

async function replaceLocalFile(tempLocalPath: string, localFilePath: string): Promise<void> {
  await fs.rm(localFilePath, { force: true }).catch(() => undefined);
  await fs.rename(tempLocalPath, localFilePath);
}

async function readRemoteFileMetadata(
  sftp: SftpClient,
  remoteFilePath: string
): Promise<RemoteFileMetadata | undefined> {
  try {
    const stats = await sftp.stat(remoteFilePath);

    return {
      mode: stats.mode & 0o7777,
      uid: stats.uid,
      gid: stats.gid
    };
  } catch {
    return undefined;
  }
}

async function applyRemoteFileMetadata(
  sftp: SftpClient,
  remoteFilePath: string,
  metadata: RemoteFileMetadata | undefined
): Promise<void> {
  if (!metadata) {
    return;
  }

  await chownRemoteFile(sftp, remoteFilePath, metadata.uid, metadata.gid).catch((error: unknown) => {
    console.warn(`Unable to preserve owner for ${remoteFilePath}:`, error);
  });

  await sftp.chmod(remoteFilePath, metadata.mode).catch((error: unknown) => {
    console.warn(`Unable to preserve permissions for ${remoteFilePath}:`, error);
  });
}

async function chownRemoteFile(
  sftp: SftpClient,
  remoteFilePath: string,
  uid: number | undefined,
  gid: number | undefined
): Promise<void> {
  if (typeof uid !== "number" || typeof gid !== "number" || !Number.isInteger(uid) || !Number.isInteger(gid)) {
    return;
  }

  const ownerUid = uid;
  const ownerGid = gid;
  const rawClient = (sftp as SftpClientWithRawClient).sftp;

  if (!rawClient) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    rawClient.chown(remoteFilePath, ownerUid, ownerGid, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
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

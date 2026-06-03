import { Client } from "basic-ftp";
import { promises as fs } from "node:fs";
import path from "node:path";
import posixPath from "node:path/posix";
import type { ProfileSecretInput, RemoteDirectoryListing, RemoteFileInfo, SyncProfile } from "../../shared/types";
import { normalizeRemoteRoot } from "./remote-path";

export async function testFtpConnection(profile: SyncProfile, secret: ProfileSecretInput): Promise<void> {
  const client = await createFtpClient(profile, secret);

  try {
    await client.cd(normalizeRemoteRoot(profile.remote.remotePath));
  } finally {
    client.close();
  }
}

export async function uploadFtpFileAtomic(
  profile: SyncProfile,
  secret: ProfileSecretInput,
  localFilePath: string,
  remoteFilePath: string
): Promise<void> {
  const client = await createFtpClient(profile, secret);
  const tempRemotePath = `${remoteFilePath}.__codedeployer_tmp__`;

  try {
    await client.ensureDir(posixPath.dirname(remoteFilePath));
    await client.uploadFrom(localFilePath, tempRemotePath);
    await renameOverExisting(client, tempRemotePath, remoteFilePath);
  } finally {
    client.close();
  }
}

export async function deleteFtpRemoteFile(
  profile: SyncProfile,
  secret: ProfileSecretInput,
  remoteFilePath: string
): Promise<void> {
  const client = await createFtpClient(profile, secret);

  try {
    await client.remove(remoteFilePath);
  } finally {
    client.close();
  }
}

export async function listFtpRemoteDirectories(
  profile: SyncProfile,
  secret: ProfileSecretInput,
  remotePath: string
): Promise<RemoteDirectoryListing> {
  const client = await createFtpClient(profile, secret);
  const normalizedPath = normalizeRemoteRoot(remotePath || profile.remote.remotePath || "/");

  try {
    const entries = await client.list(normalizedPath);
    const directories = entries
      .filter((entry) => entry.isDirectory)
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
    client.close();
  }
}

export async function listFtpRemoteFiles(
  profile: SyncProfile,
  secret: ProfileSecretInput,
  shouldSkipRelative?: (relativePath: string) => boolean
): Promise<RemoteFileInfo[]> {
  const client = await createFtpClient(profile, secret);
  const remoteRoot = normalizeRemoteRoot(profile.remote.remotePath || "/");
  const files: RemoteFileInfo[] = [];

  try {
    await visitFtpDirectory(client, remoteRoot, "", files, shouldSkipRelative);
    return files;
  } finally {
    client.close();
  }
}

export async function downloadFtpFileAtomic(
  profile: SyncProfile,
  secret: ProfileSecretInput,
  remoteFilePath: string,
  localFilePath: string
): Promise<void> {
  const client = await createFtpClient(profile, secret);
  const tempLocalPath = `${localFilePath}.codedeployer-download-${Date.now()}.tmp`;

  try {
    await fs.mkdir(path.dirname(localFilePath), { recursive: true });
    await client.downloadTo(tempLocalPath, remoteFilePath);
    await replaceLocalFile(tempLocalPath, localFilePath);
  } finally {
    client.close();
    await fs.rm(tempLocalPath, { force: true }).catch(() => undefined);
  }
}

async function createFtpClient(profile: SyncProfile, secret: ProfileSecretInput): Promise<Client> {
  if (!secret.password) {
    throw new Error("FTP requires a saved password for this profile.");
  }

  const client = new Client(15000);
  client.ftp.verbose = false;

  try {
    await client.access({
      host: profile.remote.host,
      port: profile.remote.port || 21,
      user: profile.remote.username,
      password: secret.password,
      secure: false
    });
    return client;
  } catch (error) {
    client.close();
    throw error;
  }
}

async function visitFtpDirectory(
  client: Client,
  remoteDirectory: string,
  relativeDirectory: string,
  files: RemoteFileInfo[],
  shouldSkipRelative?: (relativePath: string) => boolean
): Promise<void> {
  const entries = await client.list(remoteDirectory);

  for (const entry of entries) {
    const relativePath = posixPath.join(relativeDirectory, entry.name);

    if (shouldSkipRelative?.(relativePath)) {
      continue;
    }

    const remotePath = posixPath.join(remoteDirectory, entry.name);

    if (entry.isDirectory) {
      await visitFtpDirectory(client, remotePath, relativePath, files, shouldSkipRelative);
      continue;
    }

    if (entry.isFile) {
      files.push({
        relativePath,
        remotePath,
        size: entry.size,
        modifiedAt: entry.modifiedAt?.toISOString()
      });
    }
  }
}

async function replaceLocalFile(tempLocalPath: string, localFilePath: string): Promise<void> {
  await fs.rm(localFilePath, { force: true }).catch(() => undefined);
  await fs.rename(tempLocalPath, localFilePath);
}

async function renameOverExisting(client: Client, tempRemotePath: string, remoteFilePath: string): Promise<void> {
  try {
    await client.rename(tempRemotePath, remoteFilePath);
    return;
  } catch {
    // Many FTP servers do not replace existing targets on rename.
  }

  await client.remove(remoteFilePath).catch(() => undefined);
  await client.rename(tempRemotePath, remoteFilePath);
}

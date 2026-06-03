import type { ProfileSecretInput, RemoteDirectoryListing, RemoteFileInfo, SyncProfile } from "../../shared/types";
import {
  deleteFtpRemoteFile,
  downloadFtpFileAtomic,
  listFtpRemoteDirectories,
  listFtpRemoteFiles,
  testFtpConnection,
  uploadFtpFileAtomic
} from "./ftp-client";
import {
  deleteSftpRemoteFile,
  downloadSftpFileAtomic,
  listSftpRemoteDirectories,
  listSftpRemoteFiles,
  testSftpConnection,
  uploadSftpFileAtomic
} from "./sftp-client";

export async function testTransferConnection(profile: SyncProfile, secret: ProfileSecretInput): Promise<void> {
  if (profile.remote.protocol === "ftp") {
    return testFtpConnection(profile, secret);
  }

  return testSftpConnection(profile, secret);
}

export async function uploadFileAtomic(
  profile: SyncProfile,
  secret: ProfileSecretInput,
  localFilePath: string,
  remoteFilePath: string
): Promise<void> {
  if (profile.remote.protocol === "ftp") {
    return uploadFtpFileAtomic(profile, secret, localFilePath, remoteFilePath);
  }

  return uploadSftpFileAtomic(profile, secret, localFilePath, remoteFilePath);
}

export async function deleteRemoteFile(
  profile: SyncProfile,
  secret: ProfileSecretInput,
  remoteFilePath: string
): Promise<void> {
  if (profile.remote.protocol === "ftp") {
    return deleteFtpRemoteFile(profile, secret, remoteFilePath);
  }

  return deleteSftpRemoteFile(profile, secret, remoteFilePath);
}

export async function listRemoteDirectories(
  profile: SyncProfile,
  secret: ProfileSecretInput,
  remotePath: string
): Promise<RemoteDirectoryListing> {
  if (profile.remote.protocol === "ftp") {
    return listFtpRemoteDirectories(profile, secret, remotePath);
  }

  return listSftpRemoteDirectories(profile, secret, remotePath);
}

export async function listRemoteFiles(
  profile: SyncProfile,
  secret: ProfileSecretInput,
  shouldSkipRelative?: (relativePath: string) => boolean
): Promise<RemoteFileInfo[]> {
  if (profile.remote.protocol === "ftp") {
    return listFtpRemoteFiles(profile, secret, shouldSkipRelative);
  }

  return listSftpRemoteFiles(profile, secret, shouldSkipRelative);
}

export async function downloadFileAtomic(
  profile: SyncProfile,
  secret: ProfileSecretInput,
  remoteFilePath: string,
  localFilePath: string
): Promise<void> {
  if (profile.remote.protocol === "ftp") {
    return downloadFtpFileAtomic(profile, secret, remoteFilePath, localFilePath);
  }

  return downloadSftpFileAtomic(profile, secret, remoteFilePath, localFilePath);
}

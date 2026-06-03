import { promises as fs } from "node:fs";
import path from "node:path";
import { watch, type FSWatcher } from "chokidar";
import type { AppSnapshot, ConnectionTestResult, SyncProfile, SyncStatus } from "../../shared/types";
import type { LogInput, LogStore } from "../storage/log-store";
import type { SecretStore } from "../storage/secret-store";
import { createIgnoreMatcher } from "./ignore";
import { localToRemotePath } from "./remote-path";
import { deleteRemoteFile, testTransferConnection, uploadFileAtomic } from "./transfer-client";
import { UploadQueue } from "./upload-queue";

interface ProfileRuntime {
  profile: SyncProfile;
  watcher?: FSWatcher;
  queue: UploadQueue;
  isIgnored: (filePath: string) => boolean;
}

interface ReloadOptions {
  preserveQueue?: boolean;
}

export interface SyncProfileSource {
  list(): Promise<SyncProfile[]>;
}

export class SyncManager {
  private readonly runtimes = new Map<string, ProfileRuntime>();
  private readonly statuses = new Map<string, SyncStatus>();

  constructor(
    private readonly profileSource: SyncProfileSource,
    private readonly secretStore: SecretStore,
    private readonly logStore: LogStore,
    private readonly onChange: () => void
  ) {}

  async start(): Promise<void> {
    const profiles = await this.profileSource.list();

    for (const profile of profiles) {
      if (profile.enabled) {
        await this.startProfile(profile);
      } else {
        this.setStatus(profile.id, { profileId: profile.id, state: "paused", queueSize: 0, activeUploads: 0 });
      }
    }

    this.onChange();
  }

  async stop(): Promise<void> {
    for (const profileId of Array.from(this.runtimes.keys())) {
      await this.stopProfile(profileId, true);
    }
  }

  async reloadProfile(profileId: string, options: ReloadOptions = {}): Promise<void> {
    const profile = (await this.profileSource.list()).find((item) => item.id === profileId);

    if (!profile) {
      await this.stopProfile(profileId, true);
      this.statuses.delete(profileId);
      this.onChange();
      return;
    }

    if (profile.enabled) {
      await this.startProfile(profile, Boolean(options.preserveQueue));
    } else if (options.preserveQueue) {
      await this.pauseProfile(profile);
    } else {
      await this.stopProfile(profile.id, true);
      this.setStatus(profile.id, { profileId: profile.id, state: "paused", queueSize: 0, activeUploads: 0 });
    }
  }

  async syncNow(profileId: string): Promise<number> {
    const runtime = this.runtimes.get(profileId);

    if (!runtime || runtime.queue.isPaused()) {
      const profile = (await this.profileSource.list()).find((item) => item.id === profileId);
      await this.writeLog({
        profileId,
        profileName: profile?.name ?? "Unknown profile",
        level: "warning",
        event: "manual",
        message: "Profile is paused. Resume it before running manual sync."
      });
      return 0;
    }

    const files = await collectFiles(runtime.profile.localPath, runtime.isIgnored);

    for (const file of files) {
      runtime.queue.enqueue(file, 0);
    }

    await this.writeLog({
      profileId,
      profileName: runtime.profile.name,
      level: "info",
      event: "manual",
      message: `Queued ${files.length} file(s) for manual sync.`
    });

    return files.length;
  }

  async clearQueue(profileId: string): Promise<void> {
    const runtime = this.runtimes.get(profileId);

    if (!runtime) {
      return;
    }

    runtime.queue.clearPending();
    this.updateQueueStatus(profileId);

    await this.writeLog({
      profileId,
      profileName: runtime.profile.name,
      level: "info",
      event: "manual",
      message: "Upload queue cleared."
    });
  }

  async testConnection(profileId: string): Promise<ConnectionTestResult> {
    const profile = (await this.profileSource.list()).find((item) => item.id === profileId);

    if (!profile) {
      return { ok: false, message: "Profile not found." };
    }

    try {
      await testTransferConnection(profile, await this.secretStore.get(credentialId(profile)));
      await this.writeLog({
        profileId: profile.id,
        profileName: profile.name,
        level: "success",
        event: "connection",
        message: `${protocolLabel(profile)} connection test passed.`
      });

      return { ok: true, message: "Connection test passed." };
    } catch (error) {
      const message = formatError(error);
      await this.writeLog({
        profileId: profile.id,
        profileName: profile.name,
        level: "error",
        event: "connection",
        message: `${protocolLabel(profile)} connection test failed.`,
        error: message
      });

      return { ok: false, message };
    }
  }

  getStatuses(): SyncStatus[] {
    return Array.from(this.statuses.values());
  }

  async snapshot(): Promise<AppSnapshot> {
    return {
      profiles: await this.profileSource.list(),
      statuses: this.getStatuses(),
      logs: await this.logStore.list()
    };
  }

  private async startProfile(profile: SyncProfile, preserveQueue = false): Promise<void> {
    if (!preserveQueue) {
      await this.stopProfile(profile.id, true);
    }

    try {
      await fs.access(profile.localPath);
    } catch {
      const error = `Local path does not exist: ${profile.localPath}`;
      const runtime = this.runtimes.get(profile.id);
      const snapshot = runtime?.queue.snapshot() ?? { queueSize: 0, activeUploads: 0 };
      this.setStatus(profile.id, { profileId: profile.id, state: "error", ...snapshot, error });
      await this.writeLog({
        profileId: profile.id,
        profileName: profile.name,
        level: "error",
        event: "watcher",
        message: "Watcher could not start.",
        error
      });
      return;
    }

    const isIgnored = createIgnoreMatcher(profile.localPath, profile.ignore);
    const existingRuntime = preserveQueue ? this.runtimes.get(profile.id) : undefined;
    const queue =
      existingRuntime?.queue ??
      new UploadQueue(
        profile.concurrency,
        (localPath) => this.upload(profile.id, localPath),
        () => this.updateQueueStatus(profile.id)
      );

    if (existingRuntime?.watcher) {
      await existingRuntime.watcher.close();
    }

    const runtime: ProfileRuntime = {
      profile,
      queue,
      isIgnored
    };

    const watcher = watch(profile.localPath, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 700,
        pollInterval: 100
      },
      ignored: (candidate) => isIgnored(candidate.toString())
    });

    watcher.on("add", (filePath) => queue.enqueue(filePath));
    watcher.on("change", (filePath) => queue.enqueue(filePath));
    watcher.on("unlink", (filePath) => void this.handleLocalDelete(profile.id, filePath));
    watcher.on("error", (error) => void this.handleWatcherError(profile.id, error));

    runtime.watcher = watcher;
    this.runtimes.set(profile.id, runtime);
    queue.resume();

    const snapshot = queue.snapshot();
    this.setStatus(profile.id, {
      profileId: profile.id,
      state: "running",
      ...snapshot,
      lastSyncAt: this.statuses.get(profile.id)?.lastSyncAt,
      error: undefined
    });

    await this.writeLog({
      profileId: profile.id,
      profileName: profile.name,
      level: "info",
      event: "watcher",
      message: "Watcher started.",
      localPath: profile.localPath,
      remotePath: profile.remote.remotePath
    });
  }

  private async pauseProfile(profile: SyncProfile): Promise<void> {
    const runtime = this.runtimes.get(profile.id);

    if (!runtime) {
      this.setStatus(profile.id, { profileId: profile.id, state: "paused", queueSize: 0, activeUploads: 0 });
      return;
    }

    runtime.profile = profile;
    runtime.isIgnored = createIgnoreMatcher(profile.localPath, profile.ignore);
    runtime.queue.pause();

    if (runtime.watcher) {
      await runtime.watcher.close();
      runtime.watcher = undefined;
    }

    const snapshot = runtime.queue.snapshot();
    this.setStatus(profile.id, {
      profileId: profile.id,
      state: "paused",
      ...snapshot,
      lastSyncAt: this.statuses.get(profile.id)?.lastSyncAt,
      error: undefined
    });

    await this.writeLog({
      profileId: profile.id,
      profileName: profile.name,
      level: "info",
      event: "watcher",
      message: "Watcher paused.",
      localPath: profile.localPath,
      remotePath: profile.remote.remotePath
    });
  }

  private async stopProfile(profileId: string, clearQueue: boolean): Promise<void> {
    const runtime = this.runtimes.get(profileId);

    if (!runtime) {
      return;
    }

    if (runtime.watcher) {
      await runtime.watcher.close();
      runtime.watcher = undefined;
    }

    if (clearQueue) {
      runtime.queue.dispose();
      this.runtimes.delete(profileId);
    } else {
      runtime.queue.pause();
    }
  }

  private async upload(profileId: string, localFilePath: string): Promise<void> {
    const runtime = this.runtimes.get(profileId);

    if (!runtime) {
      return;
    }

    const profile = runtime.profile;

    try {
      const stats = await fs.stat(localFilePath);

      if (!stats.isFile()) {
        return;
      }

      const remoteFilePath = localToRemotePath(profile.localPath, profile.remote.remotePath, localFilePath);
      await uploadFileAtomic(profile, await this.secretStore.get(credentialId(profile)), localFilePath, remoteFilePath);

      const lastSyncAt = new Date().toISOString();
      const latestRuntime = this.runtimes.get(profile.id);
      this.mergeStatus(profile.id, {
        state: latestRuntime?.queue.isPaused() ? "paused" : "running",
        error: undefined,
        lastSyncAt
      });

      await this.writeLog({
        profileId: profile.id,
        profileName: profile.name,
        level: "success",
        event: "upload",
        message: "Uploaded file.",
        localPath: localFilePath,
        remotePath: remoteFilePath
      });
    } catch (error) {
      const message = formatError(error);
      this.mergeStatus(profile.id, { state: "error", error: message });

      await this.writeLog({
        profileId: profile.id,
        profileName: profile.name,
        level: "error",
        event: "upload",
        message: "Upload failed.",
        localPath: localFilePath,
        error: message
      });
    }
  }

  private async handleLocalDelete(profileId: string, localFilePath: string): Promise<void> {
    const runtime = this.runtimes.get(profileId);

    if (!runtime) {
      return;
    }

    const profile = runtime.profile;

    if (!profile.deleteRemote) {
      await this.writeLog({
        profileId: profile.id,
        profileName: profile.name,
        level: "info",
        event: "delete",
        message: "Local delete ignored because remote deletion is disabled.",
        localPath: localFilePath
      });
      return;
    }

    try {
      const remoteFilePath = localToRemotePath(profile.localPath, profile.remote.remotePath, localFilePath);
      await deleteRemoteFile(profile, await this.secretStore.get(credentialId(profile)), remoteFilePath);
      await this.writeLog({
        profileId: profile.id,
        profileName: profile.name,
        level: "success",
        event: "delete",
        message: "Deleted remote file.",
        localPath: localFilePath,
        remotePath: remoteFilePath
      });
    } catch (error) {
      const message = formatError(error);
      this.mergeStatus(profile.id, { state: "error", error: message });
      await this.writeLog({
        profileId: profile.id,
        profileName: profile.name,
        level: "error",
        event: "delete",
        message: "Remote delete failed.",
        localPath: localFilePath,
        error: message
      });
    }
  }

  private async handleWatcherError(profileId: string, error: unknown): Promise<void> {
    const runtime = this.runtimes.get(profileId);
    const profile = runtime?.profile;
    const message = formatError(error);
    this.mergeStatus(profileId, { state: "error", error: message });
    await this.writeLog({
      profileId,
      profileName: profile?.name ?? "Unknown profile",
      level: "error",
      event: "watcher",
      message: "Watcher failed.",
      error: message
    });
  }

  private updateQueueStatus(profileId: string): void {
    const runtime = this.runtimes.get(profileId);

    if (!runtime) {
      return;
    }

    const snapshot = runtime.queue.snapshot();
    this.mergeStatus(profileId, snapshot);
  }

  private setStatus(profileId: string, status: SyncStatus): void {
    this.statuses.set(profileId, status);
    this.onChange();
  }

  private mergeStatus(profileId: string, status: Partial<SyncStatus>): void {
    const current = this.statuses.get(profileId) ?? {
      profileId,
      state: "idle",
      queueSize: 0,
      activeUploads: 0
    };

    this.statuses.set(profileId, { ...current, ...status });
    this.onChange();
  }

  private async writeLog(input: LogInput): Promise<void> {
    try {
      await this.logStore.append(input);
      this.onChange();
    } catch (error) {
      console.error("Failed to write sync log.", error);
    }
  }
}

async function collectFiles(rootPath: string, isIgnored: (filePath: string) => boolean): Promise<string[]> {
  const files: string[] = [];

  async function visit(currentPath: string): Promise<void> {
    if (isIgnored(currentPath)) {
      return;
    }

    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const nextPath = path.join(currentPath, entry.name);

      if (isIgnored(nextPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await visit(nextPath);
      } else if (entry.isFile()) {
        files.push(nextPath);
      }
    }
  }

  await visit(rootPath);
  return files;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function protocolLabel(profile: SyncProfile): string {
  return (profile.remote.protocol ?? "sftp").toUpperCase();
}

function credentialId(profile: SyncProfile): string {
  return profile.id;
}

import { randomUUID } from "node:crypto";
import type { ProfileInput, SyncProfile, TransferProtocol } from "../../shared/types";
import { JsonFile } from "./json-file";

interface ProfileFile {
  profiles: SyncProfile[];
}

export class ProfileStore {
  private readonly file: JsonFile<ProfileFile>;

  constructor(filePath: string) {
    this.file = new JsonFile<ProfileFile>(filePath, { profiles: [] });
  }

  async list(): Promise<SyncProfile[]> {
    const data = await this.file.read();
    return data.profiles.map(normalizeStoredProfile);
  }

  async save(input: ProfileInput): Promise<SyncProfile> {
    const data = await this.file.read();
    const now = new Date().toISOString();
    const existing = input.id ? data.profiles.find((profile) => profile.id === input.id) : undefined;
    const profile: SyncProfile = {
      id: existing?.id ?? input.id ?? randomUUID(),
      name: input.name.trim(),
      enabled: Boolean(input.enabled),
      localPath: input.localPath.trim(),
      remote: {
        protocol: normalizeProtocol(input.remote.protocol),
        host: input.remote.host.trim(),
        port: Number(input.remote.port) || defaultPort(input.remote.protocol),
        username: input.remote.username.trim(),
        authMode: normalizeProtocol(input.remote.protocol) === "ftp" ? "password" : input.remote.authMode,
        remotePath: normalizeRemoteRoot(input.remote.remotePath),
        privateKeyPath: normalizeProtocol(input.remote.protocol) === "ftp" ? undefined : input.remote.privateKeyPath?.trim() || undefined
      },
      ignore: normalizeIgnoreRules(input.ignore),
      deleteRemote: Boolean(input.deleteRemote),
      concurrency: Math.max(1, Number(input.concurrency) || 1),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    if (!profile.name) {
      throw new Error("Profile name is required.");
    }

    if (!profile.localPath) {
      throw new Error("Local path is required.");
    }

    if (!profile.remote.host || !profile.remote.username || !profile.remote.remotePath) {
      throw new Error("Remote host, username, and path are required.");
    }

    const nextProfiles = existing
      ? data.profiles.map((item) => (item.id === profile.id ? profile : item))
      : [profile, ...data.profiles];

    await this.file.write({ profiles: nextProfiles });
    return profile;
  }

  async delete(id: string): Promise<void> {
    const data = await this.file.read();
    await this.file.write({ profiles: data.profiles.filter((profile) => profile.id !== id) });
  }

  async setEnabled(id: string, enabled: boolean): Promise<SyncProfile | undefined> {
    const profiles = await this.list();
    const profile = profiles.find((item) => item.id === id);

    if (!profile) {
      return undefined;
    }

    return this.save({ ...profile, enabled });
  }
}

function normalizeRemoteRoot(remotePath: string): string {
  const trimmed = remotePath.trim().replace(/\\/g, "/");
  if (!trimmed) {
    return "/";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeIgnoreRules(rules: string[]): string[] {
  const cleaned = rules.map((rule) => rule.trim()).filter(Boolean);
  return Array.from(new Set(cleaned));
}

function normalizeStoredProfile(profile: SyncProfile): SyncProfile {
  const protocol = normalizeProtocol(profile.remote.protocol);

  return {
    ...profile,
    remote: {
      ...profile.remote,
      protocol,
      port: Number(profile.remote.port) || defaultPort(protocol),
      authMode: protocol === "ftp" ? "password" : profile.remote.authMode,
      privateKeyPath: protocol === "ftp" ? undefined : profile.remote.privateKeyPath,
      remotePath: normalizeRemoteRoot(profile.remote.remotePath)
    }
  };
}

function normalizeProtocol(protocol?: TransferProtocol): TransferProtocol {
  return protocol === "ftp" ? "ftp" : "sftp";
}

function defaultPort(protocol?: TransferProtocol): number {
  return normalizeProtocol(protocol) === "ftp" ? 21 : 22;
}

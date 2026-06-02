import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  type ServerWorkspace,
  type ServerWorkspaceInput,
  type ServerWorkspaceRule,
  type SyncProfile,
  type TransferProtocol,
  workspaceRuleProfileId
} from "../../shared/types";
import { JsonFile } from "./json-file";

interface WorkspaceFile {
  workspaces: ServerWorkspace[];
}

export class WorkspaceStore {
  private readonly file: JsonFile<WorkspaceFile>;

  constructor(filePath: string) {
    this.file = new JsonFile<WorkspaceFile>(filePath, { workspaces: [] });
  }

  async list(): Promise<ServerWorkspace[]> {
    const data = await this.file.read();
    return data.workspaces.map(normalizeStoredWorkspace);
  }

  async save(input: ServerWorkspaceInput): Promise<ServerWorkspace> {
    const data = await this.file.read();
    const now = new Date().toISOString();
    const existing = input.id ? data.workspaces.find((workspace) => workspace.id === input.id) : undefined;
    const workspaceId = existing?.id ?? input.id ?? randomUUID();
    const existingRules = new Map(existing?.rules.map((rule) => [rule.id, rule]));
    const rules = normalizeRules(input.rules, existingRules, now);

    const workspace: ServerWorkspace = {
      id: workspaceId,
      name: input.name.trim(),
      enabled: Boolean(input.enabled),
      connection: {
        protocol: normalizeProtocol(input.connection.protocol),
        host: input.connection.host.trim(),
        port: Number(input.connection.port) || defaultPort(input.connection.protocol),
        username: input.connection.username.trim(),
        authMode: normalizeProtocol(input.connection.protocol) === "ftp" ? "password" : input.connection.authMode,
        privateKeyPath:
          normalizeProtocol(input.connection.protocol) === "ftp" ? undefined : input.connection.privateKeyPath?.trim() || undefined
      },
      defaultIgnore: [],
      rules,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    if (!workspace.name) {
      throw new Error("Workspace name is required.");
    }

    if (!workspace.connection.host || !workspace.connection.username) {
      throw new Error("Server host and username are required.");
    }

    const nextWorkspaces = existing
      ? data.workspaces.map((item) => (item.id === workspace.id ? workspace : item))
      : [workspace, ...data.workspaces];

    await this.file.write({ workspaces: nextWorkspaces });
    return workspace;
  }

  async delete(id: string): Promise<void> {
    const data = await this.file.read();
    await this.file.write({ workspaces: data.workspaces.filter((workspace) => workspace.id !== id) });
  }

  async toSyncProfiles(): Promise<SyncProfile[]> {
    const workspaces = await this.list();
    return workspaces.flatMap(workspaceToSyncProfiles);
  }
}

export function workspaceToSyncProfiles(workspace: ServerWorkspace): SyncProfile[] {
  return workspace.rules.map((rule) => {
    const remotePath = normalizeRemoteRoot(rule.remotePath);

    return {
      id: workspaceRuleProfileId(workspace.id, rule.id),
      name: `${workspace.name} / ${rule.name}`,
      enabled: workspace.enabled && rule.enabled,
      localPath: rule.localPath,
      remote: {
        protocol: workspace.connection.protocol,
        host: workspace.connection.host,
        port: workspace.connection.port,
        username: workspace.connection.username,
        authMode: workspace.connection.protocol === "ftp" ? "password" : workspace.connection.authMode,
        remotePath,
        privateKeyPath: workspace.connection.protocol === "ftp" ? undefined : workspace.connection.privateKeyPath
      },
      ignore: normalizeIgnoreRules(rule.ignore),
      deleteRemote: rule.deleteRemote,
      concurrency: rule.concurrency,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      source: "workspace",
      workspaceId: workspace.id,
      workspaceRuleId: rule.id,
      secretId: workspace.id
    };
  });
}

function normalizeRules(
  rules: ServerWorkspaceInput["rules"],
  existingRules: Map<string, ServerWorkspaceRule>,
  now: string
): ServerWorkspaceRule[] {
  return rules
    .filter((rule) => hasRuleContent(rule))
    .map((rule) => {
      const existing = rule.id ? existingRules.get(rule.id) : undefined;
      const localPath = rule.localPath.trim();
      const remotePath = normalizeRemoteRoot(rule.remotePath);

      if (!localPath || !remotePath) {
        throw new Error("Each directory rule needs both a local folder and a remote folder.");
      }

      return {
        id: existing?.id ?? rule.id ?? randomUUID(),
        name: rule.name.trim() || path.basename(localPath) || lastRemotePart(remotePath) || "Directory rule",
        enabled: Boolean(rule.enabled),
        localPath,
        remotePath,
        ignore: normalizeIgnoreRules(rule.ignore),
        deleteRemote: Boolean(rule.deleteRemote),
        concurrency: Math.max(1, Number(rule.concurrency) || 1),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      };
    });
}

function hasRuleContent(rule: ServerWorkspaceInput["rules"][number]): boolean {
  return Boolean(rule.name.trim() || rule.localPath.trim() || rule.remotePath.trim());
}

function normalizeStoredWorkspace(workspace: ServerWorkspace): ServerWorkspace {
  const protocol = normalizeProtocol(workspace.connection.protocol);
  const legacyDefaultIgnore = Array.isArray(workspace.defaultIgnore) ? normalizeIgnoreRules(workspace.defaultIgnore) : [];

  return {
    ...workspace,
    connection: {
      ...workspace.connection,
      protocol,
      port: Number(workspace.connection.port) || defaultPort(protocol),
      authMode: protocol === "ftp" ? "password" : workspace.connection.authMode,
      privateKeyPath: protocol === "ftp" ? undefined : workspace.connection.privateKeyPath
    },
    defaultIgnore: [],
    rules: workspace.rules.map((rule) => ({
      ...rule,
      remotePath: normalizeRemoteRoot(rule.remotePath),
      ignore: mergeIgnoreRules(legacyDefaultIgnore, rule.ignore),
      concurrency: Math.max(1, Number(rule.concurrency) || 1)
    }))
  };
}

function normalizeRemoteRoot(remotePath: string): string {
  const trimmed = remotePath.trim().replace(/\\/g, "/");
  if (!trimmed) {
    return "/";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeIgnoreRules(rules: string[]): string[] {
  return Array.from(new Set(rules.map((rule) => rule.trim()).filter(Boolean)));
}

function mergeIgnoreRules(workspaceRules: string[], ruleRules: string[]): string[] {
  return Array.from(new Set([...workspaceRules, ...ruleRules].map((rule) => rule.trim()).filter(Boolean)));
}

function normalizeProtocol(protocol?: TransferProtocol): TransferProtocol {
  return protocol === "ftp" ? "ftp" : "sftp";
}

function defaultPort(protocol?: TransferProtocol): number {
  return normalizeProtocol(protocol) === "ftp" ? 21 : 22;
}

function lastRemotePart(remotePath: string): string {
  return remotePath.split("/").filter(Boolean).at(-1) ?? "";
}

export type AuthMode = "privateKey" | "password";

export type TransferProtocol = "sftp" | "ftp";

export type SyncState = "running" | "paused" | "idle" | "error";

export type LogLevel = "info" | "success" | "warning" | "error";

export type LogEvent =
  | "profile"
  | "watcher"
  | "upload"
  | "manual"
  | "connection"
  | "delete"
  | "download";

export interface RemoteConnection {
  protocol: TransferProtocol;
  host: string;
  port: number;
  username: string;
  authMode: AuthMode;
  remotePath: string;
  privateKeyPath?: string;
}

export interface ServerConnection {
  protocol: TransferProtocol;
  host: string;
  port: number;
  username: string;
  authMode: AuthMode;
  privateKeyPath?: string;
}

export interface SyncProfile {
  id: string;
  name: string;
  enabled: boolean;
  localPath: string;
  remote: RemoteConnection;
  ignore: string[];
  deleteRemote: boolean;
  concurrency: number;
  createdAt: string;
  updatedAt: string;
  source?: "mapping" | "workspace";
  workspaceId?: string;
  workspaceRuleId?: string;
  secretId?: string;
  secretStatus?: CredentialStatus;
}

export interface ProfileSecretInput {
  password?: string;
  privateKeyPassphrase?: string;
}

export interface CredentialStatus {
  hasPassword: boolean;
  hasPrivateKeyPassphrase: boolean;
}

export type ProfileInput = Omit<SyncProfile, "id" | "createdAt" | "updatedAt" | "secretStatus"> & {
  id?: string;
  secret?: ProfileSecretInput;
};

export interface ServerWorkspaceRule {
  id: string;
  name: string;
  enabled: boolean;
  localPath: string;
  remotePath: string;
  ignore: string[];
  deleteRemote: boolean;
  concurrency: number;
  createdAt: string;
  updatedAt: string;
}

export type ServerWorkspaceRuleInput = Omit<ServerWorkspaceRule, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};

export interface ServerWorkspace {
  id: string;
  name: string;
  enabled: boolean;
  connection: ServerConnection;
  defaultIgnore: string[];
  rules: ServerWorkspaceRule[];
  createdAt: string;
  updatedAt: string;
  secretStatus?: CredentialStatus;
}

export type ServerWorkspaceInput = Omit<ServerWorkspace, "id" | "createdAt" | "updatedAt" | "rules" | "secretStatus"> & {
  id?: string;
  rules: ServerWorkspaceRuleInput[];
  secret?: ProfileSecretInput;
};

export interface SyncLog {
  id: string;
  timestamp: string;
  profileId: string;
  profileName: string;
  level: LogLevel;
  event: LogEvent;
  message: string;
  localPath?: string;
  remotePath?: string;
  error?: string;
}

export interface SyncStatus {
  profileId: string;
  state: SyncState;
  queueSize: number;
  activeUploads: number;
  lastSyncAt?: string;
  error?: string;
}

export interface AppSnapshot {
  profiles: SyncProfile[];
  workspaces: ServerWorkspace[];
  statuses: SyncStatus[];
  logs: SyncLog[];
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

export interface RemoteDirectoryEntry {
  name: string;
  path: string;
}

export interface RemoteDirectoryListing {
  path: string;
  parentPath?: string;
  directories: RemoteDirectoryEntry[];
}

export interface RemoteFileInfo {
  relativePath: string;
  remotePath: string;
  size: number;
  modifiedAt?: string;
}

export interface LocalFileInfo {
  relativePath: string;
  localPath: string;
  size: number;
  modifiedAt?: string;
}

export type DownloadDiffType = "remote-only" | "changed" | "local-only";

export interface DownloadDiff {
  type: DownloadDiffType;
  relativePath: string;
  selected: boolean;
  localPath: string;
  remotePath?: string;
  localSize?: number;
  remoteSize?: number;
  localModifiedAt?: string;
  remoteModifiedAt?: string;
}

export interface DownloadPreview {
  scannedAt: string;
  totalLocalFiles: number;
  totalRemoteFiles: number;
  diffs: DownloadDiff[];
}

export interface DownloadResult {
  downloaded: number;
  failed: Array<{
    relativePath: string;
    error: string;
  }>;
}

export interface IgnoreRuleSuggestion {
  rule: string;
  reason: string;
}

export interface IgnoreRuleScanResult {
  rootPath: string;
  suggestions: IgnoreRuleSuggestion[];
}

export interface CodeDeployerApi {
  getSnapshot: () => Promise<AppSnapshot>;
  saveProfile: (input: ProfileInput) => Promise<SyncProfile>;
  deleteProfile: (id: string) => Promise<void>;
  setProfileEnabled: (id: string, enabled: boolean) => Promise<SyncProfile | undefined>;
  syncNow: (id: string) => Promise<number>;
  clearQueue: (id: string) => Promise<void>;
  saveWorkspace: (input: ServerWorkspaceInput) => Promise<ServerWorkspace>;
  deleteWorkspace: (id: string) => Promise<void>;
  syncWorkspaceRule: (workspaceId: string, ruleId: string) => Promise<number>;
  syncWorkspace: (workspaceId: string) => Promise<number>;
  clearWorkspaceRuleQueue: (workspaceId: string, ruleId: string) => Promise<void>;
  testConnection: (id: string) => Promise<ConnectionTestResult>;
  testConnectionInput: (input: ProfileInput) => Promise<ConnectionTestResult>;
  selectLocalDirectory: (currentPath?: string) => Promise<string | undefined>;
  selectPrivateKeyFile: (currentPath?: string) => Promise<string | undefined>;
  listRemoteDirectories: (input: ProfileInput, remotePath: string) => Promise<RemoteDirectoryListing>;
  scanDownloadDiff: (input: ProfileInput) => Promise<DownloadPreview>;
  downloadDiffs: (input: ProfileInput, diffs: DownloadDiff[]) => Promise<DownloadResult>;
  suggestIgnoreRules: (localPath: string) => Promise<IgnoreRuleScanResult>;
  onSnapshotChanged: (callback: (snapshot: AppSnapshot) => void) => () => void;
}

export const DEFAULT_IGNORE_RULES = [
  ".git/",
  "node_modules/",
  "dist/",
  "build/",
  ".next/",
  ".nuxt/",
  "vendor/",
  "coverage/",
  ".cache/",
  "storage/logs/",
  "*.log",
  ".env",
  ".env.*",
  "*.pem",
  "*.key"
];

export function workspaceRuleProfileId(workspaceId: string, ruleId: string): string {
  return `workspace:${workspaceId}:${ruleId}`;
}

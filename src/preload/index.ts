import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSnapshot,
  CodeDeployerApi,
  ConnectionTestResult,
  ProfileInput,
  ServerWorkspace,
  ServerWorkspaceInput,
  SyncProfile
} from "../shared/types";

const api: CodeDeployerApi = {
  getSnapshot: (): Promise<AppSnapshot> => ipcRenderer.invoke("app:snapshot"),
  saveProfile: (input: ProfileInput): Promise<SyncProfile> => ipcRenderer.invoke("profiles:save", input),
  deleteProfile: (id: string): Promise<void> => ipcRenderer.invoke("profiles:delete", id),
  setProfileEnabled: (id: string, enabled: boolean): Promise<SyncProfile | undefined> =>
    ipcRenderer.invoke("profiles:set-enabled", id, enabled),
  syncNow: (id: string): Promise<number> => ipcRenderer.invoke("sync:now", id),
  clearQueue: (id: string): Promise<void> => ipcRenderer.invoke("queue:clear", id),
  saveWorkspace: (input: ServerWorkspaceInput): Promise<ServerWorkspace> => ipcRenderer.invoke("workspaces:save", input),
  deleteWorkspace: (id: string): Promise<void> => ipcRenderer.invoke("workspaces:delete", id),
  syncWorkspaceRule: (workspaceId: string, ruleId: string): Promise<number> =>
    ipcRenderer.invoke("workspaces:sync-rule", workspaceId, ruleId),
  syncWorkspace: (workspaceId: string): Promise<number> => ipcRenderer.invoke("workspaces:sync", workspaceId),
  clearWorkspaceRuleQueue: (workspaceId: string, ruleId: string): Promise<void> =>
    ipcRenderer.invoke("workspaces:clear-rule-queue", workspaceId, ruleId),
  testConnection: (id: string): Promise<ConnectionTestResult> => ipcRenderer.invoke("connection:test", id),
  testConnectionInput: (input: ProfileInput): Promise<ConnectionTestResult> => ipcRenderer.invoke("connection:test-input", input),
  selectLocalDirectory: (currentPath?: string) => ipcRenderer.invoke("dialog:select-local-directory", currentPath),
  selectPrivateKeyFile: (currentPath?: string) => ipcRenderer.invoke("dialog:select-private-key-file", currentPath),
  listRemoteDirectories: (input: ProfileInput, remotePath: string) =>
    ipcRenderer.invoke("remote:list-directories", input, remotePath),
  scanDownloadDiff: (input: ProfileInput) => ipcRenderer.invoke("download:scan", input),
  downloadDiffs: (input: ProfileInput, diffs) => ipcRenderer.invoke("download:diffs", input, diffs),
  suggestIgnoreRules: (localPath: string) => ipcRenderer.invoke("ignore:suggest", localPath),
  onSnapshotChanged: (callback: (snapshot: AppSnapshot) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot) => callback(snapshot);
    ipcRenderer.on("app:snapshot-changed", listener);
    return () => ipcRenderer.off("app:snapshot-changed", listener);
  }
};

contextBridge.exposeInMainWorld("codedeployer", api);

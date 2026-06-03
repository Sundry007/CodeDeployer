import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSnapshot,
  CodeDeployerApi,
  ConnectionTestResult,
  ProfileInput,
  SyncProfile
} from "../shared/types";

const api: CodeDeployerApi = {
  getSnapshot: (): Promise<AppSnapshot> => ipcRenderer.invoke("app:snapshot"),
  saveProfile: (input: ProfileInput): Promise<SyncProfile> => ipcRenderer.invoke("profiles:save", input),
  deleteProfile: (id: string): Promise<void> => ipcRenderer.invoke("profiles:delete", id),
  setProfileEnabled: (id: string, enabled: boolean): Promise<SyncProfile | undefined> =>
    ipcRenderer.invoke("profiles:set-enabled", id, enabled),
  syncNow: (id: string): Promise<number> => ipcRenderer.invoke("sync:now", id),
  testConnection: (id: string): Promise<ConnectionTestResult> => ipcRenderer.invoke("connection:test", id),
  selectLocalDirectory: (currentPath?: string) => ipcRenderer.invoke("dialog:select-local-directory", currentPath),
  selectPrivateKeyFile: (currentPath?: string) => ipcRenderer.invoke("dialog:select-private-key-file", currentPath),
  listRemoteDirectories: (input: ProfileInput, remotePath: string) =>
    ipcRenderer.invoke("remote:list-directories", input, remotePath),
  onSnapshotChanged: (callback: (snapshot: AppSnapshot) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: AppSnapshot) => callback(snapshot);
    ipcRenderer.on("app:snapshot-changed", listener);
    return () => ipcRenderer.off("app:snapshot-changed", listener);
  }
};

contextBridge.exposeInMainWorld("codedeployer", api);

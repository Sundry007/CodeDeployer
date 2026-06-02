import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, protocol, Tray } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AppSnapshot,
  CredentialStatus,
  DownloadDiff,
  ProfileInput,
  ProfileSecretInput,
  ServerWorkspace,
  ServerWorkspaceInput,
  SyncProfile
} from "../shared/types";
import { workspaceRuleProfileId } from "../shared/types";
import { LogStore } from "./storage/log-store";
import { ProfileStore } from "./storage/profile-store";
import { SecretStore } from "./storage/secret-store";
import { WorkspaceStore, workspaceToSyncProfiles } from "./storage/workspace-store";
import { downloadDiffs, scanDownloadDiff } from "./sync/download-planner";
import { suggestIgnoreRules } from "./sync/ignore-suggester";
import { listRemoteDirectories, testTransferConnection } from "./sync/transfer-client";
import { SyncManager, type SyncProfileSource } from "./sync/sync-manager";

let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let isQuitting = false;
let syncManager: SyncManager;
let profileStore: ProfileStore;
let secretStore: SecretStore;
let logStore: LogStore;
let workspaceStore: WorkspaceStore;

const APP_PROTOCOL = "codedeployer";

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

class CombinedProfileSource implements SyncProfileSource {
  constructor(
    private readonly profiles: ProfileStore,
    private readonly workspaces: WorkspaceStore
  ) {}

  async list(): Promise<SyncProfile[]> {
    return [...(await this.profiles.list()), ...(await this.workspaces.toSyncProfiles())];
  }
}

async function bootstrap(): Promise<void> {
  const userDataPath = app.getPath("userData");
  profileStore = new ProfileStore(path.join(userDataPath, "profiles.json"));
  workspaceStore = new WorkspaceStore(path.join(userDataPath, "workspaces.json"));
  secretStore = new SecretStore(path.join(userDataPath, "secrets.json"));
  logStore = new LogStore(path.join(userDataPath, "logs.json"));

  syncManager = new SyncManager(new CombinedProfileSource(profileStore, workspaceStore), secretStore, logStore, () => {
    void broadcastSnapshot();
  });

  registerIpc();
  registerAppProtocol();
  createMainWindow();
  createTray();

  await syncManager.start();
  await broadcastSnapshot();
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 520,
    title: "CodeDeployer",
    icon: getAppIcon(),
    backgroundColor: "#f6f7f8",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadURL(`${APP_PROTOCOL}://renderer/index.html`);
  }
}

function registerAppProtocol(): void {
  protocol.handle(APP_PROTOCOL, (request) => {
    const rendererRoot = path.normalize(path.join(__dirname, "../renderer"));
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const filePath = path.normalize(path.join(rendererRoot, pathname));
    const relativePath = path.relative(rendererRoot, filePath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return new Response("Not found", { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createTray(): void {
  tray = new Tray(getAppIcon());
  tray.setToolTip("CodeDeployer");
  updateTrayMenu();
}

function updateTrayMenu(): void {
  if (!tray) {
    return;
  }

  const menu = Menu.buildFromTemplate([
    {
      label: "打开 CodeDeployer / Open CodeDeployer",
      click: () => showMainWindow()
    },
    {
      label: "同步所有运行中的映射 / Sync all running profiles",
      click: async () => {
        const profiles = [...(await profileStore.list()), ...(await workspaceStore.toSyncProfiles())];
        await Promise.all(profiles.filter((profile) => profile.enabled).map((profile) => syncManager.syncNow(profile.id)));
      }
    },
    { type: "separator" },
    {
      label: "退出 / Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(menu);
}

function showMainWindow(): void {
  if (!mainWindow) {
    createMainWindow();
  }

  mainWindow?.show();
  mainWindow?.focus();
}

function registerIpc(): void {
  ipcMain.handle("app:snapshot", () => createSnapshot());

  ipcMain.handle("profiles:list", () => profileStore.list());

  ipcMain.handle("profiles:save", async (_event, input: ProfileInput) => {
    const profile = await profileStore.save(input);
    await secretStore.save(profile.id, input.secret);
    await syncManager.reloadProfile(profile.id);
    await broadcastSnapshot();
    return withProfileSecretStatus(profile);
  });

  ipcMain.handle("profiles:delete", async (_event, id: string) => {
    await profileStore.delete(id);
    await secretStore.delete(id);
    await syncManager.reloadProfile(id);
    await broadcastSnapshot();
  });

  ipcMain.handle("profiles:set-enabled", async (_event, id: string, enabled: boolean) => {
    const profile = await profileStore.setEnabled(id, enabled);

    if (profile) {
      await syncManager.reloadProfile(profile.id, { preserveQueue: true });
    }

    await broadcastSnapshot();
    return profile;
  });

  ipcMain.handle("sync:now", (_event, id: string) => syncManager.syncNow(id));
  ipcMain.handle("queue:clear", (_event, id: string) => syncManager.clearQueue(id));
  ipcMain.handle("workspaces:save", async (_event, input: ServerWorkspaceInput) => {
    const beforeProfiles = input.id ? await workspaceToRuntimeProfiles(input.id) : [];
    const workspace = await workspaceStore.save(input);
    await secretStore.save(workspace.id, input.secret);
    const afterProfiles = workspaceToSyncProfiles(workspace);
    await reloadRuntimeProfiles([...beforeProfiles, ...afterProfiles]);
    await broadcastSnapshot();
    return withWorkspaceSecretStatus(workspace);
  });

  ipcMain.handle("workspaces:delete", async (_event, id: string) => {
    const beforeProfiles = await workspaceToRuntimeProfiles(id);
    await workspaceStore.delete(id);
    await secretStore.delete(id);
    await reloadRuntimeProfiles(beforeProfiles);
    await broadcastSnapshot();
  });

  ipcMain.handle("workspaces:sync-rule", (_event, workspaceId: string, ruleId: string) =>
    syncManager.syncNow(workspaceRuleProfileId(workspaceId, ruleId))
  );

  ipcMain.handle("workspaces:sync", async (_event, workspaceId: string) => {
    const workspace = (await workspaceStore.list()).find((item) => item.id === workspaceId);

    if (!workspace || !workspace.enabled) {
      return 0;
    }

    const counts = await Promise.all(
      workspace.rules
        .filter((rule) => rule.enabled)
        .map((rule) => syncManager.syncNow(workspaceRuleProfileId(workspace.id, rule.id)))
    );

    return counts.reduce((total, count) => total + count, 0);
  });

  ipcMain.handle("workspaces:clear-rule-queue", (_event, workspaceId: string, ruleId: string) =>
    syncManager.clearQueue(workspaceRuleProfileId(workspaceId, ruleId))
  );

  ipcMain.handle("connection:test", (_event, id: string) => syncManager.testConnection(id));
  ipcMain.handle("connection:test-input", async (_event, input: ProfileInput) => {
    const profile = toTransientProfile(input);

    try {
      await testTransferConnection(profile, await mergeSecrets(input.id, input.secret));
      return { ok: true, message: "Connection test passed." };
    } catch (error) {
      return { ok: false, message: formatError(error) };
    }
  });
  ipcMain.handle("logs:list", () => logStore.list());

  ipcMain.handle("dialog:select-local-directory", async (_event, currentPath?: string) => {
    const options: Electron.OpenDialogOptions = {
      title: "选择本地目录 / Select local directory",
      defaultPath: currentPath || app.getPath("documents"),
      properties: ["openDirectory", "createDirectory"]
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

    return result.canceled ? undefined : result.filePaths[0];
  });

  ipcMain.handle("dialog:select-private-key-file", async (_event, currentPath?: string) => {
    const options: Electron.OpenDialogOptions = {
      title: "选择私钥文件 / Select private key file",
      defaultPath: currentPath || app.getPath("home"),
      filters: [
        { name: "SSH private keys", extensions: ["pem", "key", "ppk", "*"] },
        { name: "All files", extensions: ["*"] }
      ],
      properties: ["openFile"]
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

    return result.canceled ? undefined : result.filePaths[0];
  });

  ipcMain.handle("remote:list-directories", async (_event, input: ProfileInput, remotePath: string) => {
    const profile = toTransientProfile(input);
    const secret = await mergeSecrets(input.id, input.secret);
    return listRemoteDirectories(profile, secret, remotePath);
  });

  ipcMain.handle("download:scan", async (_event, input: ProfileInput) => {
    const profile = toTransientProfile(input);
    return scanDownloadDiff(profile, await mergeSecrets(input.id, input.secret));
  });

  ipcMain.handle("download:diffs", async (_event, input: ProfileInput, diffs: DownloadDiff[]) => {
    const profile = toTransientProfile(input);
    const result = await downloadDiffs(profile, await mergeSecrets(input.id, input.secret), diffs);
    await logStore.append({
      profileId: profile.id,
      profileName: profile.name,
      level: result.failed.length > 0 ? "warning" : "success",
      event: "download",
      message: `Downloaded ${result.downloaded} remote file(s).`,
      error: result.failed.length > 0 ? `${result.failed.length} file(s) failed.` : undefined
    });
    await broadcastSnapshot();
    return result;
  });

  ipcMain.handle("ignore:suggest", (_event, localPath: string) => suggestIgnoreRules(localPath));
}

async function broadcastSnapshot(): Promise<void> {
  if (!syncManager) {
    return;
  }

  const snapshot = await createSnapshot();

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("app:snapshot-changed", snapshot);
  }
}

async function createSnapshot(): Promise<AppSnapshot> {
  const profiles = await Promise.all((await profileStore.list()).map((profile) => withProfileSecretStatus(profile)));
  const workspaces = await Promise.all((await workspaceStore.list()).map((workspace) => withWorkspaceSecretStatus(workspace)));

  return {
    profiles,
    workspaces,
    statuses: syncManager.getStatuses(),
    logs: await logStore.list()
  };
}

async function withProfileSecretStatus(profile: SyncProfile): Promise<SyncProfile> {
  return {
    ...profile,
    secretStatus: await getCredentialStatus(profile.id)
  };
}

async function withWorkspaceSecretStatus(workspace: ServerWorkspace): Promise<ServerWorkspace> {
  return {
    ...workspace,
    secretStatus: await getCredentialStatus(workspace.id)
  };
}

async function getCredentialStatus(id: string): Promise<CredentialStatus> {
  const secret = await secretStore.get(id);

  return {
    hasPassword: Boolean(secret.password),
    hasPrivateKeyPassphrase: Boolean(secret.privateKeyPassphrase)
  };
}

async function workspaceToRuntimeProfiles(workspaceId: string): Promise<SyncProfile[]> {
  const workspace = (await workspaceStore.list()).find((item) => item.id === workspaceId);
  return workspace ? workspaceToSyncProfiles(workspace) : [];
}

async function reloadRuntimeProfiles(profiles: SyncProfile[]): Promise<void> {
  const ids = Array.from(new Set(profiles.map((profile) => profile.id)));

  for (const id of ids) {
    await syncManager.reloadProfile(id);
  }
}

function getAppIcon(): Electron.NativeImage {
  const icon = nativeImage.createFromPath(getAssetPath("icon.ico"));
  return icon.isEmpty() ? createFallbackIcon() : icon;
}

function getAssetPath(fileName: string): string {
  return app.isPackaged ? path.join(process.resourcesPath, fileName) : path.join(app.getAppPath(), "assets", fileName);
}

function createFallbackIcon(): Electron.NativeImage {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 512 512">
      <defs>
        <linearGradient id="bg" x1="64" y1="56" x2="448" y2="456" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#0f766e"/>
          <stop offset="0.58" stop-color="#0b4f54"/>
          <stop offset="1" stop-color="#17313a"/>
        </linearGradient>
        <linearGradient id="arrow" x1="132" y1="290" x2="326" y2="222" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#facc15"/>
          <stop offset="1" stop-color="#fb923c"/>
        </linearGradient>
      </defs>
      <rect x="24" y="24" width="464" height="464" rx="92" fill="url(#bg)"/>
      <path d="M163 161 95 256l68 95" fill="none" stroke="#f8fafc" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M211 173 177 339" fill="none" stroke="#a7f3d0" stroke-width="26" stroke-linecap="round"/>
      <path d="M132 286c42 18 83 16 122-6 29-17 52-42 78-68" fill="none" stroke="url(#arrow)" stroke-width="30" stroke-linecap="round"/>
      <path d="M330 211 323 271 378 248Z" fill="#fb923c"/>
      <rect x="308" y="142" width="104" height="56" rx="17" fill="#f8fafc"/>
      <rect x="308" y="224" width="104" height="56" rx="17" fill="#f8fafc"/>
      <rect x="308" y="306" width="104" height="56" rx="17" fill="#f8fafc"/>
      <circle cx="335" cy="170" r="8" fill="#14b8a6"/>
      <circle cx="335" cy="252" r="8" fill="#14b8a6"/>
      <circle cx="335" cy="334" r="8" fill="#14b8a6"/>
      <path d="M354 170h38M354 252h38M354 334h38" stroke="#17313a" stroke-width="10" stroke-linecap="round" opacity="0.64"/>
    </svg>
  `);

  return nativeImage.createFromDataURL(`data:image/svg+xml;charset=UTF-8,${svg}`);
}

function toTransientProfile(input: ProfileInput): SyncProfile {
  const now = new Date().toISOString();

  return {
    id: input.id || "draft",
    name: input.name || "Draft",
    enabled: input.enabled,
    localPath: input.localPath || ".",
    remote: {
      protocol: input.remote.protocol ?? "sftp",
      host: input.remote.host,
      port: Number(input.remote.port) || (input.remote.protocol === "ftp" ? 21 : 22),
      username: input.remote.username,
      authMode: input.remote.authMode,
      remotePath: input.remote.remotePath || "/",
      privateKeyPath: input.remote.privateKeyPath
    },
    ignore: input.ignore,
    deleteRemote: input.deleteRemote,
    concurrency: input.concurrency || 1,
    createdAt: now,
    updatedAt: now
  };
}

async function mergeSecrets(profileId?: string, incoming?: ProfileSecretInput): Promise<ProfileSecretInput> {
  const saved = profileId ? await secretStore.get(profileId) : {};
  return {
    ...saved,
    ...compactSecret(incoming)
  };
}

function compactSecret(input?: ProfileSecretInput): ProfileSecretInput {
  return {
    ...(input?.password?.trim() ? { password: input.password.trim() } : {}),
    ...(input?.privateKeyPassphrase?.trim() ? { privateKeyPassphrase: input.privateKeyPassphrase.trim() } : {})
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

app.whenReady().then(() => {
  void bootstrap();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  } else {
    showMainWindow();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("quit", () => {
  void syncManager?.stop();
});

import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronUp,
  Clock,
  Folder,
  FolderOpen,
  KeyRound,
  Pause,
  Play,
  Plus,
  RotateCw,
  Save,
  Server,
  Shield,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  AppSnapshot,
  AuthMode,
  ProfileInput,
  RemoteDirectoryEntry,
  SyncLog,
  SyncProfile,
  SyncStatus,
  TransferProtocol
} from "../shared/types";
import { DEFAULT_IGNORE_RULES } from "../shared/types";

interface ProfileFormState {
  id?: string;
  name: string;
  enabled: boolean;
  localPath: string;
  protocol: TransferProtocol;
  host: string;
  port: string;
  username: string;
  authMode: AuthMode;
  remotePath: string;
  privateKeyPath: string;
  password: string;
  privateKeyPassphrase: string;
  ignoreText: string;
  deleteRemote: boolean;
  concurrency: string;
}

interface RemoteBrowserState {
  open: boolean;
  loading: boolean;
  path: string;
  parentPath?: string;
  directories: RemoteDirectoryEntry[];
  error?: string;
}

const emptySnapshot: AppSnapshot = {
  profiles: [],
  statuses: [],
  logs: []
};

export function App(): JSX.Element {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(emptySnapshot);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [form, setForm] = useState<ProfileFormState>(() => createEmptyForm());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [remoteBrowser, setRemoteBrowser] = useState<RemoteBrowserState>({
    open: false,
    loading: false,
    path: "/",
    directories: []
  });

  useEffect(() => {
    let mounted = true;

    window.codedeployer.getSnapshot().then((nextSnapshot) => {
      if (!mounted) {
        return;
      }

      setSnapshot(nextSnapshot);
      const firstProfile = nextSnapshot.profiles[0];

      if (firstProfile) {
        setSelectedId(firstProfile.id);
        setForm(profileToForm(firstProfile));
      }
    });

    const unsubscribe = window.codedeployer.onSnapshotChanged((nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const statusByProfile = useMemo(() => {
    return new Map(snapshot.statuses.map((status) => [status.profileId, status]));
  }, [snapshot.statuses]);

  const selectedProfile = snapshot.profiles.find((profile) => profile.id === selectedId);
  const selectedStatus = selectedId ? statusByProfile.get(selectedId) : undefined;
  const profileLogs = selectedId
    ? snapshot.logs.filter((log) => log.profileId === selectedId).slice(0, 12)
    : snapshot.logs.slice(0, 12);

  function beginNewProfile(): void {
    setSelectedId(undefined);
    setForm(createEmptyForm());
    setNotice(undefined);
  }

  function selectProfile(profile: SyncProfile): void {
    setSelectedId(profile.id);
    setForm(profileToForm(profile));
    setNotice(undefined);
  }

  async function saveProfile(): Promise<void> {
    setBusy(true);
    setNotice(undefined);

    try {
      const saved = await window.codedeployer.saveProfile(formToInput(form));
      setSelectedId(saved.id);
      setForm(profileToForm(saved));
      setNotice(t("映射已保存。", "Profile saved."));
    } catch (error) {
      setNotice(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function deleteProfile(): Promise<void> {
    if (!form.id) {
      return;
    }

    setBusy(true);
    setNotice(undefined);

    try {
      await window.codedeployer.deleteProfile(form.id);
      beginNewProfile();
      setNotice(t("映射已删除。", "Profile deleted."));
    } catch (error) {
      setNotice(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(profile: SyncProfile): Promise<void> {
    setBusy(true);

    try {
      const updated = await window.codedeployer.setProfileEnabled(profile.id, !profile.enabled);

      if (updated) {
        setForm(profileToForm(updated));
      }
    } finally {
      setBusy(false);
    }
  }

  async function syncNow(profileId: string): Promise<void> {
    setBusy(true);
    setNotice(undefined);

    try {
      const count = await window.codedeployer.syncNow(profileId);
      setNotice(t(`已加入 ${count} 个文件。`, `Queued ${count} file(s).`));
    } catch (error) {
      setNotice(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function testConnection(profileId: string): Promise<void> {
    setBusy(true);
    setNotice(undefined);

    try {
      const result = await window.codedeployer.testConnection(profileId);
      setNotice(result.ok ? t("连接测试通过。", "Connection test passed.") : result.message);
    } catch (error) {
      setNotice(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function chooseLocalDirectory(): Promise<void> {
    const selectedPath = await window.codedeployer.selectLocalDirectory(form.localPath || undefined);

    if (selectedPath) {
      updateForm("localPath", selectedPath);
    }
  }

  async function choosePrivateKeyFile(): Promise<void> {
    const selectedPath = await window.codedeployer.selectPrivateKeyFile(form.privateKeyPath || undefined);

    if (selectedPath) {
      updateForm("privateKeyPath", selectedPath);
    }
  }

  async function openRemoteBrowser(): Promise<void> {
    await loadRemoteDirectories(form.remotePath || "/");
  }

  async function loadRemoteDirectories(remotePath: string): Promise<void> {
    setRemoteBrowser((current) => ({
      ...current,
      open: true,
      loading: true,
      path: remotePath || "/",
      error: undefined
    }));

    try {
      const listing = await window.codedeployer.listRemoteDirectories(formToInput(form), remotePath || "/");
      setRemoteBrowser({
        open: true,
        loading: false,
        path: listing.path,
        parentPath: listing.parentPath,
        directories: listing.directories
      });
    } catch (error) {
      setRemoteBrowser((current) => ({
        ...current,
        open: true,
        loading: false,
        error: formatError(error)
      }));
    }
  }

  function selectRemotePath(path: string): void {
    updateForm("remotePath", path);
    setRemoteBrowser((current) => ({ ...current, open: false }));
  }

  return (
    <main className="app-shell">
      <section className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">CD</div>
          <div>
            <h1>CodeDeployer</h1>
            <p>{t(`${snapshot.profiles.length} 个映射`, `${snapshot.profiles.length} mappings`)}</p>
          </div>
        </div>

        <button className="primary-action" type="button" onClick={beginNewProfile}>
          <Plus size={16} />
          {t("新增映射", "Add mapping")}
        </button>

        <div className="profile-list">
          {snapshot.profiles.map((profile) => (
            <button
              className={`profile-row ${profile.id === selectedId ? "selected" : ""}`}
              key={profile.id}
              type="button"
              onClick={() => selectProfile(profile)}
            >
              <StatusDot status={statusByProfile.get(profile.id)} />
              <span>
                <strong>{profile.name}</strong>
                <small>{profile.remote.host}</small>
              </span>
            </button>
          ))}

          {snapshot.profiles.length === 0 ? (
            <div className="empty-state">{t("还没有映射。", "No mappings yet.")}</div>
          ) : null}
        </div>
      </section>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h2>{form.id ? form.name || t("映射", "Mapping") : t("新映射", "New mapping")}</h2>
            <p>{selectedStatus ? statusLabel(selectedStatus) : t("草稿", "Draft")}</p>
          </div>

          <div className="toolbar">
            {selectedProfile ? (
              <>
                <button type="button" onClick={() => toggleEnabled(selectedProfile)} disabled={busy}>
                  {selectedProfile.enabled ? <Pause size={16} /> : <Play size={16} />}
                  {selectedProfile.enabled ? t("暂停", "Pause") : t("恢复", "Resume")}
                </button>
                <button type="button" onClick={() => syncNow(selectedProfile.id)} disabled={busy || !selectedProfile.enabled}>
                  <RotateCw size={16} />
                  {t("立即同步", "Sync now")}
                </button>
                <button type="button" onClick={() => testConnection(selectedProfile.id)} disabled={busy}>
                  <Activity size={16} />
                  {t("测试连接", "Test")}
                </button>
              </>
            ) : null}
            <button className="save-button" type="button" onClick={saveProfile} disabled={busy}>
              <Save size={16} />
              {t("保存", "Save")}
            </button>
          </div>
        </header>

        <div className="content-grid">
          <section className="editor-panel">
            <PanelHeading icon={<Folder size={18} />} title={t("映射", "Mapping")} />
            <div className="form-grid">
              <Field label={t("名称", "Name")}>
                <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
              </Field>
              <Field label={t("本地目录", "Local directory")}>
                <div className="input-action">
                  <input value={form.localPath} onChange={(event) => updateForm("localPath", event.target.value)} />
                  <button type="button" onClick={chooseLocalDirectory}>
                    <FolderOpen size={16} />
                    {t("选择", "Choose")}
                  </button>
                </div>
              </Field>
              <Field label={t("服务器目录", "Remote directory")}>
                <div className="input-action">
                  <input value={form.remotePath} onChange={(event) => updateForm("remotePath", event.target.value)} />
                  <button type="button" onClick={openRemoteBrowser} disabled={busy || !form.host || !form.username}>
                    <FolderOpen size={16} />
                    {t("浏览", "Browse")}
                  </button>
                </div>
              </Field>
              <Field label={t("并发数", "Concurrency")}>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={form.concurrency}
                  onChange={(event) => updateForm("concurrency", event.target.value)}
                />
              </Field>
            </div>

            <PanelHeading icon={<Server size={18} />} title={t("服务器", "Server")} />
            <div className="form-grid server-grid">
              <Field label={t("主机", "Host")}>
                <input value={form.host} onChange={(event) => updateForm("host", event.target.value)} />
              </Field>
              <Field label={t("端口", "Port")}>
                <input value={form.port} onChange={(event) => updateForm("port", event.target.value)} />
              </Field>
              <Field label={t("用户名", "Username")}>
                <input value={form.username} onChange={(event) => updateForm("username", event.target.value)} />
              </Field>
              <Field label={t("认证方式", "Auth mode")}>
                <select value={form.authMode} onChange={(event) => updateForm("authMode", event.target.value as AuthMode)}>
                  <option value="privateKey">{t("私钥", "Private key")}</option>
                  <option value="password">{t("密码", "Password")}</option>
                </select>
              </Field>
            </div>

            <PanelHeading icon={<KeyRound size={18} />} title={t("凭据", "Credentials")} />
            {form.authMode === "privateKey" ? (
              <div className="form-grid">
                <Field label={t("私钥文件", "Private key file")}>
                  <div className="input-action">
                    <input value={form.privateKeyPath} onChange={(event) => updateForm("privateKeyPath", event.target.value)} />
                    <button type="button" onClick={choosePrivateKeyFile}>
                      <FolderOpen size={16} />
                      {t("选择", "Choose")}
                    </button>
                  </div>
                </Field>
                <Field label={t("私钥口令", "Passphrase")}>
                  <input
                    type="password"
                    value={form.privateKeyPassphrase}
                    onChange={(event) => updateForm("privateKeyPassphrase", event.target.value)}
                  />
                </Field>
              </div>
            ) : (
              <div className="form-grid">
                <Field label={t("密码", "Password")}>
                  <input type="password" value={form.password} onChange={(event) => updateForm("password", event.target.value)} />
                </Field>
              </div>
            )}

            <PanelHeading icon={<Shield size={18} />} title={t("规则", "Rules")} />
            <div className="split-options">
              <label className="toggle-row">
                <input checked={form.enabled} type="checkbox" onChange={(event) => updateForm("enabled", event.target.checked)} />
                {t("启用", "Enabled")}
              </label>
              <label className="toggle-row danger">
                <input
                  checked={form.deleteRemote}
                  type="checkbox"
                  onChange={(event) => updateForm("deleteRemote", event.target.checked)}
                />
                {t("删除远程文件", "Delete remote files")}
              </label>
            </div>
            <Field label={t("忽略规则", "Ignore rules")}>
              <textarea value={form.ignoreText} onChange={(event) => updateForm("ignoreText", event.target.value)} />
            </Field>

            <div className="editor-actions">
              <button className="save-button" type="button" onClick={saveProfile} disabled={busy}>
                <Save size={16} />
                {t("保存映射", "Save profile")}
              </button>
              {form.id ? (
                <button className="danger-button" type="button" onClick={deleteProfile} disabled={busy}>
                  <Trash2 size={16} />
                  {t("删除", "Delete")}
                </button>
              ) : null}
              {notice ? <span className="notice">{notice}</span> : null}
            </div>
          </section>

          <aside className="activity-panel">
            <section className="status-panel">
              <PanelHeading icon={<Activity size={18} />} title={t("状态", "Status")} />
              <StatusSummary status={selectedStatus} profile={selectedProfile} />
            </section>

            <section className="logs-panel">
              <PanelHeading icon={<Clock size={18} />} title={t("传输日志", "Transfer logs")} />
              <div className="log-list">
                {profileLogs.map((log) => (
                  <LogRow key={log.id} log={log} />
                ))}
                {profileLogs.length === 0 ? <div className="empty-state">{t("暂无日志。", "No logs yet.")}</div> : null}
              </div>
            </section>
          </aside>
        </div>
      </section>

      {remoteBrowser.open ? (
        <RemoteDirectoryBrowser
          state={remoteBrowser}
          onClose={() => setRemoteBrowser((current) => ({ ...current, open: false }))}
          onOpenPath={loadRemoteDirectories}
          onSelect={selectRemotePath}
        />
      ) : null}
    </main>
  );

  function updateForm<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }
}

function RemoteDirectoryBrowser({
  state,
  onClose,
  onOpenPath,
  onSelect
}: {
  state: RemoteBrowserState;
  onClose: () => void;
  onOpenPath: (path: string) => Promise<void>;
  onSelect: (path: string) => void;
}): JSX.Element {
  return (
    <div className="modal-backdrop">
      <section className="remote-browser" role="dialog" aria-modal="true">
        <header className="remote-browser-header">
          <div>
            <h3>{t("选择服务器目录", "Select remote directory")}</h3>
            <p>{state.path}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("关闭", "Close")}>
            <X size={16} />
          </button>
        </header>

        <div className="remote-browser-actions">
          <button type="button" onClick={() => state.parentPath && onOpenPath(state.parentPath)} disabled={!state.parentPath || state.loading}>
            <ChevronUp size={16} />
            {t("上级", "Up")}
          </button>
          <button type="button" onClick={() => onOpenPath(state.path)} disabled={state.loading}>
            <RotateCw size={16} />
            {t("刷新", "Refresh")}
          </button>
          <button className="save-button" type="button" onClick={() => onSelect(state.path)} disabled={state.loading}>
            <CheckCircle2 size={16} />
            {t("选择当前目录", "Select current")}
          </button>
        </div>

        {state.error ? <div className="browser-error">{state.error}</div> : null}
        {state.loading ? <div className="empty-state">{t("正在读取目录...", "Loading directories...")}</div> : null}

        {!state.loading ? (
          <div className="directory-list">
            {state.directories.map((directory) => (
              <button key={directory.path} type="button" onClick={() => onOpenPath(directory.path)}>
                <Folder size={16} />
                <span>{directory.name}</span>
              </button>
            ))}
            {state.directories.length === 0 && !state.error ? (
              <div className="empty-state">{t("没有子目录。", "No subdirectories.")}</div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function PanelHeading({ icon, title }: { icon: JSX.Element; title: string }): JSX.Element {
  return (
    <div className="panel-heading">
      {icon}
      <h3>{title}</h3>
    </div>
  );
}

function Field({ label, children }: { label: string; children: JSX.Element }): JSX.Element {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function StatusSummary({ status, profile }: { status?: SyncStatus; profile?: SyncProfile }): JSX.Element {
  if (!profile) {
    return <div className="summary-box muted">{t("草稿映射", "Draft profile")}</div>;
  }

  if (!status) {
    return <div className="summary-box muted">{t("暂无运行状态", "No runtime status")}</div>;
  }

  return (
    <div className={`summary-box ${status.state}`}>
      <div className="summary-main">
        {status.state === "error" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
        <strong>{stateName(status.state)}</strong>
      </div>
      <dl>
        <div>
          <dt>{t("队列", "Queue")}</dt>
          <dd>{status.queueSize}</dd>
        </div>
        <div>
          <dt>{t("传输中", "Active")}</dt>
          <dd>{status.activeUploads}</dd>
        </div>
        <div>
          <dt>{t("上次同步", "Last sync")}</dt>
          <dd>{status.lastSyncAt ? formatTime(status.lastSyncAt) : t("无", "None")}</dd>
        </div>
      </dl>
      {status.error ? <p className="status-error">{status.error}</p> : null}
    </div>
  );
}

function StatusDot({ status }: { status?: SyncStatus }): JSX.Element {
  return <span className={`status-dot ${status?.state ?? "idle"}`} />;
}

function LogRow({ log }: { log: SyncLog }): JSX.Element {
  return (
    <article className={`log-row ${log.level}`}>
      <div>
        <strong>{bilingualLogMessage(log.message)}</strong>
        <small>{[log.profileName, log.localPath].filter(Boolean).join(" | ")}</small>
        {log.error ? <em>{log.error}</em> : null}
      </div>
      <time>{formatTime(log.timestamp)}</time>
    </article>
  );
}

function createEmptyForm(): ProfileFormState {
  return {
    name: "",
    enabled: true,
    localPath: "",
    protocol: "sftp",
    host: "",
    port: "22",
    username: "deploy",
    authMode: "privateKey",
    remotePath: "/",
    privateKeyPath: "",
    password: "",
    privateKeyPassphrase: "",
    ignoreText: DEFAULT_IGNORE_RULES.join("\n"),
    deleteRemote: false,
    concurrency: "2"
  };
}

function profileToForm(profile: SyncProfile): ProfileFormState {
  return {
    id: profile.id,
    name: profile.name,
    enabled: profile.enabled,
    localPath: profile.localPath,
    protocol: profile.remote.protocol ?? "sftp",
    host: profile.remote.host,
    port: String(profile.remote.port),
    username: profile.remote.username,
    authMode: profile.remote.authMode,
    remotePath: profile.remote.remotePath,
    privateKeyPath: profile.remote.privateKeyPath ?? "",
    password: "",
    privateKeyPassphrase: "",
    ignoreText: profile.ignore.join("\n"),
    deleteRemote: profile.deleteRemote,
    concurrency: String(profile.concurrency)
  };
}

function formToInput(form: ProfileFormState): ProfileInput {
  return {
    id: form.id,
    name: form.name,
    enabled: form.enabled,
    localPath: form.localPath,
    remote: {
      protocol: form.protocol,
      host: form.host,
      port: Number(form.port) || (form.protocol === "ftp" ? 21 : 22),
      username: form.username,
      authMode: form.authMode,
      remotePath: form.remotePath || "/",
      privateKeyPath: form.privateKeyPath || undefined
    },
    ignore: form.ignoreText.split(/\r?\n/),
    deleteRemote: form.deleteRemote,
    concurrency: Number(form.concurrency) || 1,
    secret: {
      password: form.password,
      privateKeyPassphrase: form.privateKeyPassphrase
    }
  };
}

function statusLabel(status: SyncStatus): string {
  const queue = status.queueSize > 0 ? t(` | ${status.queueSize} 个排队`, ` | ${status.queueSize} queued`) : "";
  return `${stateName(status.state)}${queue}`;
}

function stateName(state: SyncStatus["state"]): string {
  const names = {
    running: t("运行中", "Running"),
    paused: t("已暂停", "Paused"),
    idle: t("空闲", "Idle"),
    error: t("错误", "Error")
  };

  return names[state];
}

function bilingualLogMessage(message: string): string {
  const messages: Record<string, string> = {
    "Watcher started.": t("监听已启动。", "Watcher started."),
    "Uploaded file.": t("文件已上传。", "Uploaded file."),
    "Upload failed.": t("上传失败。", "Upload failed."),
    "SFTP connection test passed.": t("SFTP 连接测试通过。", "SFTP connection test passed."),
    "SFTP connection test failed.": t("SFTP 连接测试失败。", "SFTP connection test failed."),
    "Watcher could not start.": t("监听无法启动。", "Watcher could not start."),
    "Watcher failed.": t("监听失败。", "Watcher failed."),
    "Local delete ignored because remote deletion is disabled.": t(
      "本地删除已忽略，因为未启用远程删除。",
      "Local delete ignored because remote deletion is disabled."
    ),
    "Deleted remote file.": t("远程文件已删除。", "Deleted remote file."),
    "Remote delete failed.": t("远程删除失败。", "Remote delete failed.")
  };

  return messages[message] ?? message;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function t(zh: string, en: string): string {
  return `${zh} / ${en}`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

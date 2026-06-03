import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  Folder,
  FolderOpen,
  ListX,
  ListPlus,
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
  DownloadDiff,
  DownloadPreview,
  DownloadResult,
  ProfileInput,
  RemoteDirectoryEntry,
  ServerWorkspace,
  ServerWorkspaceInput,
  ServerWorkspaceRule,
  SyncLog,
  SyncProfile,
  SyncStatus,
  TransferProtocol
} from "../shared/types";
import { DEFAULT_IGNORE_RULES, workspaceRuleProfileId } from "../shared/types";

type Language = "zh" | "en";
type ViewMode = "mappings" | "workspaces";

interface ProfileFormState {
  id?: string;
  name: string;
  enabled: boolean;
  protocol: TransferProtocol;
  localPath: string;
  host: string;
  port: string;
  username: string;
  authMode: AuthMode;
  remotePath: string;
  privateKeyPath: string;
  password: string;
  privateKeyPassphrase: string;
  hasSavedPassword: boolean;
  hasSavedPrivateKeyPassphrase: boolean;
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

type ConnectionCheckState =
  | { status: "idle"; message?: string }
  | { status: "checking"; message?: string }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

interface DownloadDialogState {
  open: boolean;
  scanning: boolean;
  applying: boolean;
  preview?: DownloadPreview;
  selected: Record<string, boolean>;
  error?: string;
  result?: DownloadResult;
}

interface WorkspaceRuleFormState {
  uiId: string;
  id?: string;
  name: string;
  enabled: boolean;
  localPath: string;
  remotePath: string;
  ignoreText: string;
  deleteRemote: boolean;
  concurrency: string;
}

interface WorkspaceFormState {
  id?: string;
  name: string;
  enabled: boolean;
  protocol: TransferProtocol;
  host: string;
  port: string;
  username: string;
  authMode: AuthMode;
  privateKeyPath: string;
  password: string;
  privateKeyPassphrase: string;
  hasSavedPassword: boolean;
  hasSavedPrivateKeyPassphrase: boolean;
  rules: WorkspaceRuleFormState[];
}

interface WorkspaceRemoteBrowserState extends RemoteBrowserState {
  ruleIndex?: number;
}

const emptySnapshot: AppSnapshot = {
  profiles: [],
  workspaces: [],
  statuses: [],
  logs: []
};

const DRAFT_PROFILE_ID = "__draft_profile__";
const DRAFT_WORKSPACE_ID = "__draft_workspace__";
const WORKSPACE_VERIFICATION_PREFIX = "codedeployer.workspaceConnectionVerified.";

export function App(): JSX.Element {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = window.localStorage.getItem("codedeployer.language");
    return saved === "en" ? "en" : "zh";
  });
  const [snapshot, setSnapshot] = useState<AppSnapshot>(emptySnapshot);
  const [viewMode, setViewMode] = useState<ViewMode>("mappings");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | undefined>();
  const [form, setForm] = useState<ProfileFormState>(() => createEmptyForm());
  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceFormState>(() => createEmptyWorkspaceForm());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [workspaceNotice, setWorkspaceNotice] = useState<string>();
  const [ignoreNotice, setIgnoreNotice] = useState<string>();
  const [connectionCheck, setConnectionCheck] = useState<ConnectionCheckState>({ status: "idle" });
  const [workspaceConnectionCheck, setWorkspaceConnectionCheck] = useState<ConnectionCheckState>({ status: "idle" });
  const [expandedWorkspaceRules, setExpandedWorkspaceRules] = useState<Record<string, boolean>>({});
  const [remoteBrowser, setRemoteBrowser] = useState<RemoteBrowserState>({
    open: false,
    loading: false,
    path: "/",
    directories: []
  });
  const [workspaceRemoteBrowser, setWorkspaceRemoteBrowser] = useState<WorkspaceRemoteBrowserState>({
    open: false,
    loading: false,
    path: "/",
    directories: []
  });
  const [downloadDialog, setDownloadDialog] = useState<DownloadDialogState>({
    open: false,
    scanning: false,
    applying: false,
    selected: {}
  });

  const text = (zh: string, en: string) => t(language, zh, en);

  useEffect(() => {
    window.localStorage.setItem("codedeployer.language", language);
  }, [language]);

  useEffect(() => {
    let mounted = true;

    window.codedeployer.getSnapshot().then((nextSnapshot) => {
      if (!mounted) {
        return;
      }

      setSnapshot(nextSnapshot);
      const firstProfile = nextSnapshot.profiles[0];
      const firstWorkspace = nextSnapshot.workspaces[0];

      if (firstProfile) {
        setSelectedId(firstProfile.id);
        setForm(profileToForm(firstProfile));
      } else if (firstWorkspace) {
        const nextForm = workspaceToForm(firstWorkspace);
        setViewMode("workspaces");
        setSelectedWorkspaceId(firstWorkspace.id);
        setWorkspaceForm(nextForm);
        setWorkspaceConnectionCheck(loadWorkspaceVerification(nextForm, language));
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
    ? snapshot.logs.filter((log) => log.profileId === selectedId).slice(0, 14)
    : snapshot.logs.slice(0, 14);
  const isDraftProfile = selectedId === DRAFT_PROFILE_ID && !form.id;
  const draftProfile = isDraftProfile ? formToDraftProfile(form, text("新映射", "New mapping"), text("未保存", "Unsaved")) : undefined;
  const visibleProfileCount = snapshot.profiles.length + (draftProfile ? 1 : 0);
  const selectedWorkspace = snapshot.workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const isDraftWorkspace = selectedWorkspaceId === DRAFT_WORKSPACE_ID && !workspaceForm.id;
  const draftWorkspace = isDraftWorkspace
    ? formToDraftWorkspace(workspaceForm, text("新服务器工作区", "New server workspace"))
    : undefined;
  const visibleWorkspaceCount = snapshot.workspaces.length + (draftWorkspace ? 1 : 0);
  const workspaceLogs = workspaceForm.id
    ? snapshot.logs
        .filter((log) => log.profileId.startsWith(`workspace:${workspaceForm.id}:`))
        .slice(0, 14)
    : [];

  function beginNewProfile(): void {
    setSelectedId(DRAFT_PROFILE_ID);
    setForm(createEmptyForm());
    setNotice(undefined);
    setIgnoreNotice(undefined);
    setConnectionCheck({ status: "idle" });
  }

  function selectProfile(profile: SyncProfile): void {
    setSelectedId(profile.id);
    setForm(profileToForm(profile));
    setNotice(undefined);
    setConnectionCheck({ status: "idle" });
  }

  function cancelNewProfile(): void {
    const firstProfile = snapshot.profiles[0];

    if (firstProfile) {
      selectProfile(firstProfile);
      return;
    }

    setSelectedId(undefined);
    setForm(createEmptyForm());
    setNotice(undefined);
    setIgnoreNotice(undefined);
    setConnectionCheck({ status: "idle" });
  }

  function beginNewWorkspace(): void {
    setViewMode("workspaces");
    setSelectedWorkspaceId(DRAFT_WORKSPACE_ID);
    setWorkspaceForm(createEmptyWorkspaceForm());
    setExpandedWorkspaceRules({});
    setWorkspaceNotice(undefined);
    setWorkspaceConnectionCheck({ status: "idle" });
  }

  function selectWorkspace(workspace: ServerWorkspace): void {
    const nextForm = workspaceToForm(workspace);
    setViewMode("workspaces");
    setSelectedWorkspaceId(workspace.id);
    setWorkspaceForm(nextForm);
    setExpandedWorkspaceRules({});
    setWorkspaceNotice(undefined);
    setWorkspaceConnectionCheck(loadWorkspaceVerification(nextForm, language));
  }

  function cancelNewWorkspace(): void {
    const firstWorkspace = snapshot.workspaces[0];

    if (firstWorkspace) {
      selectWorkspace(firstWorkspace);
      return;
    }

    setSelectedWorkspaceId(undefined);
    setWorkspaceForm(createEmptyWorkspaceForm());
    setExpandedWorkspaceRules({});
    setWorkspaceNotice(undefined);
    setWorkspaceConnectionCheck({ status: "idle" });
  }

  async function saveProfile(): Promise<void> {
    setBusy(true);
    setNotice(undefined);

    try {
      const saved = await window.codedeployer.saveProfile(formToInput(form));
      setSnapshot((current) => ({ ...current, profiles: upsertProfile(current.profiles, saved) }));
      setSelectedId(saved.id);
      setForm(profileToForm(saved));
      setNotice(text("映射已保存。", "Profile saved."));
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
      const deletedId = form.id;
      await window.codedeployer.deleteProfile(form.id);
      const remainingProfiles = snapshot.profiles.filter((profile) => profile.id !== deletedId);
      setSnapshot((current) => ({ ...current, profiles: current.profiles.filter((profile) => profile.id !== deletedId) }));

      if (remainingProfiles[0]) {
        setSelectedId(remainingProfiles[0].id);
        setForm(profileToForm(remainingProfiles[0]));
      } else {
        setSelectedId(undefined);
        setForm(createEmptyForm());
      }

      setNotice(text("映射已删除。", "Profile deleted."));
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
      setNotice(text(`已加入 ${count} 个文件。`, `Queued ${count} file(s).`));
    } catch (error) {
      setNotice(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function clearQueue(profileId: string): Promise<void> {
    setBusy(true);
    setNotice(undefined);

    try {
      await window.codedeployer.clearQueue(profileId);
      setNotice(text("队列已清空。", "Queue cleared."));
    } catch (error) {
      setNotice(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveWorkspace(): Promise<void> {
    setBusy(true);
    setWorkspaceNotice(undefined);

    try {
      const saved = await window.codedeployer.saveWorkspace(workspaceFormToInput(workspaceForm));
      const savedForm = workspaceToForm(saved);
      const nextExpandedRules = preserveExpandedWorkspaceRules(workspaceForm, savedForm, expandedWorkspaceRules);

      if (workspaceConnectionCheck.status === "ok") {
        rememberWorkspaceVerification(savedForm);
      }

      setSnapshot((current) => ({ ...current, workspaces: upsertWorkspace(current.workspaces, saved) }));
      setSelectedWorkspaceId(saved.id);
      setWorkspaceForm(savedForm);
      setExpandedWorkspaceRules(nextExpandedRules);
      setWorkspaceConnectionCheck(
        workspaceConnectionCheck.status === "error" ? workspaceConnectionCheck : loadWorkspaceVerification(savedForm, language)
      );
      setWorkspaceNotice(text("服务器工作区已保存。", "Server workspace saved."));
    } catch (error) {
      setWorkspaceNotice(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function toggleWorkspaceEnabled(): Promise<void> {
    const nextForm = { ...workspaceForm, enabled: !workspaceForm.enabled };

    if (!workspaceForm.id) {
      setWorkspaceForm(nextForm);
      return;
    }

    setBusy(true);
    setWorkspaceNotice(undefined);

    try {
      const saved = await window.codedeployer.saveWorkspace(workspaceFormToInput(nextForm));
      setSnapshot((current) => ({ ...current, workspaces: upsertWorkspace(current.workspaces, saved) }));
      setWorkspaceForm(workspaceToForm(saved));
      setWorkspaceNotice(saved.enabled ? text("工作区已恢复。", "Workspace resumed.") : text("工作区已暂停。", "Workspace paused."));
    } catch (error) {
      setWorkspaceNotice(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function deleteWorkspace(): Promise<void> {
    if (!workspaceForm.id) {
      return;
    }

    setBusy(true);
    setWorkspaceNotice(undefined);

    try {
      const deletedId = workspaceForm.id;
      await window.codedeployer.deleteWorkspace(deletedId);
      clearWorkspaceVerification(deletedId);
      const remainingWorkspaces = snapshot.workspaces.filter((workspace) => workspace.id !== deletedId);
      setSnapshot((current) => ({
        ...current,
        workspaces: current.workspaces.filter((workspace) => workspace.id !== deletedId)
      }));

      if (remainingWorkspaces[0]) {
        const nextForm = workspaceToForm(remainingWorkspaces[0]);
        setSelectedWorkspaceId(remainingWorkspaces[0].id);
        setWorkspaceForm(nextForm);
        setExpandedWorkspaceRules({});
        setWorkspaceConnectionCheck(loadWorkspaceVerification(nextForm, language));
      } else {
        setSelectedWorkspaceId(undefined);
        setWorkspaceForm(createEmptyWorkspaceForm());
        setExpandedWorkspaceRules({});
        setWorkspaceConnectionCheck({ status: "idle" });
      }

      setWorkspaceNotice(text("服务器工作区已删除。", "Server workspace deleted."));
    } catch (error) {
      setWorkspaceNotice(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function syncWorkspaceNow(): Promise<void> {
    if (!workspaceForm.id) {
      setWorkspaceNotice(text("请先保存服务器工作区。", "Save the server workspace first."));
      return;
    }

    setBusy(true);
    setWorkspaceNotice(undefined);

    try {
      const count = await window.codedeployer.syncWorkspace(workspaceForm.id);
      setWorkspaceNotice(text(`已加入 ${count} 个文件。`, `Queued ${count} file(s).`));
    } catch (error) {
      setWorkspaceNotice(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function syncWorkspaceRule(rule: WorkspaceRuleFormState): Promise<void> {
    if (!workspaceForm.id || !rule.id) {
      setWorkspaceNotice(text("请先保存这条目录映射。", "Save this directory mapping first."));
      return;
    }

    setBusy(true);
    setWorkspaceNotice(undefined);

    try {
      const count = await window.codedeployer.syncWorkspaceRule(workspaceForm.id, rule.id);
      setWorkspaceNotice(text(`已加入 ${count} 个文件。`, `Queued ${count} file(s).`));
    } catch (error) {
      setWorkspaceNotice(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function clearWorkspaceRuleQueue(rule: WorkspaceRuleFormState): Promise<void> {
    if (!workspaceForm.id || !rule.id) {
      return;
    }

    setBusy(true);
    setWorkspaceNotice(undefined);

    try {
      await window.codedeployer.clearWorkspaceRuleQueue(workspaceForm.id, rule.id);
      setWorkspaceNotice(text("队列已清空。", "Queue cleared."));
    } catch (error) {
      setWorkspaceNotice(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function testConnection(profileId: string): Promise<void> {
    setBusy(true);
    setNotice(undefined);

    try {
      const result = await window.codedeployer.testConnection(profileId);
      setNotice(result.ok ? text("连接测试通过。", "Connection test passed.") : result.message);
    } catch (error) {
      setNotice(formatError(error));
    } finally {
      setBusy(false);
    }
  }

  async function testCurrentConnection(): Promise<boolean> {
    setConnectionCheck({ status: "checking", message: text("正在测试连接...", "Testing connection...") });
    setNotice(undefined);

    try {
      const result = await window.codedeployer.testConnectionInput(formToInput(form));

      if (result.ok) {
        setConnectionCheck({ status: "ok", message: text("连接可用，可以浏览服务器目录。", "Connection is ready. You can browse remote folders.") });
        return true;
      }

      setConnectionCheck({ status: "error", message: friendlyConnectionError(result.message, language) });
      return false;
    } catch (error) {
      setConnectionCheck({ status: "error", message: friendlyConnectionError(formatError(error), language) });
      return false;
    }
  }

  async function testWorkspaceConnection(): Promise<boolean> {
    setWorkspaceConnectionCheck({ status: "checking", message: text("正在测试连接...", "Testing connection...") });
    setWorkspaceNotice(undefined);

    try {
      const result = await window.codedeployer.testConnectionInput(workspaceFormToProfileInput(workspaceForm));

      if (result.ok) {
        rememberWorkspaceVerification(workspaceForm);
        setWorkspaceConnectionCheck({
          status: "ok",
          message: text("连接已验证，可以为此服务器添加多个目录映射。", "Connection verified. You can add directory mappings for this server.")
        });
        return true;
      }

      setWorkspaceConnectionCheck({ status: "error", message: friendlyConnectionError(result.message, language) });
      return false;
    } catch (error) {
      setWorkspaceConnectionCheck({ status: "error", message: friendlyConnectionError(formatError(error), language) });
      return false;
    }
  }

  function changeProtocol(protocol: TransferProtocol): void {
    setForm((current) => ({
      ...current,
      protocol,
      port: current.port === "" || current.port === "21" || current.port === "22" ? defaultPort(protocol) : current.port,
      authMode: protocol === "ftp" ? "password" : current.authMode
    }));
    setConnectionCheck({ status: "idle" });
  }

  function changeWorkspaceProtocol(protocol: TransferProtocol): void {
    setWorkspaceForm((current) => ({
      ...current,
      protocol,
      port: current.port === "" || current.port === "21" || current.port === "22" ? defaultPort(protocol) : current.port,
      authMode: protocol === "ftp" ? "password" : current.authMode
    }));
    setWorkspaceConnectionCheck({ status: "idle" });
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

  async function chooseWorkspacePrivateKeyFile(): Promise<void> {
    const selectedPath = await window.codedeployer.selectPrivateKeyFile(workspaceForm.privateKeyPath || undefined);

    if (selectedPath) {
      updateWorkspaceForm("privateKeyPath", selectedPath);
    }
  }

  async function chooseWorkspaceRuleLocalDirectory(ruleIndex: number): Promise<void> {
    const selectedPath = await window.codedeployer.selectLocalDirectory(workspaceForm.rules[ruleIndex]?.localPath || undefined);

    if (selectedPath) {
      updateWorkspaceRule(ruleIndex, "localPath", selectedPath);
    }
  }

  async function openRemoteBrowser(): Promise<void> {
    if (connectionCheck.status !== "ok") {
      const connected = await testCurrentConnection();

      if (!connected) {
        return;
      }
    }

    await loadRemoteDirectories(form.remotePath || "/");
  }

  async function openWorkspaceRemoteBrowser(ruleIndex: number): Promise<void> {
    if (workspaceConnectionCheck.status !== "ok") {
      const connected = await testWorkspaceConnection();

      if (!connected) {
        return;
      }
    }

    await loadWorkspaceRemoteDirectories(workspaceForm.rules[ruleIndex]?.remotePath || "/", ruleIndex);
  }

  async function openDownloadPreview(): Promise<void> {
    if (connectionCheck.status !== "ok") {
      const connected = await testCurrentConnection();

      if (!connected) {
        return;
      }
    }

    setDownloadDialog({
      open: true,
      scanning: true,
      applying: false,
      selected: {},
      error: undefined,
      result: undefined
    });

    try {
      const preview = await window.codedeployer.scanDownloadDiff(formToInput(form));
      setDownloadDialog({
        open: true,
        scanning: false,
        applying: false,
        preview,
        selected: Object.fromEntries(preview.diffs.map((diff) => [diff.relativePath, diff.selected])),
        error: undefined,
        result: undefined
      });
    } catch (error) {
      setDownloadDialog({
        open: true,
        scanning: false,
        applying: false,
        selected: {},
        error: friendlyConnectionError(formatError(error), language),
        result: undefined
      });
    }
  }

  async function applySelectedDownloads(): Promise<void> {
    if (!downloadDialog.preview) {
      return;
    }

    const selectedDiffs = downloadDialog.preview.diffs.filter(
      (diff) => downloadDialog.selected[diff.relativePath] && diff.type !== "local-only"
    );

    setDownloadDialog((current) => ({ ...current, applying: true, error: undefined, result: undefined }));

    try {
      const result = await window.codedeployer.downloadDiffs(formToInput(form), selectedDiffs);
      setDownloadDialog((current) => ({ ...current, applying: false, result }));
    } catch (error) {
      setDownloadDialog((current) => ({
        ...current,
        applying: false,
        error: friendlyConnectionError(formatError(error), language)
      }));
    }
  }

  async function applyAutoIgnoreRules(): Promise<void> {
    if (!form.localPath) {
      setIgnoreNotice(text("请先选择本地目录。", "Choose a local folder first."));
      return;
    }

    setIgnoreNotice(text("正在扫描本地目录...", "Scanning local folder..."));

    try {
      const result = await window.codedeployer.suggestIgnoreRules(form.localPath);
      const currentRules = form.ignoreText.split(/\r?\n/).map((rule) => rule.trim()).filter(Boolean);
      const existing = new Set(currentRules);
      const nextRules = [...currentRules];
      const added = result.suggestions.filter((suggestion) => {
        if (existing.has(suggestion.rule)) {
          return false;
        }

        existing.add(suggestion.rule);
        nextRules.push(suggestion.rule);
        return true;
      });

      updateForm("ignoreText", nextRules.join("\n"));
      setIgnoreNotice(
        added.length > 0
          ? text(`已加入 ${added.length} 条自动规则。`, `Added ${added.length} automatic rule(s).`)
          : text("没有发现新的规则。", "No new rules found.")
      );
    } catch (error) {
      setIgnoreNotice(formatError(error));
    }
  }

  function addWorkspaceRule(): void {
    const rule = createEmptyWorkspaceRuleForm();

    setWorkspaceForm((current) => ({
      ...current,
      rules: [...current.rules, rule]
    }));
    setExpandedWorkspaceRules((current) => ({ ...current, [rule.uiId]: true }));
  }

  function removeWorkspaceRule(ruleIndex: number): void {
    const removedRule = workspaceForm.rules[ruleIndex];

    setWorkspaceForm((current) => ({
      ...current,
      rules: current.rules.filter((_rule, index) => index !== ruleIndex)
    }));

    if (removedRule) {
      setExpandedWorkspaceRules((current) => {
        const { [removedRule.uiId]: _removed, ...rest } = current;
        return rest;
      });
    }
  }

  function toggleWorkspaceRule(rule: WorkspaceRuleFormState): void {
    setExpandedWorkspaceRules((current) => ({
      ...current,
      [rule.uiId]: !current[rule.uiId]
    }));
  }

  function toggleDownloadDiff(relativePath: string, selected: boolean): void {
    setDownloadDialog((current) => ({
      ...current,
      selected: {
        ...current.selected,
        [relativePath]: selected
      }
    }));
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
        error: friendlyConnectionError(formatError(error), language)
      }));
    }
  }

  async function loadWorkspaceRemoteDirectories(remotePath: string, ruleIndex = workspaceRemoteBrowser.ruleIndex ?? 0): Promise<void> {
    setWorkspaceRemoteBrowser((current) => ({
      ...current,
      open: true,
      loading: true,
      path: remotePath || "/",
      ruleIndex,
      error: undefined
    }));

    try {
      const listing = await window.codedeployer.listRemoteDirectories(workspaceFormToProfileInput(workspaceForm, ruleIndex), remotePath || "/");
      setWorkspaceRemoteBrowser({
        open: true,
        loading: false,
        path: listing.path,
        parentPath: listing.parentPath,
        directories: listing.directories,
        ruleIndex
      });
    } catch (error) {
      setWorkspaceRemoteBrowser((current) => ({
        ...current,
        open: true,
        loading: false,
        error: friendlyConnectionError(formatError(error), language)
      }));
    }
  }

  function selectRemotePath(path: string): void {
    updateForm("remotePath", path);
    setRemoteBrowser((current) => ({ ...current, open: false }));
  }

  function selectWorkspaceRemotePath(path: string): void {
    const ruleIndex = workspaceRemoteBrowser.ruleIndex;

    if (ruleIndex !== undefined) {
      updateWorkspaceRule(ruleIndex, "remotePath", path);
    }

    setWorkspaceRemoteBrowser((current) => ({ ...current, open: false }));
  }

  function renderServerWorkspace(): JSX.Element {
    const enabledRules = workspaceForm.rules.filter((rule) => rule.enabled).length;

    return (
      <section className="workspace workspace-mode">
        <header className="topbar workspace-topbar">
          <div className="topbar-title">
            <p className="eyebrow">{text("服务器工作区", "Server workspace")}</p>
            <h2>{workspaceForm.name || text("新服务器工作区", "New server workspace")}</h2>
            <div className="route-preview">
              <span>{workspaceForm.protocol.toUpperCase()}</span>
              <ChevronRight size={15} />
              <span>{workspaceForm.host || text("填写服务器", "Enter server")}</span>
              <ChevronRight size={15} />
              <span>{text(`${workspaceForm.rules.length} 条目录映射`, `${workspaceForm.rules.length} directory mappings`)}</span>
            </div>
          </div>

          <div className="toolbar">
            <button type="button" onClick={toggleWorkspaceEnabled} disabled={busy}>
              {workspaceForm.enabled ? <Pause size={16} /> : <Play size={16} />}
              {workspaceForm.enabled ? text("暂停", "Pause") : text("恢复", "Resume")}
            </button>
            <button type="button" onClick={syncWorkspaceNow} disabled={busy || !workspaceForm.id || !workspaceForm.enabled || enabledRules === 0}>
              <RotateCw size={16} />
              {text("同步全部", "Sync all")}
            </button>
            <button className="save-button" type="button" onClick={saveWorkspace} disabled={busy}>
              <Save size={16} />
              {text("保存", "Save")}
            </button>
          </div>
        </header>

        <div className="content-grid">
          <section className="editor-panel">
            <section className="route-card workspace-hero">
              <div className="route-node">
                <span className="node-label">{text("服务器", "Server")}</span>
                <strong>{workspaceForm.host || text("未填写", "Not set")}</strong>
                <span className={`verify-pill ${workspaceConnectionCheck.status}`}>
                  {connectionCheckTitle(workspaceConnectionCheck.status, language)}
                </span>
              </div>
              <ChevronRight size={22} />
              <div className="route-node">
                <span className="node-label">{text("目录映射", "Directory mappings")}</span>
                <strong>{text(`${enabledRules}/${workspaceForm.rules.length} 已启用`, `${enabledRules}/${workspaceForm.rules.length} enabled`)}</strong>
              </div>
            </section>

            <section className="workspace-section workspace-server-section">
              <SectionHeading
                icon={<Server size={18} />}
                step="1"
                title={text("服务器信息", "Server information")}
                description={text("工作区名称、连接地址和登录方式集中在这里。", "Workspace name, connection address, and authentication live here.")}
              />
              <div className="form-grid path-grid">
                <Field label={text("工作区名称", "Workspace name")}>
                  <input value={workspaceForm.name} onChange={(event) => updateWorkspaceForm("name", event.target.value)} />
                </Field>
                <Field label={text("主机", "Host")}>
                  <input value={workspaceForm.host} onChange={(event) => updateWorkspaceForm("host", event.target.value)} />
                </Field>
              </div>
              <div className="connection-layout workspace-connection-layout">
                <Field label={text("协议", "Protocol")}>
                  <SegmentedControl
                    value={workspaceForm.protocol}
                    options={[
                      { value: "sftp", label: "SFTP" },
                      { value: "ftp", label: "FTP" }
                    ]}
                    onChange={(value) => changeWorkspaceProtocol(value as TransferProtocol)}
                  />
                </Field>
                <Field label={text("端口", "Port")}>
                  <input value={workspaceForm.port} onChange={(event) => updateWorkspaceForm("port", event.target.value)} />
                </Field>
                <Field label={text("登录账号", "Login account")}>
                  <input value={workspaceForm.username} onChange={(event) => updateWorkspaceForm("username", event.target.value)} />
                </Field>
                <Field label={text("认证方式", "Auth mode")}>
                  {workspaceForm.protocol === "ftp" ? (
                    <input value={text("密码", "Password")} disabled />
                  ) : (
                    <SegmentedControl
                      value={workspaceForm.authMode}
                      options={[
                        { value: "privateKey", label: text("私钥", "Private key") },
                        { value: "password", label: text("密码", "Password") }
                      ]}
                      onChange={(value) => updateWorkspaceForm("authMode", value as AuthMode)}
                    />
                  )}
                </Field>
              </div>

              <SectionHeading
                icon={<KeyRound size={18} />}
                step="2"
                title={text("凭据", "Credentials")}
                description={text("凭据属于服务器工作区，下面所有目录映射共用。", "Credentials belong to this server workspace and are shared by its mappings.")}
              />
              <div className="workspace-credential-check-grid">
                <div className="workspace-credential-fields">
                  {workspaceForm.protocol === "sftp" && workspaceForm.authMode === "privateKey" ? (
                    <div className="form-grid credentials-grid">
                      <Field label={text("私钥文件", "Private key file")}>
                        <div className="input-action">
                          <input
                            value={workspaceForm.privateKeyPath}
                            onChange={(event) => updateWorkspaceForm("privateKeyPath", event.target.value)}
                          />
                          <button type="button" onClick={chooseWorkspacePrivateKeyFile}>
                            <FolderOpen size={16} />
                            {text("选择", "Choose")}
                          </button>
                        </div>
                      </Field>
                      <Field label={text("私钥口令", "Passphrase")}>
                        <input
                          type="password"
                          value={workspaceForm.privateKeyPassphrase}
                          placeholder={
                            workspaceForm.hasSavedPrivateKeyPassphrase
                              ? text("已配置私钥口令，如要修改请填写后保存", "Passphrase configured. Enter a new one and save to change it.")
                              : undefined
                          }
                          onChange={(event) => updateWorkspaceForm("privateKeyPassphrase", event.target.value)}
                        />
                      </Field>
                    </div>
                  ) : (
                    <div className="form-grid credentials-grid single-credential-grid">
                      <Field label={text("登录密码", "Login password")}>
                        <input
                          type="password"
                          value={workspaceForm.password}
                          placeholder={
                            workspaceForm.hasSavedPassword
                              ? text("已配置密码，如要修改请填写新密码后保存", "Password configured. Enter a new password and save to change it.")
                              : undefined
                          }
                          onChange={(event) => updateWorkspaceForm("password", event.target.value)}
                        />
                      </Field>
                    </div>
                  )}
                </div>

                <div className={`connection-check workspace-connection-check workspace-connection-inline ${workspaceConnectionCheck.status}`}>
                  <div>
                    <strong>{connectionCheckTitle(workspaceConnectionCheck.status, language)}</strong>
                    <span>
                      {workspaceConnectionCheck.message ??
                        text("输入凭据后测试连接，成功后再浏览每条映射的服务器目录。", "Enter credentials, test the connection, then browse remote folders for each mapping.")}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={testWorkspaceConnection}
                    disabled={busy || workspaceConnectionCheck.status === "checking" || !workspaceForm.host || !workspaceForm.username}
                  >
                    <Activity size={16} />
                    {workspaceConnectionCheck.status === "checking" ? text("测试中", "Testing") : text("测试连接", "Test connection")}
                  </button>
                </div>
              </div>
            </section>

            <section className="workspace-section workspace-rules-section">
              <SectionHeading
                icon={<Folder size={18} />}
                step="3"
                title={text("目录映射", "Directory mappings")}
                description={text("每条映射独立选择本地目录、服务器目录和忽略规则。", "Each mapping has its own local folder, remote folder, and ignore rules.")}
              />

              <div className="workspace-rules-toolbar">
                <div>
                  <strong>{text(`${workspaceForm.rules.length} 条目录映射`, `${workspaceForm.rules.length} directory mappings`)}</strong>
                  <span>{text(`${enabledRules} 条已启用`, `${enabledRules} enabled`)}</span>
                </div>
                <button className="add-rule-button" type="button" onClick={addWorkspaceRule}>
                  <Plus size={16} />
                  {text("添加映射", "Add mapping")}
                </button>
              </div>

              <div className="workspace-rule-list">
              {workspaceForm.rules.map((rule, ruleIndex) => {
                const runtimeId = workspaceForm.id && rule.id ? workspaceRuleProfileId(workspaceForm.id, rule.id) : undefined;
                const ruleStatus = runtimeId ? statusByProfile.get(runtimeId) : undefined;
                const ruleState = ruleStatus?.state ?? (rule.enabled ? "running" : "paused");
                const expanded = Boolean(expandedWorkspaceRules[rule.uiId]);
                const ruleTitle = rule.name.trim() || text(`映射 ${ruleIndex + 1}`, `Mapping ${ruleIndex + 1}`);
                const ruleRoute = `${shortPath(rule.localPath) || text("未选择本地目录", "No local folder")} -> ${
                  rule.remotePath || text("未选择服务器目录", "No remote folder")
                }`;

                return (
                  <article className={`workspace-rule-card ${ruleState} ${expanded ? "expanded" : "collapsed"}`} key={rule.uiId}>
                    <header className="workspace-rule-summary">
                      <button
                        className="workspace-rule-toggle"
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => toggleWorkspaceRule(rule)}
                      >
                        {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                        <span>
                          <strong>{ruleTitle}</strong>
                          <small>{ruleRoute}</small>
                        </span>
                      </button>
                      <span className={`rule-status-pill ${ruleState}`}>
                        {ruleStatus
                          ? text(`${stateName(language, ruleState)} / 队列 ${ruleStatus.queueSize}`, `${stateName(language, ruleState)} / queue ${ruleStatus.queueSize}`)
                          : text("未保存", "Unsaved")}
                      </span>
                      <button className="remove-rule-button" type="button" onClick={() => removeWorkspaceRule(ruleIndex)}>
                        <Trash2 size={16} />
                        {text("移除", "Remove")}
                      </button>
                    </header>

                    {expanded ? (
                      <div className="workspace-rule-body">
                        <header className="workspace-rule-header">
                          <Field label={text("映射名称", "Mapping name")}>
                            <input value={rule.name} onChange={(event) => updateWorkspaceRule(ruleIndex, "name", event.target.value)} />
                          </Field>
                          <label className="inline-toggle">
                            <input
                              checked={rule.enabled}
                              type="checkbox"
                              onChange={(event) => updateWorkspaceRule(ruleIndex, "enabled", event.target.checked)}
                            />
                            <span>{text("启用", "Enabled")}</span>
                          </label>
                        </header>

                        <div className="form-grid path-grid">
                          <Field label={text("本地目录", "Local folder")}>
                            <div className="input-action">
                              <input
                                value={rule.localPath}
                                onChange={(event) => updateWorkspaceRule(ruleIndex, "localPath", event.target.value)}
                              />
                              <button type="button" onClick={() => chooseWorkspaceRuleLocalDirectory(ruleIndex)}>
                                <FolderOpen size={16} />
                                {text("选择", "Choose")}
                              </button>
                            </div>
                          </Field>
                          <Field label={text("服务器目录", "Remote folder")}>
                            <div className="input-action">
                              <input
                                value={rule.remotePath}
                                onChange={(event) => updateWorkspaceRule(ruleIndex, "remotePath", event.target.value)}
                              />
                              <button type="button" onClick={() => openWorkspaceRemoteBrowser(ruleIndex)} disabled={!workspaceForm.host || !workspaceForm.username}>
                                <FolderOpen size={16} />
                                {workspaceConnectionCheck.status === "ok" ? text("浏览", "Browse") : text("测试并浏览", "Test & browse")}
                              </button>
                            </div>
                          </Field>
                        </div>

                        <div className="workspace-rule-options">
                          <label className="inline-toggle danger-text">
                            <input
                              checked={rule.deleteRemote}
                              type="checkbox"
                              onChange={(event) => updateWorkspaceRule(ruleIndex, "deleteRemote", event.target.checked)}
                            />
                            <span>{text("允许删除远程文件", "Allow remote delete")}</span>
                          </label>
                          <Field label={text("并发", "Concurrency")}>
                            <input
                              type="number"
                              min={1}
                              max={8}
                              value={rule.concurrency}
                              onChange={(event) => updateWorkspaceRule(ruleIndex, "concurrency", event.target.value)}
                            />
                          </Field>
                        </div>

                        <Field label={text("忽略规则", "Ignore rules")}>
                          <textarea value={rule.ignoreText} onChange={(event) => updateWorkspaceRule(ruleIndex, "ignoreText", event.target.value)} />
                        </Field>

                        <footer className="workspace-rule-actions">
                          <span>
                            {ruleStatus
                              ? text(
                                  `状态 ${stateName(language, ruleStatus.state)} / 队列 ${ruleStatus.queueSize}`,
                                  `${stateName(language, ruleStatus.state)} / queue ${ruleStatus.queueSize}`
                                )
                              : text("保存后开始监听。", "Save to start watching.")}
                          </span>
                          <button type="button" onClick={() => syncWorkspaceRule(rule)} disabled={busy || !workspaceForm.id || !rule.id || !rule.enabled}>
                            <RotateCw size={16} />
                            {text("同步", "Sync")}
                          </button>
                          <button
                            type="button"
                            onClick={() => clearWorkspaceRuleQueue(rule)}
                            disabled={busy || !workspaceForm.id || !rule.id || (ruleStatus?.queueSize ?? 0) === 0}
                          >
                            <ListX size={16} />
                            {text("清队列", "Clear queue")}
                          </button>
                        </footer>
                      </div>
                    ) : null}
                  </article>
                );
              })}

              {workspaceForm.rules.length === 0 ? (
                <div className="empty-state">{text("还没有目录映射，先添加一个本地目录。", "No directory mappings yet. Add a local folder first.")}</div>
              ) : null}
              </div>
            </section>

            <div className="editor-actions">
              <button className="save-button" type="button" onClick={saveWorkspace} disabled={busy}>
                <Save size={16} />
                {text("保存工作区", "Save workspace")}
              </button>
              {workspaceForm.id ? (
                <button className="danger-button" type="button" onClick={deleteWorkspace} disabled={busy}>
                  <Trash2 size={16} />
                  {text("删除", "Delete")}
                </button>
              ) : null}
              {isDraftWorkspace ? (
                <button type="button" onClick={cancelNewWorkspace} disabled={busy}>
                  <X size={16} />
                  {text("取消创建", "Cancel")}
                </button>
              ) : null}
              {workspaceNotice ? <span className="notice">{workspaceNotice}</span> : null}
            </div>
          </section>

          <aside className="activity-panel">
            <section className="status-panel">
              <SectionHeading
                icon={<Activity size={18} />}
                title={text("工作区状态", "Workspace status")}
                description={text("服务器级别统一查看，目录映射仍可单独操作。", "Review at server level while controlling mappings individually.")}
              />
              <WorkspaceSummary language={language} workspace={selectedWorkspace ?? draftWorkspace} statuses={statusByProfile} />
            </section>

            <section className="logs-panel">
              <SectionHeading icon={<Clock size={18} />} title={text("工作区日志", "Workspace logs")} />
              <div className="log-list">
                {workspaceLogs.map((log) => (
                  <LogRow key={log.id} language={language} log={log} />
                ))}
                {workspaceLogs.length === 0 ? <div className="empty-state">{text("暂无日志。", "No logs yet.")}</div> : null}
              </div>
            </section>
          </aside>
        </div>
      </section>
    );
  }

  return (
    <main className="app-shell">
      <section className="sidebar">
        <div className="brand-row">
          <div className="brand-mark">CD</div>
          <div>
            <h1>CodeDeployer</h1>
            <p>
              {viewMode === "mappings"
                ? text(`${visibleProfileCount} 个映射`, `${visibleProfileCount} mappings`)
                : text(`${visibleWorkspaceCount} 个工作区`, `${visibleWorkspaceCount} workspaces`)}
            </p>
          </div>
        </div>

        <div className="sidebar-switch">
          <button className={viewMode === "mappings" ? "active" : ""} type="button" onClick={() => setViewMode("mappings")}>
            {text("目录映射", "Mappings")}
          </button>
          <button className={viewMode === "workspaces" ? "active" : ""} type="button" onClick={() => setViewMode("workspaces")}>
            {text("服务器工作区", "Workspaces")}
          </button>
        </div>

        <button className="primary-action" type="button" onClick={viewMode === "mappings" ? beginNewProfile : beginNewWorkspace}>
          <Plus size={16} />
          {viewMode === "mappings" ? text("新增映射", "Add mapping") : text("新增工作区", "Add workspace")}
        </button>

        <div className="profile-list">
          {viewMode === "mappings" ? (
            <>
              {draftProfile ? (
                <ProfileRow
                  draft
                  key={draftProfile.id}
                  language={language}
                  profile={draftProfile}
                  selected
                  onClick={() => beginNewProfile()}
                />
              ) : null}

              {snapshot.profiles.map((profile) => (
                <ProfileRow
                  key={profile.id}
                  language={language}
                  profile={profile}
                  selected={profile.id === selectedId}
                  status={statusByProfile.get(profile.id)}
                  onClick={() => selectProfile(profile)}
                />
              ))}

              {visibleProfileCount === 0 ? <div className="empty-state">{text("还没有映射。", "No mappings yet.")}</div> : null}
            </>
          ) : (
            <>
              {draftWorkspace ? (
                <WorkspaceRow
                  draft
                  key={draftWorkspace.id}
                  language={language}
                  selected
                  statuses={statusByProfile}
                  workspace={draftWorkspace}
                  onClick={() => beginNewWorkspace()}
                />
              ) : null}

              {snapshot.workspaces.map((workspace) => (
                <WorkspaceRow
                  key={workspace.id}
                  language={language}
                  selected={workspace.id === selectedWorkspaceId}
                  statuses={statusByProfile}
                  workspace={workspace}
                  onClick={() => selectWorkspace(workspace)}
                />
              ))}

              {visibleWorkspaceCount === 0 ? <div className="empty-state">{text("还没有工作区。", "No workspaces yet.")}</div> : null}
            </>
          )}
        </div>

        <div className="sidebar-footer">
          <LanguageSwitch language={language} onChange={setLanguage} />
        </div>
      </section>

      {viewMode === "mappings" ? (
      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <p className="eyebrow">{text("同步映射", "Sync mapping")}</p>
            <h2>{form.id ? form.name || text("未命名映射", "Untitled mapping") : text("新映射", "New mapping")}</h2>
            <div className="route-preview">
              <span>{shortPath(form.localPath) || text("选择本地目录", "Choose local folder")}</span>
              <ChevronRight size={15} />
              <span>{remoteTarget(form) || text("选择服务器目录", "Choose remote folder")}</span>
            </div>
          </div>

          <div className="toolbar">
            {selectedProfile ? (
              <>
                <button type="button" onClick={() => toggleEnabled(selectedProfile)} disabled={busy}>
                  {selectedProfile.enabled ? <Pause size={16} /> : <Play size={16} />}
                  {selectedProfile.enabled ? text("暂停", "Pause") : text("恢复", "Resume")}
                </button>
                <button type="button" onClick={() => syncNow(selectedProfile.id)} disabled={busy || !selectedProfile.enabled}>
                  <RotateCw size={16} />
                  {text("立即同步", "Sync now")}
                </button>
                <button type="button" onClick={() => clearQueue(selectedProfile.id)} disabled={busy || (selectedStatus?.queueSize ?? 0) === 0}>
                  <ListX size={16} />
                  {text("清空队列", "Clear queue")}
                </button>
              </>
            ) : null}
            <button type="button" onClick={openDownloadPreview} disabled={busy || !form.localPath || !form.host || !form.username}>
              <Download size={16} />
              {text("远程下载", "Download")}
            </button>
            <button className="save-button" type="button" onClick={saveProfile} disabled={busy}>
              <Save size={16} />
              {text("保存", "Save")}
            </button>
          </div>
        </header>

        <div className="content-grid">
          <section className="editor-panel">
            <section className="route-card">
              <div className="route-node">
                <span className="node-label">{text("本地", "Local")}</span>
                <strong>{shortPath(form.localPath) || text("未选择", "Not selected")}</strong>
              </div>
              <ChevronRight size={22} />
              <div className="route-node">
                <span className="node-label">{form.protocol.toUpperCase()}</span>
                <strong>{remoteTarget(form) || text("未选择", "Not selected")}</strong>
              </div>
            </section>

            <SectionHeading
              icon={<Folder size={18} />}
              step="1"
              title={text("同步路径", "Sync paths")}
              description={text("先选本地目录，再选服务器目标目录。", "Choose the local folder first, then the remote target.")}
            />
            <div className="form-grid path-grid">
              <Field label={text("映射名称", "Mapping name")}>
                <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
              </Field>
              <Field label={text("本地目录", "Local folder")}>
                <div className="input-action">
                  <input value={form.localPath} onChange={(event) => updateForm("localPath", event.target.value)} />
                  <button type="button" onClick={chooseLocalDirectory}>
                    <FolderOpen size={16} />
                    {text("选择", "Choose")}
                  </button>
                </div>
              </Field>
              <Field label={text("服务器目录", "Remote folder")}>
                <div className="input-action">
                  <input value={form.remotePath} onChange={(event) => updateForm("remotePath", event.target.value)} />
                  <button type="button" onClick={openRemoteBrowser} disabled={busy || !form.host || !form.username}>
                    <FolderOpen size={16} />
                    {connectionCheck.status === "ok" ? text("浏览", "Browse") : text("测试并浏览", "Test & browse")}
                  </button>
                </div>
              </Field>
            </div>

            <SectionHeading
              icon={<Server size={18} />}
              step="2"
              title={text("服务器连接", "Server connection")}
              description={text("在这里填写服务器、端口和登录账号。FTP 用密码；SFTP 可用私钥或密码。", "Enter the server, port, and login account here. FTP uses password auth; SFTP supports private key or password.")}
            />
            <div className="connection-layout">
              <Field label={text("协议", "Protocol")}>
                <SegmentedControl
                  value={form.protocol}
                  options={[
                    { value: "sftp", label: "SFTP" },
                    { value: "ftp", label: "FTP" }
                  ]}
                  onChange={(value) => changeProtocol(value as TransferProtocol)}
                />
              </Field>
              <Field label={text("主机", "Host")}>
                <input value={form.host} onChange={(event) => updateForm("host", event.target.value)} />
              </Field>
              <Field label={text("端口", "Port")}>
                <input value={form.port} onChange={(event) => updateForm("port", event.target.value)} />
              </Field>
              <Field label={text("登录账号", "Login account")}>
                <input value={form.username} onChange={(event) => updateForm("username", event.target.value)} />
              </Field>
              <Field label={text("认证方式", "Auth mode")}>
                {form.protocol === "ftp" ? (
                  <input value={text("密码", "Password")} disabled />
                ) : (
                  <SegmentedControl
                    value={form.authMode}
                    options={[
                      { value: "privateKey", label: text("私钥", "Private key") },
                      { value: "password", label: text("密码", "Password") }
                    ]}
                    onChange={(value) => updateForm("authMode", value as AuthMode)}
                  />
                )}
              </Field>
            </div>
            <div className={`connection-check ${connectionCheck.status}`}>
              <div>
                <strong>{connectionCheckTitle(connectionCheck.status, language)}</strong>
                <span>{connectionCheck.message ?? text("请先填写服务器和凭据，再测试连接。", "Fill in server details and credentials, then test the connection.")}</span>
              </div>
              <button type="button" onClick={testCurrentConnection} disabled={busy || connectionCheck.status === "checking" || !form.host || !form.username}>
                <Activity size={16} />
                {connectionCheck.status === "checking" ? text("测试中", "Testing") : text("测试连接", "Test connection")}
              </button>
            </div>

            <SectionHeading
              icon={<KeyRound size={18} />}
              step="3"
              title={text("凭据", "Credentials")}
              description={text("敏感信息会加密保存，不写入普通配置。", "Secrets are encrypted and kept out of plain config.")}
            />
            {form.protocol === "sftp" && form.authMode === "privateKey" ? (
              <div className="form-grid credentials-grid">
                <Field label={text("私钥文件", "Private key file")}>
                  <div className="input-action">
                    <input value={form.privateKeyPath} onChange={(event) => updateForm("privateKeyPath", event.target.value)} />
                    <button type="button" onClick={choosePrivateKeyFile}>
                      <FolderOpen size={16} />
                      {text("选择", "Choose")}
                    </button>
                  </div>
                </Field>
                <Field label={text("私钥口令", "Passphrase")}>
                  <input
                    type="password"
                    value={form.privateKeyPassphrase}
                    placeholder={
                      form.hasSavedPrivateKeyPassphrase
                        ? text("已配置私钥口令，如要修改请填写后保存", "Passphrase configured. Enter a new one and save to change it.")
                        : undefined
                    }
                    onChange={(event) => updateForm("privateKeyPassphrase", event.target.value)}
                  />
                </Field>
              </div>
            ) : (
              <div className="form-grid credentials-grid">
                <Field label={text("登录密码", "Login password")}>
                  <input
                    type="password"
                    value={form.password}
                    placeholder={
                      form.hasSavedPassword
                        ? text("已配置密码，如要修改请填写新密码后保存", "Password configured. Enter a new password and save to change it.")
                        : undefined
                    }
                    onChange={(event) => updateForm("password", event.target.value)}
                  />
                </Field>
              </div>
            )}

            <SectionHeading
              icon={<Shield size={18} />}
              step="4"
              title={text("同步规则", "Sync rules")}
              description={text("默认只上传本地变化，不删除远程多余文件。", "By default, uploads local changes and keeps remote-only files.")}
              action={
                <button type="button" onClick={applyAutoIgnoreRules} disabled={!form.localPath}>
                  <ListPlus size={16} />
                  {text("自动规则", "Auto rules")}
                </button>
              }
            />
            <div className="rules-layout">
              <div className="option-stack">
                <label className="toggle-row">
                  <input checked={form.enabled} type="checkbox" onChange={(event) => updateForm("enabled", event.target.checked)} />
                  <span>
                    <strong>{text("启用映射", "Enable mapping")}</strong>
                    <small>{text("保存后自动监听本地目录。", "Watch this folder after saving.")}</small>
                  </span>
                </label>
                <label className="toggle-row danger">
                  <input
                    checked={form.deleteRemote}
                    type="checkbox"
                    onChange={(event) => updateForm("deleteRemote", event.target.checked)}
                  />
                  <span>
                    <strong>{text("允许删除远程文件", "Allow remote delete")}</strong>
                    <small>{text("仅在你确实需要镜像删除时开启。", "Use only when you need mirrored deletes.")}</small>
                  </span>
                </label>
              </div>
              <Field label={text("并发上传数", "Upload concurrency")}>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={form.concurrency}
                  onChange={(event) => updateForm("concurrency", event.target.value)}
                />
              </Field>
            </div>
            <Field label={text("忽略规则", "Ignore rules")}>
              <textarea value={form.ignoreText} onChange={(event) => updateForm("ignoreText", event.target.value)} />
            </Field>
            {ignoreNotice ? <div className="hint-line">{ignoreNotice}</div> : null}

            <div className="editor-actions">
              <button className="save-button" type="button" onClick={saveProfile} disabled={busy}>
                <Save size={16} />
                {text("保存映射", "Save profile")}
              </button>
              {form.id ? (
                <button className="danger-button" type="button" onClick={deleteProfile} disabled={busy}>
                  <Trash2 size={16} />
                  {text("删除", "Delete")}
                </button>
              ) : null}
              {isDraftProfile ? (
                <button type="button" onClick={cancelNewProfile} disabled={busy}>
                  <X size={16} />
                  {text("取消创建", "Cancel")}
                </button>
              ) : null}
              {notice ? <span className="notice">{notice}</span> : null}
            </div>
          </section>

          <aside className="activity-panel">
            <section className="status-panel">
              <SectionHeading
                icon={<Activity size={18} />}
                title={text("运行状态", "Runtime status")}
                description={text("窗口关闭后仍会在托盘后台运行。", "Closing the window keeps syncing in the tray.")}
              />
              <StatusSummary language={language} status={selectedStatus} profile={selectedProfile} />
            </section>

            <section className="logs-panel">
              <SectionHeading icon={<Clock size={18} />} title={text("传输日志", "Transfer logs")} />
              <div className="log-list">
                {profileLogs.map((log) => (
                  <LogRow key={log.id} language={language} log={log} />
                ))}
                {profileLogs.length === 0 ? <div className="empty-state">{text("暂无日志。", "No logs yet.")}</div> : null}
              </div>
            </section>
          </aside>
        </div>
      </section>
      ) : (
        renderServerWorkspace()
      )}

      {remoteBrowser.open ? (
        <RemoteDirectoryBrowser
          language={language}
          state={remoteBrowser}
          onClose={() => setRemoteBrowser((current) => ({ ...current, open: false }))}
          onOpenPath={loadRemoteDirectories}
          onSelect={selectRemotePath}
        />
      ) : null}

      {workspaceRemoteBrowser.open ? (
        <RemoteDirectoryBrowser
          language={language}
          state={workspaceRemoteBrowser}
          onClose={() => setWorkspaceRemoteBrowser((current) => ({ ...current, open: false }))}
          onOpenPath={(path) => loadWorkspaceRemoteDirectories(path)}
          onSelect={selectWorkspaceRemotePath}
        />
      ) : null}

      {downloadDialog.open ? (
        <DownloadPreviewDialog
          language={language}
          state={downloadDialog}
          onClose={() => setDownloadDialog((current) => ({ ...current, open: false }))}
          onToggle={toggleDownloadDiff}
          onApply={applySelectedDownloads}
        />
      ) : null}
    </main>
  );

  function updateForm<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }));

    if (isConnectionField(key)) {
      setConnectionCheck({ status: "idle" });
    }
  }

  function updateWorkspaceForm<K extends keyof WorkspaceFormState>(key: K, value: WorkspaceFormState[K]): void {
    setWorkspaceForm((current) => ({ ...current, [key]: value }));

    if (isWorkspaceConnectionField(key)) {
      setWorkspaceConnectionCheck({ status: "idle" });

      if (isWorkspaceSecretField(key)) {
        clearWorkspaceVerification(workspaceForm.id);
      }
    }
  }

  function updateWorkspaceRule<K extends keyof WorkspaceRuleFormState>(
    ruleIndex: number,
    key: K,
    value: WorkspaceRuleFormState[K]
  ): void {
    setWorkspaceForm((current) => ({
      ...current,
      rules: current.rules.map((rule, index) => (index === ruleIndex ? { ...rule, [key]: value } : rule))
    }));
  }
}

function LanguageSwitch({ language, onChange }: { language: Language; onChange: (language: Language) => void }): JSX.Element {
  return (
    <div className="language-switch" aria-label="Language">
      <button className={language === "zh" ? "active" : ""} type="button" onClick={() => onChange("zh")}>
        中文
      </button>
      <button className={language === "en" ? "active" : ""} type="button" onClick={() => onChange("en")}>
        English
      </button>
    </div>
  );
}

function ProfileRow({
  language,
  profile,
  selected,
  status,
  onClick,
  draft = false
}: {
  language: Language;
  profile: SyncProfile;
  selected: boolean;
  status?: SyncStatus;
  onClick: () => void;
  draft?: boolean;
}): JSX.Element {
  return (
    <button className={`profile-row ${selected ? "selected" : ""} ${draft ? "draft" : ""}`} type="button" onClick={onClick}>
      <StatusDot status={status} />
      <span>
        <strong>{profile.name}</strong>
        <small>{draft ? t(language, "未保存", "Unsaved") : `${profile.remote.protocol.toUpperCase()} | ${profile.remote.host}`}</small>
        <em>{stateName(language, status?.state ?? (profile.enabled ? "idle" : "paused"))}</em>
      </span>
    </button>
  );
}

function WorkspaceRow({
  language,
  workspace,
  selected,
  statuses,
  onClick,
  draft = false
}: {
  language: Language;
  workspace: ServerWorkspace;
  selected: boolean;
  statuses: Map<string, SyncStatus>;
  onClick: () => void;
  draft?: boolean;
}): JSX.Element {
  const enabledRules = workspace.rules.filter((rule) => rule.enabled).length;
  const state = workspaceState(workspace, statuses);

  return (
    <button className={`profile-row ${selected ? "selected" : ""} ${draft ? "draft" : ""}`} type="button" onClick={onClick}>
      <StatusDot status={{ profileId: workspace.id, state, queueSize: 0, activeUploads: 0 }} />
      <span>
        <strong>{workspace.name}</strong>
        <small>{draft ? t(language, "未保存", "Unsaved") : `${workspace.connection.protocol.toUpperCase()} | ${workspace.connection.host}`}</small>
        <em>{`${stateName(language, state)} | ${t(language, `${enabledRules}/${workspace.rules.length} 条目录映射`, `${enabledRules}/${workspace.rules.length} mappings enabled`)}`}</em>
      </span>
    </button>
  );
}

function WorkspaceSummary({
  language,
  workspace,
  statuses
}: {
  language: Language;
  workspace?: ServerWorkspace;
  statuses: Map<string, SyncStatus>;
}): JSX.Element {
  if (!workspace) {
    return <div className="summary-box muted">{t(language, "保存工作区后开始管理多个目录。", "Save a workspace to manage multiple folders.")}</div>;
  }

  const ruleStatuses = workspace.rules
    .map((rule) => statuses.get(workspaceRuleProfileId(workspace.id, rule.id)))
    .filter((status): status is SyncStatus => Boolean(status));
  const queueSize = ruleStatuses.reduce((total, status) => total + status.queueSize, 0);
  const activeUploads = ruleStatuses.reduce((total, status) => total + status.activeUploads, 0);
  const hasError = ruleStatuses.some((status) => status.state === "error");
  const enabledRules = workspace.rules.filter((rule) => rule.enabled).length;

  return (
    <div className={`summary-box ${hasError ? "error" : workspace.enabled ? "running" : "paused"}`}>
      <div className="summary-main">
        {hasError ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
        <strong>{workspace.enabled ? t(language, "工作区启用", "Workspace enabled") : t(language, "工作区暂停", "Workspace paused")}</strong>
      </div>
      <dl>
        <div>
          <dt>{t(language, "目录", "Rules")}</dt>
          <dd>{`${enabledRules}/${workspace.rules.length}`}</dd>
        </div>
        <div>
          <dt>{t(language, "队列", "Queue")}</dt>
          <dd>{queueSize}</dd>
        </div>
        <div>
          <dt>{t(language, "传输中", "Active")}</dt>
          <dd>{activeUploads}</dd>
        </div>
      </dl>
    </div>
  );
}

function workspaceState(workspace: ServerWorkspace, statuses: Map<string, SyncStatus>): SyncStatus["state"] {
  if (!workspace.enabled) {
    return "paused";
  }

  const ruleStatuses = workspace.rules
    .map((rule) => statuses.get(workspaceRuleProfileId(workspace.id, rule.id)))
    .filter((status): status is SyncStatus => Boolean(status));

  if (ruleStatuses.some((status) => status.state === "error")) {
    return "error";
  }

  if (ruleStatuses.some((status) => status.state === "running")) {
    return "running";
  }

  return workspace.rules.some((rule) => rule.enabled) ? "running" : "idle";
}

function RemoteDirectoryBrowser({
  language,
  state,
  onClose,
  onOpenPath,
  onSelect
}: {
  language: Language;
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
            <h3>{t(language, "选择服务器目录", "Select remote directory")}</h3>
            <p>{state.path}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t(language, "关闭", "Close")}>
            <X size={16} />
          </button>
        </header>

        <div className="remote-browser-actions">
          <button type="button" onClick={() => state.parentPath && onOpenPath(state.parentPath)} disabled={!state.parentPath || state.loading}>
            <ChevronUp size={16} />
            {t(language, "上级", "Up")}
          </button>
          <button type="button" onClick={() => onOpenPath(state.path)} disabled={state.loading}>
            <RotateCw size={16} />
            {t(language, "刷新", "Refresh")}
          </button>
          <button className="save-button" type="button" onClick={() => onSelect(state.path)} disabled={state.loading}>
            <CheckCircle2 size={16} />
            {t(language, "选择当前目录", "Select current")}
          </button>
        </div>

        {state.error ? <div className="browser-error">{state.error}</div> : null}
        {state.loading ? <div className="empty-state">{t(language, "正在读取目录...", "Loading directories...")}</div> : null}

        {!state.loading ? (
          <div className="directory-list">
            {state.directories.map((directory) => (
              <button key={directory.path} type="button" onClick={() => onOpenPath(directory.path)}>
                <Folder size={16} />
                <span>{directory.name}</span>
              </button>
            ))}
            {state.directories.length === 0 && !state.error ? (
              <div className="empty-state">{t(language, "没有子目录。", "No subdirectories.")}</div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function DownloadPreviewDialog({
  language,
  state,
  onClose,
  onToggle,
  onApply
}: {
  language: Language;
  state: DownloadDialogState;
  onClose: () => void;
  onToggle: (relativePath: string, selected: boolean) => void;
  onApply: () => Promise<void>;
}): JSX.Element {
  const diffs = state.preview?.diffs ?? [];
  const selectedCount = diffs.filter((diff) => state.selected[diff.relativePath] && diff.type !== "local-only").length;
  const counts = diffCounts(diffs);

  return (
    <div className="modal-backdrop">
      <section className="download-dialog" role="dialog" aria-modal="true">
        <header className="remote-browser-header">
          <div>
            <h3>{t(language, "远程下载预览", "Remote download preview")}</h3>
            <p>
              {t(
                language,
                "扫描本地和服务器目录差异，默认下载远程新增和有差异的文件。",
                "Compare local and remote folders. Remote-only and changed files are selected by default."
              )}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t(language, "关闭", "Close")}>
            <X size={16} />
          </button>
        </header>

        {state.scanning ? <div className="empty-state">{t(language, "正在扫描差异...", "Scanning differences...")}</div> : null}
        {state.error ? <div className="browser-error">{state.error}</div> : null}
        {state.result ? (
          <div className={state.result.failed.length > 0 ? "download-result warning" : "download-result success"}>
            <strong>
              {t(language, `已下载 ${state.result.downloaded} 个文件`, `Downloaded ${state.result.downloaded} file(s)`)}
            </strong>
            {state.result.failed.length > 0 ? (
              <span>{t(language, `${state.result.failed.length} 个文件失败`, `${state.result.failed.length} file(s) failed`)}</span>
            ) : null}
          </div>
        ) : null}

        {state.preview ? (
          <>
            <div className="download-summary">
              <div>
                <strong>{counts.changed}</strong>
                <span>{t(language, "内容不同", "Changed")}</span>
              </div>
              <div>
                <strong>{counts.remoteOnly}</strong>
                <span>{t(language, "远程新增", "Remote-only")}</span>
              </div>
              <div>
                <strong>{counts.localOnly}</strong>
                <span>{t(language, "本地独有", "Local-only")}</span>
              </div>
              <div>
                <strong>{selectedCount}</strong>
                <span>{t(language, "将下载", "Selected")}</span>
              </div>
            </div>

            <div className="download-list">
              {diffs.map((diff) => {
                const downloadable = diff.type !== "local-only";

                return (
                  <label className={`download-row ${diff.type}`} key={diff.relativePath}>
                    <input
                      checked={Boolean(state.selected[diff.relativePath])}
                      disabled={!downloadable || state.applying}
                      type="checkbox"
                      onChange={(event) => onToggle(diff.relativePath, event.target.checked)}
                    />
                    <div>
                      <strong>{diff.relativePath}</strong>
                      <small>
                        {diffTypeLabel(language, diff.type)}
                        {downloadable ? ` | ${formatDiffSizes(language, diff)}` : ""}
                      </small>
                    </div>
                  </label>
                );
              })}
              {diffs.length === 0 ? <div className="empty-state">{t(language, "没有发现差异。", "No differences found.")}</div> : null}
            </div>

            <footer className="download-actions">
              <button type="button" onClick={onClose}>
                {t(language, "关闭", "Close")}
              </button>
              <button className="save-button" type="button" onClick={onApply} disabled={state.applying || selectedCount === 0}>
                <Download size={16} />
                {state.applying
                  ? t(language, "下载中", "Downloading")
                  : t(language, `下载选中 ${selectedCount} 个`, `Download ${selectedCount} selected`)}
              </button>
            </footer>
          </>
        ) : null}
      </section>
    </div>
  );
}

function SectionHeading({
  icon,
  step,
  title,
  description,
  action
}: {
  icon: JSX.Element;
  step?: string;
  title: string;
  description?: string;
  action?: JSX.Element;
}): JSX.Element {
  return (
    <div className="section-heading">
      <div className="section-icon">
        {step ? <span>{step}</span> : icon}
      </div>
      <div>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div className="section-action">{action}</div> : null}
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

function SegmentedControl({
  value,
  options,
  onChange
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}): JSX.Element {
  return (
    <div className="segmented-control">
      {options.map((option) => (
        <button
          className={option.value === value ? "active" : ""}
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function StatusSummary({
  language,
  status,
  profile
}: {
  language: Language;
  status?: SyncStatus;
  profile?: SyncProfile;
}): JSX.Element {
  if (!profile) {
    return <div className="summary-box muted">{t(language, "保存后开始监听。", "Save a mapping to start watching.")}</div>;
  }

  if (!status) {
    return <div className="summary-box muted">{t(language, "暂无运行状态", "No runtime status")}</div>;
  }

  return (
    <div className={`summary-box ${status.state}`}>
      <div className="summary-main">
        {status.state === "error" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
        <strong>{stateName(language, status.state)}</strong>
      </div>
      <dl>
        <div>
          <dt>{t(language, "队列", "Queue")}</dt>
          <dd>{status.queueSize}</dd>
        </div>
        <div>
          <dt>{t(language, "传输中", "Active")}</dt>
          <dd>{status.activeUploads}</dd>
        </div>
        <div>
          <dt>{t(language, "上次同步", "Last sync")}</dt>
          <dd>{status.lastSyncAt ? formatTime(status.lastSyncAt) : t(language, "无", "None")}</dd>
        </div>
      </dl>
      {status.error ? <p className="status-error">{status.error}</p> : null}
    </div>
  );
}

function StatusDot({ status }: { status?: SyncStatus }): JSX.Element {
  return <span className={`status-dot ${status?.state ?? "idle"}`} />;
}

function LogRow({ language, log }: { language: Language; log: SyncLog }): JSX.Element {
  return (
    <article className={`log-row ${log.level}`}>
      <div>
        <strong>{localizedLogMessage(language, log.message)}</strong>
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
    protocol: "sftp",
    localPath: "",
    host: "",
    port: "22",
    username: "deploy",
    authMode: "privateKey",
    remotePath: "/",
    privateKeyPath: "",
    password: "",
    privateKeyPassphrase: "",
    hasSavedPassword: false,
    hasSavedPrivateKeyPassphrase: false,
    ignoreText: DEFAULT_IGNORE_RULES.join("\n"),
    deleteRemote: false,
    concurrency: "2"
  };
}

function createEmptyWorkspaceForm(): WorkspaceFormState {
  return {
    name: "",
    enabled: true,
    protocol: "sftp",
    host: "",
    port: "22",
    username: "deploy",
    authMode: "privateKey",
    privateKeyPath: "",
    password: "",
    privateKeyPassphrase: "",
    hasSavedPassword: false,
    hasSavedPrivateKeyPassphrase: false,
    rules: []
  };
}

function createEmptyWorkspaceRuleForm(): WorkspaceRuleFormState {
  return {
    uiId: createRuleUiId(),
    name: "",
    enabled: true,
    localPath: "",
    remotePath: "",
    ignoreText: "",
    deleteRemote: false,
    concurrency: "2"
  };
}

function profileToForm(profile: SyncProfile): ProfileFormState {
  const protocol = profile.remote.protocol ?? "sftp";

  return {
    id: profile.id,
    name: profile.name,
    enabled: profile.enabled,
    protocol,
    localPath: profile.localPath,
    host: profile.remote.host,
    port: String(profile.remote.port || defaultPort(protocol)),
    username: profile.remote.username,
    authMode: protocol === "ftp" ? "password" : profile.remote.authMode,
    remotePath: profile.remote.remotePath,
    privateKeyPath: profile.remote.privateKeyPath ?? "",
    password: "",
    privateKeyPassphrase: "",
    hasSavedPassword: Boolean(profile.secretStatus?.hasPassword),
    hasSavedPrivateKeyPassphrase: Boolean(profile.secretStatus?.hasPrivateKeyPassphrase),
    ignoreText: profile.ignore.join("\n"),
    deleteRemote: profile.deleteRemote,
    concurrency: String(profile.concurrency)
  };
}

function workspaceToForm(workspace: ServerWorkspace): WorkspaceFormState {
  const protocol = workspace.connection.protocol ?? "sftp";

  return {
    id: workspace.id,
    name: workspace.name,
    enabled: workspace.enabled,
    protocol,
    host: workspace.connection.host,
    port: String(workspace.connection.port || defaultPort(protocol)),
    username: workspace.connection.username,
    authMode: protocol === "ftp" ? "password" : workspace.connection.authMode,
    privateKeyPath: workspace.connection.privateKeyPath ?? "",
    password: "",
    privateKeyPassphrase: "",
    hasSavedPassword: Boolean(workspace.secretStatus?.hasPassword),
    hasSavedPrivateKeyPassphrase: Boolean(workspace.secretStatus?.hasPrivateKeyPassphrase),
    rules: workspace.rules.map(workspaceRuleToForm)
  };
}

function workspaceRuleToForm(rule: ServerWorkspaceRule): WorkspaceRuleFormState {
  return {
    uiId: rule.id,
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    localPath: rule.localPath,
    remotePath: rule.remotePath,
    ignoreText: rule.ignore.join("\n"),
    deleteRemote: rule.deleteRemote,
    concurrency: String(rule.concurrency)
  };
}

function createRuleUiId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `draft-rule-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function preserveExpandedWorkspaceRules(
  before: WorkspaceFormState,
  after: WorkspaceFormState,
  expanded: Record<string, boolean>
): Record<string, boolean> {
  return Object.fromEntries(
    after.rules
      .map((rule, index) => {
        const previousRule = before.rules[index];
        const shouldExpand = Boolean(expanded[rule.uiId] || (previousRule && expanded[previousRule.uiId]));
        return shouldExpand ? [rule.uiId, true] : undefined;
      })
      .filter((entry): entry is [string, boolean] => Boolean(entry))
  );
}

function formToDraftProfile(form: ProfileFormState, fallbackName: string, fallbackRemote: string): SyncProfile {
  const now = new Date().toISOString();

  return {
    id: DRAFT_PROFILE_ID,
    name: form.name.trim() || fallbackName,
    enabled: form.enabled,
    localPath: form.localPath,
    remote: {
      protocol: form.protocol,
      host: form.host.trim() || fallbackRemote,
      port: Number(form.port) || Number(defaultPort(form.protocol)),
      username: form.username.trim(),
      authMode: form.protocol === "ftp" ? "password" : form.authMode,
      remotePath: form.remotePath || "/",
      privateKeyPath: form.protocol === "ftp" ? undefined : form.privateKeyPath || undefined
    },
    ignore: form.ignoreText.split(/\r?\n/),
    deleteRemote: form.deleteRemote,
    concurrency: Number(form.concurrency) || 1,
    createdAt: now,
    updatedAt: now
  };
}

function formToDraftWorkspace(form: WorkspaceFormState, fallbackName: string): ServerWorkspace {
  const now = new Date().toISOString();

  return {
    id: DRAFT_WORKSPACE_ID,
    name: form.name.trim() || fallbackName,
    enabled: form.enabled,
    connection: {
      protocol: form.protocol,
      host: form.host.trim() || "-",
      port: Number(form.port) || Number(defaultPort(form.protocol)),
      username: form.username.trim(),
      authMode: form.protocol === "ftp" ? "password" : form.authMode,
      privateKeyPath: form.protocol === "ftp" ? undefined : form.privateKeyPath || undefined
    },
    defaultIgnore: [],
    rules: form.rules.map((rule, index) => ({
      id: rule.id ?? `draft-rule-${index}`,
      name: rule.name.trim() || rule.localPath || rule.remotePath || "Directory rule",
      enabled: rule.enabled,
      localPath: rule.localPath,
      remotePath: rule.remotePath || "/",
      ignore: rule.ignoreText.split(/\r?\n/),
      deleteRemote: rule.deleteRemote,
      concurrency: Number(rule.concurrency) || 1,
      createdAt: now,
      updatedAt: now
    })),
    createdAt: now,
    updatedAt: now
  };
}

function upsertProfile(profiles: SyncProfile[], saved: SyncProfile): SyncProfile[] {
  const exists = profiles.some((profile) => profile.id === saved.id);

  if (exists) {
    return profiles.map((profile) => (profile.id === saved.id ? saved : profile));
  }

  return [saved, ...profiles];
}

function upsertWorkspace(workspaces: ServerWorkspace[], saved: ServerWorkspace): ServerWorkspace[] {
  const exists = workspaces.some((workspace) => workspace.id === saved.id);

  if (exists) {
    return workspaces.map((workspace) => (workspace.id === saved.id ? saved : workspace));
  }

  return [saved, ...workspaces];
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
      port: Number(form.port) || Number(defaultPort(form.protocol)),
      username: form.username,
      authMode: form.protocol === "ftp" ? "password" : form.authMode,
      remotePath: form.remotePath || "/",
      privateKeyPath: form.protocol === "ftp" ? undefined : form.privateKeyPath || undefined
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

function workspaceFormToInput(form: WorkspaceFormState): ServerWorkspaceInput {
  return {
    id: form.id,
    name: form.name,
    enabled: form.enabled,
    connection: {
      protocol: form.protocol,
      host: form.host,
      port: Number(form.port) || Number(defaultPort(form.protocol)),
      username: form.username,
      authMode: form.protocol === "ftp" ? "password" : form.authMode,
      privateKeyPath: form.protocol === "ftp" ? undefined : form.privateKeyPath || undefined
    },
    defaultIgnore: [],
    rules: form.rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      localPath: rule.localPath,
      remotePath: rule.remotePath,
      ignore: rule.ignoreText.split(/\r?\n/),
      deleteRemote: rule.deleteRemote,
      concurrency: Number(rule.concurrency) || 1
    })),
    secret: {
      password: form.password,
      privateKeyPassphrase: form.privateKeyPassphrase
    }
  };
}

function workspaceFormToProfileInput(form: WorkspaceFormState, ruleIndex?: number): ProfileInput {
  const rule = ruleIndex === undefined ? undefined : form.rules[ruleIndex];

  return {
    id: form.id ?? DRAFT_WORKSPACE_ID,
    name: form.name || "Server workspace",
    enabled: form.enabled && (rule?.enabled ?? true),
    localPath: rule?.localPath || ".",
    remote: {
      protocol: form.protocol,
      host: form.host,
      port: Number(form.port) || Number(defaultPort(form.protocol)),
      username: form.username,
      authMode: form.protocol === "ftp" ? "password" : form.authMode,
      remotePath: rule?.remotePath || "/",
      privateKeyPath: form.protocol === "ftp" ? undefined : form.privateKeyPath || undefined
    },
    ignore: rule?.ignoreText.split(/\r?\n/) ?? [],
    deleteRemote: rule?.deleteRemote ?? false,
    concurrency: Number(rule?.concurrency) || 1,
    secret: {
      password: form.password,
      privateKeyPassphrase: form.privateKeyPassphrase
    }
  };
}

function stateName(language: Language, state: SyncStatus["state"]): string {
  const names = {
    running: t(language, "运行中", "Running"),
    paused: t(language, "已暂停", "Paused"),
    idle: t(language, "空闲", "Idle"),
    error: t(language, "错误", "Error")
  };

  return names[state];
}

function localizedLogMessage(language: Language, message: string): string {
  const messages: Record<string, string> = {
    "Watcher started.": t(language, "监听已启动。", "Watcher started."),
    "Watcher paused.": t(language, "监听已暂停。", "Watcher paused."),
    "Uploaded file.": t(language, "文件已上传。", "Uploaded file."),
    "Upload failed.": t(language, "上传失败。", "Upload failed."),
    "Upload queue cleared.": t(language, "上传队列已清空。", "Upload queue cleared."),
    "Profile is paused. Resume it before running manual sync.": t(
      language,
      "映射已暂停，请恢复后再手动同步。",
      "Profile is paused. Resume it before running manual sync."
    ),
    "SFTP connection test passed.": t(language, "SFTP 连接测试通过。", "SFTP connection test passed."),
    "SFTP connection test failed.": t(language, "SFTP 连接测试失败。", "SFTP connection test failed."),
    "FTP connection test passed.": t(language, "FTP 连接测试通过。", "FTP connection test passed."),
    "FTP connection test failed.": t(language, "FTP 连接测试失败。", "FTP connection test failed."),
    "Watcher could not start.": t(language, "监听无法启动。", "Watcher could not start."),
    "Watcher failed.": t(language, "监听失败。", "Watcher failed."),
    "Local delete ignored because remote deletion is disabled.": t(
      language,
      "本地删除已忽略，因为未启用远程删除。",
      "Local delete ignored because remote deletion is disabled."
    ),
    "Deleted remote file.": t(language, "远程文件已删除。", "Deleted remote file."),
    "Remote delete failed.": t(language, "远程删除失败。", "Remote delete failed."),
    "Downloaded remote files.": t(language, "远程文件已下载。", "Downloaded remote files.")
  };

  return messages[message] ?? (message.startsWith("Downloaded ") ? t(language, message.replace("Downloaded", "已下载").replace("remote file(s).", "个远程文件。"), message) : message);
}

function diffCounts(diffs: DownloadDiff[]): { changed: number; remoteOnly: number; localOnly: number } {
  return {
    changed: diffs.filter((diff) => diff.type === "changed").length,
    remoteOnly: diffs.filter((diff) => diff.type === "remote-only").length,
    localOnly: diffs.filter((diff) => diff.type === "local-only").length
  };
}

function diffTypeLabel(language: Language, type: DownloadDiff["type"]): string {
  const labels = {
    changed: t(language, "内容不同，将用远程覆盖本地", "Changed, remote will overwrite local"),
    "remote-only": t(language, "远程新增，将下载到本地", "Remote-only, will download locally"),
    "local-only": t(language, "本地独有，不会下载", "Local-only, not downloadable")
  };

  return labels[type];
}

function formatDiffSizes(language: Language, diff: DownloadDiff): string {
  const local = diff.localSize === undefined ? t(language, "本地无", "no local") : formatBytes(diff.localSize);
  const remote = diff.remoteSize === undefined ? t(language, "远程无", "no remote") : formatBytes(diff.remoteSize);
  return t(language, `本地 ${local} / 远程 ${remote}`, `local ${local} / remote ${remote}`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function remoteTarget(form: ProfileFormState): string {
  if (!form.host && !form.remotePath) {
    return "";
  }

  return `${form.protocol.toUpperCase()} ${form.host || "-"}:${form.port || defaultPort(form.protocol)}${form.remotePath || "/"}`;
}

function shortPath(value: string): string {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);

  if (parts.length <= 3) {
    return value;
  }

  return `.../${parts.slice(-3).join("/")}`;
}

function defaultPort(protocol: TransferProtocol): string {
  return protocol === "ftp" ? "21" : "22";
}

function workspaceVerificationKey(workspaceId: string): string {
  return `${WORKSPACE_VERIFICATION_PREFIX}${workspaceId}`;
}

function workspaceConnectionFingerprint(form: WorkspaceFormState): string {
  const authMode = form.protocol === "ftp" ? "password" : form.authMode;

  return JSON.stringify({
    protocol: form.protocol,
    host: form.host.trim(),
    port: String(Number(form.port) || Number(defaultPort(form.protocol))),
    username: form.username.trim(),
    authMode,
    privateKeyPath: form.protocol === "ftp" ? "" : form.privateKeyPath.trim()
  });
}

function loadWorkspaceVerification(form: WorkspaceFormState, language: Language): ConnectionCheckState {
  if (!form.id) {
    return { status: "idle" };
  }

  const key = workspaceVerificationKey(form.id);
  const raw = window.localStorage.getItem(key);

  if (!raw) {
    return { status: "idle" };
  }

  try {
    const stored = JSON.parse(raw) as { fingerprint?: string };

    if (stored.fingerprint === workspaceConnectionFingerprint(form)) {
      return {
        status: "ok",
        message: t(language, "连接已验证。服务器信息未修改，可以直接浏览目录。", "Connection verified. Server details are unchanged.")
      };
    }
  } catch {
    window.localStorage.removeItem(key);
  }

  return { status: "idle" };
}

function rememberWorkspaceVerification(form: WorkspaceFormState): void {
  if (!form.id) {
    return;
  }

  window.localStorage.setItem(
    workspaceVerificationKey(form.id),
    JSON.stringify({
      fingerprint: workspaceConnectionFingerprint(form),
      verifiedAt: new Date().toISOString()
    })
  );
}

function clearWorkspaceVerification(workspaceId?: string): void {
  if (!workspaceId) {
    return;
  }

  window.localStorage.removeItem(workspaceVerificationKey(workspaceId));
}

function connectionCheckTitle(status: ConnectionCheckState["status"], language: Language): string {
  const titles = {
    idle: t(language, "连接未验证", "Connection not verified"),
    checking: t(language, "正在连接", "Connecting"),
    ok: t(language, "连接正常", "Connection ready"),
    error: t(language, "连接失败", "Connection failed")
  };

  return titles[status];
}

function friendlyConnectionError(rawMessage: string, language: Language): string {
  const message = rawMessage.replace(/^Error invoking remote method '[^']+':\s*/i, "").replace(/^Error:\s*/i, "");
  const lower = message.toLowerCase();

  if (lower.includes("authentication") || lower.includes("auth") || lower.includes("login")) {
    return t(
      language,
      `认证失败，请检查协议、用户名、密码、私钥或私钥口令。原始信息：${message}`,
      `Authentication failed. Check the protocol, username, password, private key, or passphrase. Details: ${message}`
    );
  }

  if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("econnrefused") || lower.includes("connect")) {
    return t(
      language,
      `无法连接服务器，请检查主机、端口、网络和防火墙。原始信息：${message}`,
      `Could not connect to the server. Check host, port, network, and firewall. Details: ${message}`
    );
  }

  return message;
}

function isConnectionField(key: keyof ProfileFormState): boolean {
  return [
    "protocol",
    "host",
    "port",
    "username",
    "authMode",
    "privateKeyPath",
    "password",
    "privateKeyPassphrase"
  ].includes(key);
}

function isWorkspaceConnectionField(key: keyof WorkspaceFormState): boolean {
  return [
    "protocol",
    "host",
    "port",
    "username",
    "authMode",
    "privateKeyPath",
    "password",
    "privateKeyPassphrase"
  ].includes(key);
}

function isWorkspaceSecretField(key: keyof WorkspaceFormState): boolean {
  return ["password", "privateKeyPassphrase"].includes(key);
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function t(language: Language, zh: string, en: string): string {
  return language === "zh" ? zh : en;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

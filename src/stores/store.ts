import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import type {
  AppConfig,
  AppConfigUpdate,
  ChatMessage,
  ClaudeModel,
  GitStatus,
  LogEntry,
  Project,
  ProjectInput,
  ServiceStatus,
  SystemCheck,
  TodoItem,
  ToolCall,
  ToolCallEvent,
  ToolResultEvent,
  View,
} from "../types";

interface AppState {
  config: AppConfig | null;
  systemCheck: SystemCheck | null;
  isInitialized: boolean;

  activeView: View;
  selectedProjectId: string | null;

  services: ServiceStatus[];
  servicesLoading: boolean;

  projects: Project[];
  gitStatuses: Record<string, GitStatus>;
  gitLoading: Record<string, boolean>;

  // Chat
  chatMessages: ChatMessage[];
  chatProjectId: string | null;
  chatModel: string;
  chatModels: ClaudeModel[];
  chatStreaming: boolean;

  // MySQL
  mysqlProjectId: string | null;
  mysqlQueryHistory: string[];

  logs: LogEntry[];
  globalError: string | null;
}

interface AppActions {
  setView: (view: View) => void;
  selectProject: (id: string | null) => void;
  setGlobalError: (err: string | null) => void;

  loadConfig: () => Promise<void>;
  loadSystemCheck: () => Promise<void>;
  loadServices: () => Promise<void>;
  loadProjects: () => Promise<void>;
  loadLogs: () => Promise<void>;
  refreshAll: () => Promise<void>;

  startService: (brewName: string) => Promise<void>;
  stopService: (brewName: string) => Promise<void>;
  restartService: (brewName: string) => Promise<void>;

  addProject: (input: ProjectInput) => Promise<Project>;
  updateProject: (id: string, input: ProjectInput) => Promise<Project>;
  removeProject: (id: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<Project>;
  duplicateProject: (id: string) => Promise<Project>;

  fetchGitStatus: (projectId: string, projectPath: string) => Promise<void>;
  gitFetch: (projectId: string, projectPath: string) => Promise<void>;
  gitPull: (projectId: string, projectPath: string) => Promise<void>;
  gitPush: (projectId: string, projectPath: string) => Promise<void>;
  gitCommit: (projectId: string, projectPath: string, message: string) => Promise<void>;
  gitStageAll: (projectPath: string) => Promise<void>;

  // Chat
  setChatModel: (model: string) => void;
  setChatProject: (projectId: string | null) => void;
  addChatMessage: (msg: ChatMessage) => void;
  updateLastAssistantMessage: (text: string, done: boolean) => void;
  upsertToolCall: (callId: string, data: Partial<ToolCall>) => void;
  clearChat: () => void;
  loadChatModels: () => Promise<void>;
  sendLogsToAgent: (projectId: string, message: string) => Promise<void>;

  // Todos (operate directly on the store's project list)
  addTodo: (projectId: string, text: string) => Promise<void>;
  updateTodo: (projectId: string, todoId: string, text?: string, completed?: boolean) => Promise<void>;
  deleteTodo: (projectId: string, todoId: string) => Promise<void>;

  // MySQL
  setMysqlProject: (projectId: string | null) => void;

  updateConfig: (update: AppConfigUpdate) => Promise<void>;
  clearLogs: () => Promise<void>;
}

type Store = AppState & AppActions;

export const useStore = create<Store>((set, get) => ({
  config: null,
  systemCheck: null,
  isInitialized: false,
  activeView: "dashboard",
  selectedProjectId: null,
  services: [],
  servicesLoading: false,
  projects: [],
  gitStatuses: {},
  gitLoading: {},
  chatMessages: [],
  chatProjectId: null,
  chatModel: "claude-sonnet-4-6",
  chatModels: [],
  chatStreaming: false,
  mysqlProjectId: null,
  mysqlQueryHistory: [],
  logs: [],
  globalError: null,

  setView: (view) => set({ activeView: view }),
  selectProject: (id) => set({ selectedProjectId: id }),
  setGlobalError: (err) => set({ globalError: err }),

  loadConfig: async () => {
    try {
      const config = await invoke<AppConfig>("get_config");
      set({ config, projects: config.projects, isInitialized: true });
    } catch (e) {
      set({ globalError: String(e) });
    }
  },

  loadSystemCheck: async () => {
    try {
      const check = await invoke<SystemCheck>("system_check");
      set({ systemCheck: check });
    } catch (e) {
      set({ globalError: String(e) });
    }
  },

  loadServices: async () => {
    set({ servicesLoading: true });
    try {
      const services = await invoke<ServiceStatus[]>("get_all_services_status");
      set({ services });
    } catch (e) {
      set({ globalError: String(e) });
    } finally {
      set({ servicesLoading: false });
    }
  },

  loadProjects: async () => {
    try {
      const projects = await invoke<Project[]>("get_projects");
      set({ projects });
    } catch (e) {
      set({ globalError: String(e) });
    }
  },

  loadLogs: async () => {
    try {
      const logs = await invoke<LogEntry[]>("get_logs");
      set({ logs });
    } catch (_) {}
  },

  refreshAll: async () => {
    const { loadConfig, loadServices, loadLogs } = get();
    await Promise.all([loadConfig(), loadServices(), loadLogs()]);
  },

  // ── Services ────────────────────────────────────────────────────────────────
  startService: async (brewName) => {
    set({ servicesLoading: true });
    try {
      const updated = await invoke<ServiceStatus>("start_service", { brewName });
      set((s) => ({ services: s.services.map((v) => v.brew_name === updated.brew_name ? updated : v) }));
      await get().loadLogs();
    } catch (e) { set({ globalError: String(e) }); }
    finally { set({ servicesLoading: false }); }
  },

  stopService: async (brewName) => {
    set({ servicesLoading: true });
    try {
      const updated = await invoke<ServiceStatus>("stop_service", { brewName });
      set((s) => ({ services: s.services.map((v) => v.brew_name === updated.brew_name ? updated : v) }));
      await get().loadLogs();
    } catch (e) { set({ globalError: String(e) }); }
    finally { set({ servicesLoading: false }); }
  },

  restartService: async (brewName) => {
    set({ servicesLoading: true });
    try {
      const updated = await invoke<ServiceStatus>("restart_service", { brewName });
      set((s) => ({ services: s.services.map((v) => v.brew_name === updated.brew_name ? updated : v) }));
      await get().loadLogs();
    } catch (e) { set({ globalError: String(e) }); }
    finally { set({ servicesLoading: false }); }
  },

  // ── Projects ────────────────────────────────────────────────────────────────
  addProject: async (input) => {
    const project = await invoke<Project>("add_project", { input });
    set((s) => ({ projects: [...s.projects, project] }));
    await get().loadLogs();
    return project;
  },

  updateProject: async (id, input) => {
    const updated = await invoke<Project>("update_project", { id, input });
    set((s) => ({ projects: s.projects.map((p) => p.id === id ? updated : p) }));
    return updated;
  },

  removeProject: async (id) => {
    await invoke("remove_project", { id });
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      gitStatuses: Object.fromEntries(Object.entries(s.gitStatuses).filter(([k]) => k !== id)),
      selectedProjectId: s.selectedProjectId === id ? null : s.selectedProjectId,
    }));
    await get().loadLogs();
  },

  renameProject: async (id, name) => {
    const updated = await invoke<Project>("rename_project", { id, name });
    set((s) => ({ projects: s.projects.map((p) => p.id === id ? updated : p) }));
    return updated;
  },

  duplicateProject: async (id) => {
    const project = await invoke<Project>("duplicate_project", { id });
    set((s) => ({ projects: [...s.projects, project] }));
    return project;
  },

  // ── Git ─────────────────────────────────────────────────────────────────────
  fetchGitStatus: async (projectId, projectPath) => {
    set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: true } }));
    try {
      const status = await invoke<GitStatus>("git_status", { projectPath });
      set((s) => ({ gitStatuses: { ...s.gitStatuses, [projectId]: status } }));
    } catch (_) {}
    finally { set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: false } })); }
  },

  gitFetch: async (projectId, projectPath) => {
    set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: true } }));
    try {
      const status = await invoke<GitStatus>("git_fetch", { projectPath });
      set((s) => ({ gitStatuses: { ...s.gitStatuses, [projectId]: status } }));
      await get().loadLogs();
    } catch (e) { set({ globalError: String(e) }); }
    finally { set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: false } })); }
  },

  gitPull: async (projectId, projectPath) => {
    set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: true } }));
    try {
      const status = await invoke<GitStatus>("git_pull", { projectPath });
      set((s) => ({ gitStatuses: { ...s.gitStatuses, [projectId]: status } }));
      await get().loadLogs();
    } catch (e) { set({ globalError: String(e) }); }
    finally { set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: false } })); }
  },

  gitPush: async (projectId, projectPath) => {
    set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: true } }));
    try {
      const status = await invoke<GitStatus>("git_push", { projectPath });
      set((s) => ({ gitStatuses: { ...s.gitStatuses, [projectId]: status } }));
      await get().loadLogs();
    } catch (e) { set({ globalError: String(e) }); }
    finally { set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: false } })); }
  },

  gitCommit: async (projectId, projectPath, message) => {
    set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: true } }));
    try {
      const status = await invoke<GitStatus>("git_commit", { projectPath, message });
      set((s) => ({ gitStatuses: { ...s.gitStatuses, [projectId]: status } }));
      await get().loadLogs();
    } catch (e) { set({ globalError: String(e) }); }
    finally { set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: false } })); }
  },

  gitStageAll: async (projectPath) => {
    await invoke("git_stage_all", { projectPath });
  },

  // ── Chat ─────────────────────────────────────────────────────────────────────
  setChatModel: (model) => set({ chatModel: model }),
  setChatProject: (projectId) => set({ chatProjectId: projectId }),

  addChatMessage: (msg) => set((s) => ({ chatMessages: [...s.chatMessages, msg] })),

  updateLastAssistantMessage: (text, done) => {
    set((s) => {
      const msgs = [...s.chatMessages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        const currentText = typeof last.content === "string"
          ? last.content
          : (last.content as any[]).find((b: any) => b.type === "text")?.text ?? "";
        msgs[msgs.length - 1] = {
          ...last,
          content: currentText + text,
          streaming: !done,
        };
      }
      return { chatMessages: msgs, chatStreaming: !done };
    });
  },

  upsertToolCall: (callId, data) => {
    set((s) => {
      const msgs = [...s.chatMessages];
      // Find last assistant message
      const idx = msgs.map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === "assistant")?.i;
      if (idx === undefined) return {};
      const msg = { ...msgs[idx] };
      const calls = [...(msg.toolCalls ?? [])];
      const existing = calls.findIndex((c) => c.call_id === callId);
      if (existing >= 0) {
        calls[existing] = { ...calls[existing], ...data };
      } else {
        calls.push({ call_id: callId, command: "", running: true, ...data });
      }
      msg.toolCalls = calls;
      msgs[idx] = msg;
      return { chatMessages: msgs };
    });
  },

  clearChat: () => set({ chatMessages: [], chatStreaming: false }),

  loadChatModels: async () => {
    try {
      const models = await invoke<ClaudeModel[]>("get_claude_models");
      set({ chatModels: models });
    } catch (_) {}
  },

  sendLogsToAgent: async (projectId, message) => {
    const store = get();

    // Navigate to chat with the project selected
    store.setView("chat");
    store.setChatProject(projectId);

    // Build the user message
    const uid = () => crypto.randomUUID();
    const userMsg: ChatMessage = { id: uid(), role: "user", content: message };
    store.addChatMessage(userMsg);

    // Placeholder assistant message
    const streamId = uid();
    const assistantMsg: ChatMessage = { id: uid(), role: "assistant", content: "", streaming: true };
    store.addChatMessage(assistantMsg);

    const project = store.projects.find((p) => p.id === projectId);

    // Listen for events
    const unlistenChunk  = await listen<string>(`claude-chunk-${streamId}`,       (ev) => store.updateLastAssistantMessage(ev.payload, false));
    const unlistenDone   = await listen(`claude-done-${streamId}`,                ()    => store.updateLastAssistantMessage("", true));
    const unlistenError  = await listen<string>(`claude-error-${streamId}`,       (ev) => store.updateLastAssistantMessage(`\n\n⚠ ${ev.payload}`, true));
    const unlistenTool   = await listen<ToolCallEvent>(`claude-tool-call-${streamId}`, (ev) => {
      store.upsertToolCall(ev.payload.call_id, { command: ev.payload.command, running: true });
    });
    const unlistenResult = await listen<ToolResultEvent>(`claude-tool-result-${streamId}`, (ev) => {
      store.upsertToolCall(ev.payload.call_id, {
        stdout: ev.payload.stdout,
        stderr: ev.payload.stderr,
        exit_code: ev.payload.exit_code,
        duration_ms: ev.payload.duration_ms,
        running: false,
      });
    });

    // Build conversation (just this one user message)
    const apiMessages = useStore.getState().chatMessages
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      await invoke("claude_send_message", {
        messages: apiMessages,
        model: store.chatModel,
        projectPath: project?.path ?? null,
        projectId: project?.id ?? null,
        projectName: project?.name ?? null,
        streamId,
      });
    } catch (e) {
      store.updateLastAssistantMessage(`\n\n⚠ ${String(e)}`, true);
    } finally {
      unlistenChunk(); unlistenDone(); unlistenError(); unlistenTool(); unlistenResult();
    }
  },

  // ── Todos ────────────────────────────────────────────────────────────────────
  addTodo: async (projectId, text) => {
    const todo = await invoke<TodoItem>("add_todo", { projectId, text });
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, todos: [...p.todos, todo] } : p
      ),
    }));
  },

  updateTodo: async (projectId, todoId, text, completed) => {
    const updated = await invoke<TodoItem>("update_todo", { projectId, todoId, text, completed });
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId
          ? { ...p, todos: p.todos.map((t) => t.id === todoId ? updated : t) }
          : p
      ),
    }));
  },

  deleteTodo: async (projectId, todoId) => {
    await invoke("delete_todo", { projectId, todoId });
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, todos: p.todos.filter((t) => t.id !== todoId) } : p
      ),
    }));
  },

  // ── MySQL ────────────────────────────────────────────────────────────────────
  setMysqlProject: (projectId) => set({ mysqlProjectId: projectId }),

  // ── Settings ────────────────────────────────────────────────────────────────
  updateConfig: async (update) => {
    const config = await invoke<AppConfig>("update_config", { update });
    set({ config });
  },

  clearLogs: async () => {
    await invoke("clear_logs");
    set({ logs: [] });
  },
}));

import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type {
  AppConfig,
  AppConfigUpdate,
  GitStatus,
  LogEntry,
  Project,
  ProjectInput,
  ServiceStatus,
  SystemCheck,
  View,
} from "../types";

interface AppState {
  // ── Meta ──────────────────────────────────────────────────────────────────
  config: AppConfig | null;
  systemCheck: SystemCheck | null;
  isInitialized: boolean;

  // ── View ──────────────────────────────────────────────────────────────────
  activeView: View;
  selectedProjectId: string | null;

  // ── Services ──────────────────────────────────────────────────────────────
  services: ServiceStatus[];
  servicesLoading: boolean;

  // ── Projects ──────────────────────────────────────────────────────────────
  projects: Project[];
  gitStatuses: Record<string, GitStatus>;
  gitLoading: Record<string, boolean>;

  // ── Logs ──────────────────────────────────────────────────────────────────
  logs: LogEntry[];

  // ── Error ─────────────────────────────────────────────────────────────────
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

  fetchGitStatus: (projectId: string, projectPath: string) => Promise<void>;
  gitFetch: (projectId: string, projectPath: string) => Promise<void>;
  gitPull: (projectId: string, projectPath: string) => Promise<void>;
  gitPush: (projectId: string, projectPath: string) => Promise<void>;

  updateConfig: (update: AppConfigUpdate) => Promise<void>;
  clearLogs: () => Promise<void>;
}

type Store = AppState & AppActions;

export const useStore = create<Store>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
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
  logs: [],
  globalError: null,

  // ── Navigation ─────────────────────────────────────────────────────────────
  setView: (view) => set({ activeView: view }),
  selectProject: (id) => set({ selectedProjectId: id }),
  setGlobalError: (err) => set({ globalError: err }),

  // ── Data loading ───────────────────────────────────────────────────────────
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
    } catch (e) {
      console.error("Failed to load logs:", e);
    }
  },

  refreshAll: async () => {
    const { loadConfig, loadServices, loadLogs } = get();
    await Promise.all([loadConfig(), loadServices(), loadLogs()]);
  },

  // ── Service actions ─────────────────────────────────────────────────────────
  startService: async (brewName) => {
    set({ servicesLoading: true });
    try {
      const updated = await invoke<ServiceStatus>("start_service", { brewName });
      set((s) => ({
        services: s.services.map((svc) =>
          svc.brew_name === updated.brew_name ? updated : svc
        ),
      }));
      await get().loadLogs();
    } catch (e) {
      set({ globalError: String(e) });
    } finally {
      set({ servicesLoading: false });
    }
  },

  stopService: async (brewName) => {
    set({ servicesLoading: true });
    try {
      const updated = await invoke<ServiceStatus>("stop_service", { brewName });
      set((s) => ({
        services: s.services.map((svc) =>
          svc.brew_name === updated.brew_name ? updated : svc
        ),
      }));
      await get().loadLogs();
    } catch (e) {
      set({ globalError: String(e) });
    } finally {
      set({ servicesLoading: false });
    }
  },

  restartService: async (brewName) => {
    set({ servicesLoading: true });
    try {
      const updated = await invoke<ServiceStatus>("restart_service", { brewName });
      set((s) => ({
        services: s.services.map((svc) =>
          svc.brew_name === updated.brew_name ? updated : svc
        ),
      }));
      await get().loadLogs();
    } catch (e) {
      set({ globalError: String(e) });
    } finally {
      set({ servicesLoading: false });
    }
  },

  // ── Project actions ─────────────────────────────────────────────────────────
  addProject: async (input) => {
    const project = await invoke<Project>("add_project", { input });
    set((s) => ({ projects: [...s.projects, project] }));
    await get().loadLogs();
    return project;
  },

  updateProject: async (id, input) => {
    const updated = await invoke<Project>("update_project", { id, input });
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? updated : p)),
    }));
    return updated;
  },

  removeProject: async (id) => {
    await invoke("remove_project", { id });
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      gitStatuses: Object.fromEntries(
        Object.entries(s.gitStatuses).filter(([k]) => k !== id)
      ),
      selectedProjectId: s.selectedProjectId === id ? null : s.selectedProjectId,
    }));
    await get().loadLogs();
  },

  // ── Git actions ─────────────────────────────────────────────────────────────
  fetchGitStatus: async (projectId, projectPath) => {
    set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: true } }));
    try {
      const status = await invoke<GitStatus>("git_status", {
        projectPath,
      });
      set((s) => ({
        gitStatuses: { ...s.gitStatuses, [projectId]: status },
      }));
    } catch (_) {
      // Git status failure is non-fatal (project may not have git init'd).
    } finally {
      set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: false } }));
    }
  },

  gitFetch: async (projectId, projectPath) => {
    set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: true } }));
    try {
      const status = await invoke<GitStatus>("git_fetch", { projectPath });
      set((s) => ({
        gitStatuses: { ...s.gitStatuses, [projectId]: status },
      }));
      await get().loadLogs();
    } catch (e) {
      set({ globalError: String(e) });
    } finally {
      set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: false } }));
    }
  },

  gitPull: async (projectId, projectPath) => {
    set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: true } }));
    try {
      const status = await invoke<GitStatus>("git_pull", { projectPath });
      set((s) => ({
        gitStatuses: { ...s.gitStatuses, [projectId]: status },
      }));
      await get().loadLogs();
    } catch (e) {
      set({ globalError: String(e) });
    } finally {
      set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: false } }));
    }
  },

  gitPush: async (projectId, projectPath) => {
    set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: true } }));
    try {
      const status = await invoke<GitStatus>("git_push", { projectPath });
      set((s) => ({
        gitStatuses: { ...s.gitStatuses, [projectId]: status },
      }));
      await get().loadLogs();
    } catch (e) {
      set({ globalError: String(e) });
    } finally {
      set((s) => ({ gitLoading: { ...s.gitLoading, [projectId]: false } }));
    }
  },

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

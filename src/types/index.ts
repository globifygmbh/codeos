// ── Project ───────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  path: string;
  local_url: string;
  port: number;
  git_remote: string | null;
  php_version: string | null;
  vhost_enabled: boolean;
  document_root: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectInput {
  name: string;
  path: string;
  local_url?: string;
  port?: number;
  git_remote?: string;
  php_version?: string;
  document_root?: string;
}

// ── Services ──────────────────────────────────────────────────────────────────

export type ServiceState = "running" | "stopped" | "error" | "unknown" | "notinstalled";

export interface ServiceStatus {
  name: string;
  brew_name: string;
  state: ServiceState;
  version: string | null;
  pid: number | null;
  port: number | null;
  error: string | null;
}

// ── Git ───────────────────────────────────────────────────────────────────────

export interface GitStatus {
  branch: string;
  local_commit: string;
  remote_commit: string | null;
  ahead: number;
  behind: number;
  has_conflicts: boolean;
  untracked_files: string[];
  modified_files: string[];
  staged_files: string[];
  last_commit_message: string | null;
  last_commit_date: string | null;
}

// ── System Check ──────────────────────────────────────────────────────────────

export interface ToolCheck {
  installed: boolean;
  version: string | null;
  path: string | null;
}

export interface SystemCheck {
  homebrew: ToolCheck;
  git: ToolCheck;
  apache: ToolCheck;
  mysql: ToolCheck;
  php: ToolCheck;
  homebrew_prefix: string | null;
}

// ── Config ────────────────────────────────────────────────────────────────────

export interface AppConfig {
  version: string;
  setup_completed: boolean;
  projects: Project[];
  homebrew_prefix: string | null;
  apache_service_name: string;
  mysql_service_name: string;
  php_service_name: string | null;
  auto_check_git_updates: boolean;
  git_check_interval_minutes: number;
  log_level: string;
  vhost_management_enabled: boolean;
}

export interface AppConfigUpdate {
  apache_service_name?: string;
  mysql_service_name?: string;
  php_service_name?: string;
  auto_check_git_updates?: boolean;
  git_check_interval_minutes?: number;
  log_level?: string;
  vhost_management_enabled?: boolean;
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export type LogLevel = "info" | "warn" | "error" | "success" | "debug";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
  source: string;
}

// ── UI State ──────────────────────────────────────────────────────────────────

export type View = "dashboard" | "projects" | "settings" | "logs";

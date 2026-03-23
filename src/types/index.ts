// ── Project ───────────────────────────────────────────────────────────────────

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface MysqlConfig {
  host: string;
  port: number;
  user: string;
  database: string;
}

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
  todos: TodoItem[];
  mysql_config: MysqlConfig | null;
  credentials: CredentialEntry[];
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

export interface GitLogEntry {
  hash: string;
  short: string;
  message: string;
  author: string;
  date: string;
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
  preferred_browser: string | null;
}

export interface AppConfigUpdate {
  apache_service_name?: string;
  mysql_service_name?: string;
  php_service_name?: string;
  auto_check_git_updates?: boolean;
  git_check_interval_minutes?: number;
  log_level?: string;
  vhost_management_enabled?: boolean;
  preferred_browser?: string | null;
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

// ── Project log ───────────────────────────────────────────────────────────────

export interface ProjectLogEntry {
  timestamp: string;
  level: string;
  message: string;
  source: string;
}

// ── Command output (agent tool use) ──────────────────────────────────────────

export interface CommandOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  command: string;
}

// ── Tool call / result blocks (shown inside chat messages) ───────────────────

export interface ToolCallEvent {
  call_id: string;
  command: string;
  round: number;
}

export interface ToolResultEvent {
  call_id: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export interface ToolCall {
  call_id: string;
  command: string;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
  duration_ms?: number;
  running?: boolean;
}

export interface ChatMessage {
  id: string;          // frontend-only, for React keys
  role: "user" | "assistant";
  content: ContentBlock[] | string;
  streaming?: boolean; // true while the assistant is still writing
  error?: string;
  // Tool calls made by this assistant message
  toolCalls?: ToolCall[];
}

export interface ClaudeModel {
  id: string;
  name: string;
  description: string;
}

// ── MySQL query result ────────────────────────────────────────────────────────

export interface QueryResult {
  columns: string[];
  rows: string[][];
  row_count: number;
  affected_rows: number | null;
}

// ── Credentials ───────────────────────────────────────────────────────────────

export interface CredentialField {
  key: string;
  value: string;
  secret: boolean;
}

export type CredentialCategory = "login" | "database" | "api" | "env" | "note";

export interface CredentialEntry {
  id: string;
  label: string;
  category: CredentialCategory;
  fields: CredentialField[];
  created_at: string;
}

// ── File editor ───────────────────────────────────────────────────────────────

export interface FileEntry {
  name: string;
  path: string;       // relative to project root
  full_path: string;
  is_dir: boolean;
  extension: string | null;
  size: number | null;
}

// ── UI ────────────────────────────────────────────────────────────────────────

export type View = "dashboard" | "projects" | "chat" | "editor" | "mysql" | "logs" | "settings";

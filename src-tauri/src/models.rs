use chrono::Local;
use serde::{Deserialize, Serialize};

// ── Todo ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoItem {
    pub id: String,
    pub text: String,
    pub completed: bool,
    pub created_at: String,
    pub updated_at: String,
}

// ── MySQL connection config (per project) ────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MysqlConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub database: String,
    // Password stored in Keychain: account = "mysql-<project_id>"
}

impl Default for MysqlConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".into(),
            port: 3306,
            user: "root".into(),
            database: String::new(),
        }
    }
}

// ── Project ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub local_url: String,
    pub port: u16,
    pub git_remote: Option<String>,
    pub php_version: Option<String>,
    pub vhost_enabled: bool,
    pub document_root: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub todos: Vec<TodoItem>,
    #[serde(default)]
    pub mysql_config: Option<MysqlConfig>,
    /// Free-form credential/info entries (login, DB, API keys, notes)
    #[serde(default)]
    pub credentials: Vec<CredentialEntry>,
}

// ── Credential entry (per project) ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialEntry {
    pub id: String,
    pub label: String,       // e.g. "Admin Login", "MySQL", "API Key"
    pub category: String,    // "login" | "database" | "api" | "env" | "note"
    pub fields: Vec<CredentialField>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialField {
    pub key: String,   // e.g. "URL", "Benutzername", "Passwort"
    pub value: String,
    pub secret: bool,  // if true, value is hidden by default in UI
}

impl Project {
    pub fn new(name: String, path: String) -> Self {
        let now = Local::now().to_rfc3339();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            path,
            local_url: String::from("http://localhost:8080"),
            port: 8080,
            git_remote: None,
            php_version: None,
            vhost_enabled: false,
            document_root: None,
            created_at: now.clone(),
            updated_at: now,
            todos: Vec::new(),
            mysql_config: None,
            credentials: Vec::new(),
        }
    }
}

// ── Service ───────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ServiceState {
    Running,
    Stopped,
    Error,
    Unknown,
    NotInstalled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceStatus {
    pub name: String,
    pub brew_name: String,
    pub state: ServiceState,
    pub version: Option<String>,
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub error: Option<String>,
}

// ── Git ───────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub branch: String,
    pub local_commit: String,
    pub remote_commit: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub has_conflicts: bool,
    pub untracked_files: Vec<String>,
    pub modified_files: Vec<String>,
    pub staged_files: Vec<String>,
    pub last_commit_message: Option<String>,
    pub last_commit_date: Option<String>,
}

// ── System check ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCheck {
    pub installed: bool,
    pub version: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemCheck {
    pub homebrew: ToolCheck,
    pub git: ToolCheck,
    pub apache: ToolCheck,
    pub mysql: ToolCheck,
    pub php: ToolCheck,
    pub homebrew_prefix: Option<String>,
}

// ── Log ───────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Info,
    Warn,
    Error,
    Success,
    Debug,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub id: String,
    pub timestamp: String,
    pub level: LogLevel,
    pub message: String,
    pub source: String,
}

impl LogEntry {
    pub fn new(level: LogLevel, message: impl Into<String>, source: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            timestamp: Local::now().to_rfc3339(),
            level,
            message: message.into(),
            source: source.into(),
        }
    }
}

// ── App Config ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub version: String,
    pub setup_completed: bool,
    pub projects: Vec<Project>,
    pub homebrew_prefix: Option<String>,
    pub apache_service_name: String,
    pub mysql_service_name: String,
    pub php_service_name: Option<String>,
    pub auto_check_git_updates: bool,
    pub git_check_interval_minutes: u32,
    pub log_level: String,
    pub vhost_management_enabled: bool,
    /// Preferred browser for opening project URLs.
    /// None = system default. e.g. "Google Chrome", "Firefox", "Safari"
    #[serde(default)]
    pub preferred_browser: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            setup_completed: false,
            projects: Vec::new(),
            homebrew_prefix: None,
            apache_service_name: String::from("httpd"),
            mysql_service_name: String::from("mysql"),
            php_service_name: None,
            auto_check_git_updates: false,
            git_check_interval_minutes: 15,
            log_level: String::from("info"),
            vhost_management_enabled: false,
            preferred_browser: None,
        }
    }
}

// ── Input DTOs ────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct ProjectInput {
    pub name: String,
    pub path: String,
    pub local_url: Option<String>,
    pub port: Option<u16>,
    pub git_remote: Option<String>,
    pub php_version: Option<String>,
    pub document_root: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AppConfigUpdate {
    pub apache_service_name: Option<String>,
    pub mysql_service_name: Option<String>,
    pub php_service_name: Option<String>,
    pub auto_check_git_updates: Option<bool>,
    pub git_check_interval_minutes: Option<u32>,
    pub log_level: Option<String>,
    pub vhost_management_enabled: Option<bool>,
    #[allow(dead_code)]
    pub preferred_browser: Option<String>,
}

// ── MySQL query result ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub row_count: usize,
    pub affected_rows: Option<u64>,
}

// ── Project log ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectLogEntry {
    pub timestamp: String,
    pub level: String,   // "info" | "warn" | "error" | "success" | "debug"
    pub message: String,
    pub source: String,
}

// ── File entry (for project file browser) ────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,        // relative to project root
    pub full_path: String,   // absolute path on disk
    pub is_dir: bool,
    pub extension: Option<String>,
    pub size: Option<u64>,
}

// ── Command output (agent tool use) ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub duration_ms: u64,
    pub command: String,
}

use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};

// ── Project ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    /// Absolute path to the project root on disk.
    pub path: String,
    /// e.g. "http://localhost:8080/myproject" or a custom vhost URL.
    pub local_url: String,
    /// Port used (default 8080 for Apache, custom for per-project servers).
    pub port: u16,
    /// Remote Git URL, e.g. "https://github.com/user/repo.git"
    pub git_remote: Option<String>,
    /// Preferred PHP version string, e.g. "8.3"
    pub php_version: Option<String>,
    /// Whether a named VirtualHost has been generated for this project.
    pub vhost_enabled: bool,
    /// Custom Apache document root override (defaults to `path`).
    pub document_root: Option<String>,
    pub created_at: String,
    pub updated_at: String,
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
    /// Human-readable display name.
    pub name: String,
    /// Brew service identifier, e.g. "httpd", "mysql@8.4", "php".
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
    /// Commits the local branch is ahead of remote.
    pub ahead: u32,
    /// Commits the local branch is behind remote.
    pub behind: u32,
    pub has_conflicts: bool,
    pub untracked_files: Vec<String>,
    pub modified_files: Vec<String>,
    pub staged_files: Vec<String>,
    pub last_commit_message: Option<String>,
    pub last_commit_date: Option<String>,
}

// ── System check ─────────────────────────────────────────────────────────────

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
    /// Homebrew prefix, e.g. "/opt/homebrew" (Apple Silicon) or "/usr/local" (Intel).
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
    /// Detected Homebrew prefix.
    pub homebrew_prefix: Option<String>,
    /// Brew service name for Apache httpd.
    pub apache_service_name: String,
    /// Brew service name for MySQL (e.g. "mysql" or "mysql@8.4").
    pub mysql_service_name: String,
    /// Brew service name for PHP-FPM (e.g. "php" or "php@8.3"), if managed.
    pub php_service_name: Option<String>,
    /// Auto-check remote git for updates.
    pub auto_check_git_updates: bool,
    /// Interval in minutes for background git remote checks.
    pub git_check_interval_minutes: u32,
    /// Log verbosity: "debug" | "info" | "warn" | "error".
    pub log_level: String,
    /// Whether Apache VHost management is enabled.
    pub vhost_management_enabled: bool,
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
        }
    }
}

// ── Input DTOs (from frontend) ────────────────────────────────────────────────

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
}

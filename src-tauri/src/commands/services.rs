use std::process::Command;
use tauri::State;

use crate::config;
use crate::log_store::LogStore;
use crate::models::{LogLevel, ServiceState, ServiceStatus};

// ── Prefix resolution ─────────────────────────────────────────────────────────

/// Return a valid Homebrew prefix with packages installed.
/// If the stored prefix has a non-empty Cellar, use it.
/// Otherwise probe known locations and return the one with packages.
fn resolve_prefix(stored: &Option<String>) -> String {
    if let Some(p) = stored {
        if has_cellar(p) {
            return p.clone();
        }
    }
    for brew in &["/opt/homebrew/bin/brew", "/usr/local/bin/brew"] {
        if !std::path::Path::new(brew).exists() {
            continue;
        }
        if let Ok(out) = Command::new(brew).arg("--prefix").output() {
            if out.status.success() {
                let prefix = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if has_cellar(&prefix) {
                    return prefix;
                }
            }
        }
    }
    stored.clone().unwrap_or_else(|| "/usr/local".to_string())
}

fn has_cellar(prefix: &str) -> bool {
    let cellar = format!("{}/Cellar", prefix);
    std::fs::read_dir(&cellar)
        .map(|mut rd| rd.next().is_some())
        .unwrap_or(false)
}

// ── Installation check ────────────────────────────────────────────────────────

/// Returns true if the given Homebrew formula is installed.
/// Checks `{prefix}/opt/{name}` (most reliable) and key binaries.
fn is_brew_installed(prefix: &str, name: &str) -> bool {
    // `brew install foo` always creates {prefix}/opt/{name}
    if std::path::Path::new(&format!("{}/opt/{}", prefix, name)).exists() {
        return true;
    }
    // Prefix-match opt entries (e.g. config "mysql" matches "mysql@8.4")
    if let Ok(rd) = std::fs::read_dir(format!("{}/opt", prefix)) {
        for entry in rd.flatten() {
            let entry_name = entry.file_name();
            let entry_str = entry_name.to_string_lossy();
            if entry_str.starts_with(name) {
                return true;
            }
        }
    }
    false
}

// ── Running state via launchctl ───────────────────────────────────────────────

/// Query launchctl for the service state.
/// Label convention: `homebrew.mxcl.<brew_name>`
fn launchctl_state(service_name: &str) -> ServiceState {
    let label = format!("homebrew.mxcl.{}", service_name);
    let out = Command::new("/bin/launchctl")
        .args(["list", &label])
        .output();
    match out {
        Ok(o) if o.status.success() => {
            // Output contains "PID" = <number> when the process is running.
            let s = String::from_utf8_lossy(&o.stdout);
            if s.contains("\"PID\"") {
                ServiceState::Running
            } else {
                ServiceState::Stopped
            }
        }
        // Not loaded → stopped (but installed).
        _ => ServiceState::Stopped,
    }
}

/// Determine the full state of a single service.
fn service_state(prefix: &str, config_name: &str) -> (ServiceState, String) {
    if !is_brew_installed(prefix, config_name) {
        return (ServiceState::NotInstalled, config_name.to_string());
    }
    // Resolve the real opt name (e.g. "mysql" → "mysql@8.4").
    let real_name = resolve_opt_name(prefix, config_name);
    let state = launchctl_state(&real_name);
    (state, real_name)
}

/// Returns the actual directory name under `{prefix}/opt/` that matches
/// `config_name` (exact first, then prefix match).
fn resolve_opt_name(prefix: &str, config_name: &str) -> String {
    let exact = format!("{}/opt/{}", prefix, config_name);
    if std::path::Path::new(&exact).exists() {
        return config_name.to_string();
    }
    if let Ok(rd) = std::fs::read_dir(format!("{}/opt", prefix)) {
        for entry in rd.flatten() {
            let n = entry.file_name().to_string_lossy().to_string();
            if n.starts_with(config_name) {
                return n;
            }
        }
    }
    config_name.to_string()
}

// ── Version helpers ───────────────────────────────────────────────────────────

fn apache_version(prefix: &str) -> Option<String> {
    let bin = format!("{}/bin/httpd", prefix);
    let out = Command::new(&bin).arg("-v").output().ok()?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    stdout
        .lines()
        .find(|l| l.starts_with("Server version"))
        .and_then(|l| l.split('/').nth(1))
        .map(|s| s.split_whitespace().next().unwrap_or("").to_string())
}

fn mysql_version(prefix: &str) -> Option<String> {
    let bin = format!("{}/bin/mysql", prefix);
    let out = Command::new(&bin).arg("--version").output().ok()?;
    let s = String::from_utf8_lossy(&out.stdout);
    Some(s.trim().to_string())
}

fn php_version(prefix: &str) -> Option<String> {
    let bin = format!("{}/bin/php", prefix);
    let out = Command::new(&bin).arg("--version").output().ok()?;
    let s = String::from_utf8_lossy(&out.stdout);
    s.lines().next().map(|l| l.trim().to_string())
}

// ── Get port from httpd.conf ──────────────────────────────────────────────────

fn apache_port(prefix: &str) -> Option<u16> {
    let conf = format!("{}/etc/httpd/httpd.conf", prefix);
    let content = std::fs::read_to_string(&conf).ok()?;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Listen ") && !trimmed.contains(':') {
            if let Some(port_str) = trimmed.split_whitespace().nth(1) {
                return port_str.parse().ok();
            }
        }
    }
    None
}

// ── brew services action (start / stop / restart) ────────────────────────────

fn brew_bin(prefix: &str) -> String {
    let candidate = format!("{}/bin/brew", prefix);
    if std::path::Path::new(&candidate).exists() {
        return candidate;
    }
    for fb in &["/opt/homebrew/bin/brew", "/usr/local/bin/brew"] {
        if std::path::Path::new(fb).exists() {
            return fb.to_string();
        }
    }
    "brew".to_string()
}

fn brew_service_action(prefix: &str, action: &str, service_name: &str) -> Result<String, String> {
    let out = Command::new(brew_bin(prefix))
        .args(["services", action, service_name])
        .output()
        .map_err(|e| format!("brew services {} failed: {}", action, e))?;

    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();

    if out.status.success() {
        Ok(stdout)
    } else {
        Err(if !stderr.is_empty() { stderr } else { stdout })
    }
}

// ── Tauri Commands ────────────────────────────────────────────────────────────

/// Returns status for Apache, MySQL, and (optionally) PHP services.
#[tauri::command]
pub async fn get_all_services_status(logs: State<'_, LogStore>) -> Result<Vec<ServiceStatus>, String> {
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let prefix = resolve_prefix(&cfg.homebrew_prefix);

    logs.push(LogLevel::Debug, format!("Checking services (prefix: {})", prefix), "services");

    let (apache_state, apache_real) = service_state(&prefix, &cfg.apache_service_name);
    let (mysql_state,  mysql_real)  = service_state(&prefix, &cfg.mysql_service_name);

    logs.push(LogLevel::Debug,
        format!("apache={:?} ({}), mysql={:?} ({})", apache_state, apache_real, mysql_state, mysql_real),
        "services");

    let apache = ServiceStatus {
        name: "Apache (httpd)".into(),
        brew_name: apache_real,
        state: apache_state,
        version: apache_version(&prefix),
        pid: None,
        port: apache_port(&prefix),
        error: None,
    };

    let mysql = ServiceStatus {
        name: "MySQL".into(),
        brew_name: mysql_real,
        state: mysql_state,
        version: mysql_version(&prefix),
        pid: None,
        port: Some(3306),
        error: None,
    };

    let mut statuses = vec![apache, mysql];

    if let Some(ref php_svc) = cfg.php_service_name {
        let (php_state, php_real) = service_state(&prefix, php_svc);
        statuses.push(ServiceStatus {
            name: "PHP-FPM".into(),
            brew_name: php_real,
            state: php_state,
            version: php_version(&prefix),
            pid: None,
            port: Some(9000),
            error: None,
        });
    }

    Ok(statuses)
}

/// Starts a Homebrew service by its brew name.
#[tauri::command]
pub async fn start_service(brew_name: String, logs: State<'_, LogStore>) -> Result<ServiceStatus, String> {
    logs.push(LogLevel::Info, format!("Starting service: {}", brew_name), "services");
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let prefix = resolve_prefix(&cfg.homebrew_prefix);

    brew_service_action(&prefix, "start", &brew_name)
        .map_err(|e| {
            logs.push(LogLevel::Error, format!("Start {} failed: {}", brew_name, e), "services");
            e
        })?;

    logs.push(LogLevel::Success, format!("Service {} started", brew_name), "services");
    single_service_status(&brew_name).await
}

/// Stops a Homebrew service by its brew name.
#[tauri::command]
pub async fn stop_service(brew_name: String, logs: State<'_, LogStore>) -> Result<ServiceStatus, String> {
    logs.push(LogLevel::Info, format!("Stopping service: {}", brew_name), "services");
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let prefix = resolve_prefix(&cfg.homebrew_prefix);

    brew_service_action(&prefix, "stop", &brew_name)
        .map_err(|e| {
            logs.push(LogLevel::Error, format!("Stop {} failed: {}", brew_name, e), "services");
            e
        })?;

    logs.push(LogLevel::Info, format!("Service {} stopped", brew_name), "services");
    single_service_status(&brew_name).await
}

/// Restarts a Homebrew service by its brew name.
#[tauri::command]
pub async fn restart_service(brew_name: String, logs: State<'_, LogStore>) -> Result<ServiceStatus, String> {
    logs.push(LogLevel::Info, format!("Restarting service: {}", brew_name), "services");
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let prefix = resolve_prefix(&cfg.homebrew_prefix);

    brew_service_action(&prefix, "restart", &brew_name)
        .map_err(|e| {
            logs.push(LogLevel::Error, format!("Restart {} failed: {}", brew_name, e), "services");
            e
        })?;

    logs.push(LogLevel::Success, format!("Service {} restarted", brew_name), "services");
    single_service_status(&brew_name).await
}

/// Returns a single service status by brew name.
#[tauri::command]
pub async fn get_service_status(brew_name: String) -> Result<ServiceStatus, String> {
    single_service_status(&brew_name).await
}

/// Helper: query status for one service.
async fn single_service_status(brew_name: &str) -> Result<ServiceStatus, String> {
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let prefix = resolve_prefix(&cfg.homebrew_prefix);

    let (state, real_name) = service_state(&prefix, brew_name);

    let display_name = if brew_name.starts_with("httpd") {
        "Apache (httpd)"
    } else if brew_name.starts_with("mysql") {
        "MySQL"
    } else if brew_name.starts_with("php") {
        "PHP-FPM"
    } else {
        brew_name
    };

    Ok(ServiceStatus {
        name: display_name.to_string(),
        brew_name: real_name,
        state,
        version: None,
        pid: None,
        port: None,
        error: None,
    })
}

/// Read the last N lines from the Apache error log.
#[tauri::command]
pub async fn get_apache_error_log(lines: Option<u32>) -> Result<String, String> {
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let prefix = resolve_prefix(&cfg.homebrew_prefix);
    let log_path = format!("{}/var/log/httpd/error_log", prefix);
    let n = lines.unwrap_or(100).to_string();

    let out = Command::new("tail")
        .args(["-n", &n, &log_path])
        .output()
        .map_err(|e| format!("Failed to read Apache error log: {}", e))?;

    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

/// Read the last N lines from the MySQL error log.
#[tauri::command]
pub async fn get_mysql_error_log(lines: Option<u32>) -> Result<String, String> {
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let prefix = resolve_prefix(&cfg.homebrew_prefix);
    let log_path = format!("{}/var/mysql/*.err", prefix);
    let n = lines.unwrap_or(100).to_string();

    let out = Command::new("sh")
        .args(["-c", &format!("tail -n {} {} 2>/dev/null || echo 'Log not found'", n, log_path)])
        .output()
        .map_err(|e| format!("Failed to read MySQL error log: {}", e))?;

    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

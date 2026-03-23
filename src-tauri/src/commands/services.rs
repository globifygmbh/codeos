use std::process::Command;
use tauri::State;

use crate::config;
use crate::log_store::LogStore;
use crate::models::{LogLevel, ServiceState, ServiceStatus};

// ── `brew services list` parser ───────────────────────────────────────────────

#[derive(Debug)]
struct BrewServiceEntry {
    name: String,
    status: String,
    #[allow(dead_code)]
    user: Option<String>,
}

fn parse_brew_services_list(output: &str) -> Vec<BrewServiceEntry> {
    output
        .lines()
        .skip(1) // skip header row
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let cols: Vec<&str> = line.split_whitespace().collect();
            BrewServiceEntry {
                name: cols.first().unwrap_or(&"").to_string(),
                status: cols.get(1).unwrap_or(&"none").to_string(),
                user: cols.get(2).map(|s| s.to_string()),
            }
        })
        .collect()
}

/// Find the best matching brew service name for a given prefix.
/// e.g. prefix "mysql" will match "mysql@8.4".
fn find_service<'a>(entries: &'a [BrewServiceEntry], preferred: &str) -> Option<&'a BrewServiceEntry> {
    // Exact match first.
    if let Some(e) = entries.iter().find(|e| e.name == preferred) {
        return Some(e);
    }
    // Prefix match (e.g. "mysql" matches "mysql@8.4").
    entries.iter().find(|e| e.name.starts_with(preferred))
}

// ── Version helpers ───────────────────────────────────────────────────────────

fn apache_version(prefix: &str) -> Option<String> {
    let bin = format!("{}/bin/httpd", prefix);
    let out = Command::new(&bin).arg("-v").output().ok()?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    // "Server version: Apache/2.4.62 (Homebrew)"
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

// ── Core service functions ────────────────────────────────────────────────────

/// Resolve the absolute path to the `brew` binary.
/// Uses the stored homebrew_prefix from config, or falls back to known locations.
fn brew_bin() -> String {
    if let Ok(cfg) = config::load_config() {
        if let Some(prefix) = cfg.homebrew_prefix {
            return format!("{}/bin/brew", prefix);
        }
    }
    // Fallback: check known locations directly.
    for candidate in &["/opt/homebrew/bin/brew", "/usr/local/bin/brew"] {
        if std::path::Path::new(candidate).exists() {
            return candidate.to_string();
        }
    }
    "brew".to_string() // last resort
}

fn brew_services_list(logs: &LogStore) -> Result<Vec<BrewServiceEntry>, String> {
    let brew = brew_bin();
    logs.push(LogLevel::Debug, format!("brew binary: {}", brew), "services");
    let out = Command::new(&brew)
        .args(["services", "list"])
        .output()
        .map_err(|e| format!("Failed to run `{} services list`: {}", brew, e))?;
    let raw = String::from_utf8_lossy(&out.stdout).to_string();
    logs.push(LogLevel::Debug, format!("brew services list output:\n{}", raw.trim()), "services");
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(parse_brew_services_list(&raw))
}

fn brew_service_action(action: &str, service_name: &str) -> Result<String, String> {
    let out = Command::new(brew_bin())
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

fn state_from_str(s: &str) -> ServiceState {
    match s.to_lowercase().as_str() {
        "started" | "running" => ServiceState::Running,
        "stopped" | "none" | "" => ServiceState::Stopped,
        "error" => ServiceState::Error,
        _ => ServiceState::Unknown,
    }
}

// ── Tauri Commands ────────────────────────────────────────────────────────────

/// Returns status for Apache, MySQL, and PHP services.
#[tauri::command]
pub async fn get_all_services_status(logs: State<'_, LogStore>) -> Result<Vec<ServiceStatus>, String> {
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let prefix = cfg.homebrew_prefix.clone().unwrap_or_else(|| "/opt/homebrew".to_string());

    let entries = match brew_services_list(&logs) {
        Ok(e) => e,
        Err(err) => {
            logs.push(LogLevel::Error, format!("brew services list failed: {}", err), "services");
            // Return "not installed" statuses when brew is unavailable.
            return Ok(vec![
                ServiceStatus {
                    name: "Apache".into(),
                    brew_name: cfg.apache_service_name.clone(),
                    state: ServiceState::NotInstalled,
                    version: None, pid: None, port: None,
                    error: Some(err.clone()),
                },
                ServiceStatus {
                    name: "MySQL".into(),
                    brew_name: cfg.mysql_service_name.clone(),
                    state: ServiceState::NotInstalled,
                    version: None, pid: None, port: None,
                    error: Some(err.clone()),
                },
            ]);
        }
    };

    let apache_entry = find_service(&entries, &cfg.apache_service_name);
    let mysql_entry  = find_service(&entries, &cfg.mysql_service_name);

    let apache = ServiceStatus {
        name: "Apache (httpd)".into(),
        brew_name: apache_entry
            .map(|e| e.name.clone())
            .unwrap_or_else(|| cfg.apache_service_name.clone()),
        state: apache_entry
            .map(|e| state_from_str(&e.status))
            .unwrap_or(ServiceState::NotInstalled),
        version: apache_version(&prefix),
        pid: None,
        port: apache_port(&prefix),
        error: None,
    };

    let mysql = ServiceStatus {
        name: "MySQL".into(),
        brew_name: mysql_entry
            .map(|e| e.name.clone())
            .unwrap_or_else(|| cfg.mysql_service_name.clone()),
        state: mysql_entry
            .map(|e| state_from_str(&e.status))
            .unwrap_or(ServiceState::NotInstalled),
        version: mysql_version(&prefix),
        pid: None,
        port: Some(3306),
        error: None,
    };

    let mut statuses = vec![apache, mysql];

    // PHP-FPM is optional — only include if configured.
    if let Some(ref php_svc) = cfg.php_service_name {
        let php_entry = find_service(&entries, php_svc);
        statuses.push(ServiceStatus {
            name: "PHP-FPM".into(),
            brew_name: php_entry
                .map(|e| e.name.clone())
                .unwrap_or_else(|| php_svc.clone()),
            state: php_entry
                .map(|e| state_from_str(&e.status))
                .unwrap_or(ServiceState::NotInstalled),
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
    logs.push(
        LogLevel::Info,
        format!("Starting service: {}", brew_name),
        "services",
    );

    brew_service_action("start", &brew_name)
        .map_err(|e| {
            logs.push(LogLevel::Error, format!("Start {} failed: {}", brew_name, e), "services");
            e
        })?;

    logs.push(LogLevel::Success, format!("Service {} started", brew_name), "services");
    // Return fresh status.
    single_service_status(&brew_name).await
}

/// Stops a Homebrew service by its brew name.
#[tauri::command]
pub async fn stop_service(brew_name: String, logs: State<'_, LogStore>) -> Result<ServiceStatus, String> {
    logs.push(
        LogLevel::Info,
        format!("Stopping service: {}", brew_name),
        "services",
    );

    brew_service_action("stop", &brew_name)
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
    logs.push(
        LogLevel::Info,
        format!("Restarting service: {}", brew_name),
        "services",
    );

    brew_service_action("restart", &brew_name)
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
    let entries = brew_services_list()?;
    let entry = find_service(&entries, brew_name);

    // Guess display name from brew_name.
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
        brew_name: entry.map(|e| e.name.clone()).unwrap_or_else(|| brew_name.to_string()),
        state: entry
            .map(|e| state_from_str(&e.status))
            .unwrap_or(ServiceState::NotInstalled),
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
    let prefix = cfg.homebrew_prefix.unwrap_or_else(|| "/opt/homebrew".to_string());
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
    let prefix = cfg.homebrew_prefix.unwrap_or_else(|| "/opt/homebrew".to_string());
    let log_path = format!("{}/var/mysql/*.err", prefix);
    let n = lines.unwrap_or(100).to_string();

    // Use shell glob expansion for the err file.
    let out = Command::new("sh")
        .args(["-c", &format!("tail -n {} {} 2>/dev/null || echo 'Log not found'", n, log_path)])
        .output()
        .map_err(|e| format!("Failed to read MySQL error log: {}", e))?;

    Ok(String::from_utf8_lossy(&out.stdout).to_string())
}

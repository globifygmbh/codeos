use tauri::State;

use crate::config;
use crate::log_store::LogStore;
use crate::models::{AppConfig, AppConfigUpdate, LogEntry, LogLevel};

/// Return the current AppConfig.
#[tauri::command]
pub async fn get_config() -> Result<AppConfig, String> {
    config::load_config().map_err(|e| e.to_string())
}

/// Apply a partial update to AppConfig.
#[tauri::command]
pub async fn update_config(
    update: AppConfigUpdate,
    logs: State<'_, LogStore>,
) -> Result<AppConfig, String> {
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;

    if let Some(v) = update.apache_service_name {
        cfg.apache_service_name = v;
    }
    if let Some(v) = update.mysql_service_name {
        cfg.mysql_service_name = v;
    }
    if let Some(v) = update.php_service_name {
        cfg.php_service_name = if v.is_empty() { None } else { Some(v) };
    }
    if let Some(v) = update.auto_check_git_updates {
        cfg.auto_check_git_updates = v;
    }
    if let Some(v) = update.git_check_interval_minutes {
        cfg.git_check_interval_minutes = v;
    }
    if let Some(v) = update.log_level {
        cfg.log_level = v;
    }
    if let Some(v) = update.vhost_management_enabled {
        cfg.vhost_management_enabled = v;
    }

    config::save_config(&cfg).map_err(|e| e.to_string())?;
    logs.push(LogLevel::Info, "Settings updated", "settings");
    Ok(cfg)
}

/// Returns all in-memory log entries.
#[tauri::command]
pub async fn get_logs(logs: State<'_, LogStore>) -> Result<Vec<LogEntry>, String> {
    Ok(logs.entries())
}

/// Clears the in-memory log buffer.
#[tauri::command]
pub async fn clear_logs(logs: State<'_, LogStore>) -> Result<(), String> {
    logs.clear();
    Ok(())
}

/// Returns the config directory path.
#[tauri::command]
pub async fn get_config_dir() -> Result<String, String> {
    config::config_dir()
        .map(|p| p.display().to_string())
        .map_err(|e| e.to_string())
}

/// Mark setup as incomplete (for re-running the wizard).
#[tauri::command]
pub async fn reset_setup(logs: State<'_, LogStore>) -> Result<(), String> {
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    cfg.setup_completed = false;
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    logs.push(LogLevel::Info, "Setup reset — wizard will run on next launch", "settings");
    Ok(())
}

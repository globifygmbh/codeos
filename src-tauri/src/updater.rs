//! Auto-update stub for CodeOS.
//!
//! tauri-plugin-updater is not yet configured. These commands exist so the
//! frontend can call them without errors; they simply report no update available.

use tauri::AppHandle;

#[derive(serde::Serialize, Clone)]
pub struct UpdateStatus {
    pub available: bool,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn check_for_updates(_app: AppHandle) -> Result<UpdateStatus, String> {
    Ok(UpdateStatus {
        available: false,
        version: None,
        notes: None,
        error: None,
    })
}

#[tauri::command]
pub async fn install_update(_app: AppHandle) -> Result<(), String> {
    Err("Auto-update not configured".to_string())
}

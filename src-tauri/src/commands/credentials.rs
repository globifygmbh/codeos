use tauri::State;

use crate::config;
use crate::log_store::LogStore;
use crate::models::{CredentialEntry, LogLevel};

fn now() -> String {
    chrono::Local::now().to_rfc3339()
}

/// Add or replace a credential entry on a project.
/// If an entry with the same id already exists it is replaced; otherwise appended.
/// This command is also called autonomously by the Claude agent.
#[tauri::command]
pub async fn upsert_credential(
    project_id: String,
    entry: CredentialEntry,
    logs: State<'_, LogStore>,
) -> Result<CredentialEntry, String> {
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    let project = cfg
        .projects
        .iter_mut()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project '{}' not found", project_id))?;

    let existing = project.credentials.iter().position(|c| c.id == entry.id);
    if let Some(idx) = existing {
        project.credentials[idx] = entry.clone();
    } else {
        project.credentials.push(entry.clone());
    }
    project.updated_at = now();

    config::save_config(&cfg).map_err(|e| e.to_string())?;
    logs.push(
        LogLevel::Info,
        format!("Credential '{}' saved for project '{}'", entry.label, project_id),
        "credentials",
    );
    Ok(entry)
}

/// Remove a credential entry from a project.
#[tauri::command]
pub async fn delete_credential(
    project_id: String,
    credential_id: String,
    logs: State<'_, LogStore>,
) -> Result<(), String> {
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    let project = cfg
        .projects
        .iter_mut()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project '{}' not found", project_id))?;

    project.credentials.retain(|c| c.id != credential_id);
    project.updated_at = now();

    config::save_config(&cfg).map_err(|e| e.to_string())?;
    logs.push(LogLevel::Info, "Credential removed", "credentials");
    Ok(())
}

/// Return all credentials for a project.
#[tauri::command]
pub async fn get_credentials(project_id: String) -> Result<Vec<CredentialEntry>, String> {
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let project = cfg
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project '{}' not found", project_id))?;
    Ok(project.credentials.clone())
}

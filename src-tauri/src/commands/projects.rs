use std::path::Path;
use tauri::State;

use crate::config;
use crate::log_store::LogStore;
use crate::models::{AppConfig, LogLevel, Project, ProjectInput};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn project_by_id<'a>(projects: &'a mut Vec<Project>, id: &str) -> Option<&'a mut Project> {
    projects.iter_mut().find(|p| p.id == id)
}

fn now() -> String {
    chrono::Local::now().to_rfc3339()
}

// ── Tauri Commands ────────────────────────────────────────────────────────────

/// Return all projects from config.
#[tauri::command]
pub async fn get_projects() -> Result<Vec<Project>, String> {
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    Ok(cfg.projects)
}

/// Add a new project. Validates that the path exists.
#[tauri::command]
pub async fn add_project(
    input: ProjectInput,
    logs: State<'_, LogStore>,
) -> Result<Project, String> {
    if !Path::new(&input.path).exists() {
        return Err(format!("Path does not exist: {}", input.path));
    }

    let mut cfg = config::load_config().map_err(|e| e.to_string())?;

    // Duplicate path check.
    if cfg.projects.iter().any(|p| p.path == input.path) {
        return Err(format!("A project for '{}' already exists.", input.path));
    }

    let mut project = Project::new(input.name.clone(), input.path.clone());

    if let Some(url) = input.local_url {
        project.local_url = url;
    }
    if let Some(port) = input.port {
        project.port = port;
    }
    project.git_remote = input.git_remote;
    project.php_version = input.php_version;
    project.document_root = input.document_root;

    cfg.projects.push(project.clone());
    config::save_config(&cfg).map_err(|e| e.to_string())?;

    logs.push(
        LogLevel::Success,
        format!("Project '{}' added", input.name),
        "projects",
    );
    Ok(project)
}

/// Update an existing project by ID.
#[tauri::command]
pub async fn update_project(
    id: String,
    input: ProjectInput,
    logs: State<'_, LogStore>,
) -> Result<Project, String> {
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;

    let project = project_by_id(&mut cfg.projects, &id)
        .ok_or_else(|| format!("Project with id '{}' not found", id))?;

    project.name = input.name.clone();
    project.path = input.path;
    if let Some(url) = input.local_url {
        project.local_url = url;
    }
    if let Some(port) = input.port {
        project.port = port;
    }
    project.git_remote = input.git_remote;
    project.php_version = input.php_version;
    project.document_root = input.document_root;
    project.updated_at = now();

    let updated = project.clone();
    config::save_config(&cfg).map_err(|e| e.to_string())?;

    logs.push(
        LogLevel::Info,
        format!("Project '{}' updated", input.name),
        "projects",
    );
    Ok(updated)
}

/// Remove a project by ID.
#[tauri::command]
pub async fn remove_project(
    id: String,
    logs: State<'_, LogStore>,
) -> Result<(), String> {
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    let before = cfg.projects.len();
    cfg.projects.retain(|p| p.id != id);

    if cfg.projects.len() == before {
        return Err(format!("Project '{}' not found", id));
    }

    config::save_config(&cfg).map_err(|e| e.to_string())?;
    logs.push(LogLevel::Info, format!("Project '{}' removed", id), "projects");
    Ok(())
}

/// Generate a minimal Apache VirtualHost configuration for a project
/// and write it to the Homebrew httpd vhosts directory.
#[tauri::command]
pub async fn enable_vhost(
    project_id: String,
    logs: State<'_, LogStore>,
) -> Result<String, String> {
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    let prefix = cfg.homebrew_prefix.clone().unwrap_or_else(|| "/opt/homebrew".to_string());

    let project = cfg.projects.iter_mut()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project '{}' not found", project_id))?;

    let doc_root = project.document_root.clone().unwrap_or_else(|| project.path.clone());
    let port = project.port;
    let name = project.name.replace(' ', "-").to_lowercase();

    let vhost_conf = format!(
        r#"# CodeOS: {display_name}
<VirtualHost *:{port}>
    ServerName {name}.localhost
    DocumentRoot "{doc_root}"
    <Directory "{doc_root}">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
    ErrorLog "{prefix}/var/log/httpd/{name}-error.log"
    CustomLog "{prefix}/var/log/httpd/{name}-access.log" combined
</VirtualHost>
"#,
        display_name = project.name,
        port = port,
        name = name,
        doc_root = doc_root,
        prefix = prefix,
    );

    let vhosts_dir = format!("{}/etc/httpd/sites-enabled", prefix);
    std::fs::create_dir_all(&vhosts_dir)
        .map_err(|e| format!("Cannot create vhosts dir: {}", e))?;

    let vhost_file = format!("{}/{}.conf", vhosts_dir, name);
    std::fs::write(&vhost_file, &vhost_conf)
        .map_err(|e| format!("Cannot write vhost file: {}", e))?;

    project.vhost_enabled = true;
    project.local_url = format!("http://{}.localhost:{}", name, port);
    project.updated_at = now();

    config::save_config(&cfg).map_err(|e| e.to_string())?;
    logs.push(
        LogLevel::Success,
        format!("VHost enabled for '{}' at {}", name, vhost_file),
        "projects",
    );

    Ok(format!(
        "VHost written to {}\nURL: http://{}.localhost:{}\n\nMake sure sites-enabled is included in httpd.conf.",
        vhost_file, name, port
    ))
}

/// Remove the VirtualHost config file for a project.
#[tauri::command]
pub async fn disable_vhost(
    project_id: String,
    logs: State<'_, LogStore>,
) -> Result<(), String> {
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    let prefix = cfg.homebrew_prefix.clone().unwrap_or_else(|| "/opt/homebrew".to_string());

    let project = cfg.projects.iter_mut()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project '{}' not found", project_id))?;

    let name = project.name.replace(' ', "-").to_lowercase();
    let vhost_file = format!("{}/etc/httpd/sites-enabled/{}.conf", prefix, name);

    if Path::new(&vhost_file).exists() {
        std::fs::remove_file(&vhost_file)
            .map_err(|e| format!("Cannot remove vhost file: {}", e))?;
    }

    project.vhost_enabled = false;
    project.updated_at = now();
    config::save_config(&cfg).map_err(|e| e.to_string())?;

    logs.push(LogLevel::Info, format!("VHost disabled for '{}'", project.name), "projects");
    Ok(())
}

/// Return the Apache httpd.conf snippet needed to include sites-enabled.
#[tauri::command]
pub async fn get_httpd_include_snippet() -> Result<String, String> {
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let prefix = cfg.homebrew_prefix.unwrap_or_else(|| "/opt/homebrew".to_string());
    Ok(format!(
        "# Add this to {prefix}/etc/httpd/httpd.conf:\n\
         Include {prefix}/etc/httpd/sites-enabled/*.conf\n",
        prefix = prefix
    ))
}

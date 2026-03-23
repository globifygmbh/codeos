use std::path::Path;
use tauri::State;

use crate::config;
use crate::log_store::LogStore;
use crate::models::{LogLevel, Project, ProjectInput};

fn project_by_id<'a>(projects: &'a mut Vec<Project>, id: &str) -> Option<&'a mut Project> {
    projects.iter_mut().find(|p| p.id == id)
}

fn now() -> String {
    chrono::Local::now().to_rfc3339()
}

#[tauri::command]
pub async fn get_projects() -> Result<Vec<Project>, String> {
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    Ok(cfg.projects)
}

#[tauri::command]
pub async fn add_project(input: ProjectInput, logs: State<'_, LogStore>) -> Result<Project, String> {
    if !Path::new(&input.path).exists() {
        return Err(format!("Path does not exist: {}", input.path));
    }
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    if cfg.projects.iter().any(|p| p.path == input.path) {
        return Err(format!("A project for '{}' already exists.", input.path));
    }
    let mut project = Project::new(input.name.clone(), input.path.clone());
    if let Some(url) = input.local_url  { project.local_url = url; }
    if let Some(port) = input.port      { project.port = port; }
    project.git_remote   = input.git_remote;
    project.php_version  = input.php_version;
    project.document_root = input.document_root;
    cfg.projects.push(project.clone());
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    logs.push(LogLevel::Success, format!("Project '{}' added", input.name), "projects");
    Ok(project)
}

#[tauri::command]
pub async fn update_project(id: String, input: ProjectInput, logs: State<'_, LogStore>) -> Result<Project, String> {
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    let project = project_by_id(&mut cfg.projects, &id)
        .ok_or_else(|| format!("Project '{}' not found", id))?;
    project.name  = input.name.clone();
    project.path  = input.path;
    if let Some(url)  = input.local_url   { project.local_url = url; }
    if let Some(port) = input.port        { project.port = port; }
    project.git_remote    = input.git_remote;
    project.php_version   = input.php_version;
    project.document_root = input.document_root;
    project.updated_at    = now();
    let updated = project.clone();
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    logs.push(LogLevel::Info, format!("Project '{}' updated", input.name), "projects");
    Ok(updated)
}

#[tauri::command]
pub async fn remove_project(id: String, logs: State<'_, LogStore>) -> Result<(), String> {
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

/// Rename a project (display name only; does not touch the filesystem).
#[tauri::command]
pub async fn rename_project(id: String, name: String, logs: State<'_, LogStore>) -> Result<Project, String> {
    if name.trim().is_empty() {
        return Err("Name must not be empty".to_string());
    }
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    let project = project_by_id(&mut cfg.projects, &id)
        .ok_or_else(|| format!("Project '{}' not found", id))?;
    project.name = name.trim().to_string();
    project.updated_at = now();
    let updated = project.clone();
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    logs.push(LogLevel::Info, format!("Project renamed to '{}'", updated.name), "projects");
    Ok(updated)
}

/// Duplicate a project entry (same path, new ID/name). Does NOT copy files.
#[tauri::command]
pub async fn duplicate_project(id: String, logs: State<'_, LogStore>) -> Result<Project, String> {
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    let original = cfg
        .projects
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| format!("Project '{}' not found", id))?
        .clone();

    let new_project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name: format!("{} (copy)", original.name),
        path: original.path.clone(),
        local_url: original.local_url.clone(),
        port: original.port,
        git_remote: original.git_remote.clone(),
        php_version: original.php_version.clone(),
        vhost_enabled: false, // don't duplicate vhost — would conflict
        document_root: original.document_root.clone(),
        created_at: now(),
        updated_at: now(),
        todos: Vec::new(),
        mysql_config: original.mysql_config.clone(),
        credentials: original.credentials.clone(),
    };

    logs.push(LogLevel::Info, format!("Project '{}' duplicated", original.name), "projects");
    cfg.projects.push(new_project.clone());
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    Ok(new_project)
}

// ── VHost management ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn enable_vhost(project_id: String, logs: State<'_, LogStore>) -> Result<String, String> {
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    let prefix = cfg.homebrew_prefix.clone().unwrap_or_else(|| "/opt/homebrew".to_string());

    let project = cfg.projects.iter_mut()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project '{}' not found", project_id))?;

    let doc_root = project.document_root.clone().unwrap_or_else(|| project.path.clone());
    let port     = project.port;
    let name     = project.name.replace(' ', "-").to_lowercase();

    let vhost_conf = format!(
        "# CodeOS: {display_name}\n\
         <VirtualHost *:{port}>\n\
             ServerName {name}.localhost\n\
             DocumentRoot \"{doc_root}\"\n\
             <Directory \"{doc_root}\">\n\
                 Options Indexes FollowSymLinks\n\
                 AllowOverride All\n\
                 Require all granted\n\
             </Directory>\n\
             ErrorLog \"{prefix}/var/log/httpd/{name}-error.log\"\n\
             CustomLog \"{prefix}/var/log/httpd/{name}-access.log\" combined\n\
         </VirtualHost>\n",
        display_name = project.name, port = port, name = name,
        doc_root = doc_root, prefix = prefix,
    );

    let vhosts_dir = format!("{}/etc/httpd/sites-enabled", prefix);
    std::fs::create_dir_all(&vhosts_dir).map_err(|e| format!("Cannot create vhosts dir: {}", e))?;
    let vhost_file = format!("{}/{}.conf", vhosts_dir, name);
    std::fs::write(&vhost_file, &vhost_conf).map_err(|e| format!("Cannot write vhost: {}", e))?;

    project.vhost_enabled = true;
    project.local_url = format!("http://{}.localhost:{}", name, port);
    project.updated_at = now();
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    logs.push(LogLevel::Success, format!("VHost enabled for '{}'", name), "projects");
    Ok(format!("VHost written to {}\nURL: http://{}.localhost:{}", vhost_file, name, port))
}

#[tauri::command]
pub async fn disable_vhost(project_id: String, logs: State<'_, LogStore>) -> Result<(), String> {
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    let prefix = cfg.homebrew_prefix.clone().unwrap_or_else(|| "/opt/homebrew".to_string());
    let project = cfg.projects.iter_mut()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project '{}' not found", project_id))?;
    let name = project.name.replace(' ', "-").to_lowercase();
    let vhost_file = format!("{}/etc/httpd/sites-enabled/{}.conf", prefix, name);
    if Path::new(&vhost_file).exists() {
        std::fs::remove_file(&vhost_file).map_err(|e| format!("Cannot remove vhost: {}", e))?;
    }
    project.vhost_enabled = false;
    project.updated_at = now();
    let project_name = project.name.clone();
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    logs.push(LogLevel::Info, format!("VHost disabled for '{}'", project_name), "projects");
    Ok(())
}

#[tauri::command]
pub async fn get_httpd_include_snippet() -> Result<String, String> {
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let prefix = cfg.homebrew_prefix.unwrap_or_else(|| "/opt/homebrew".to_string());
    Ok(format!(
        "# Add this to {prefix}/etc/httpd/httpd.conf:\nInclude {prefix}/etc/httpd/sites-enabled/*.conf\n"
    ))
}

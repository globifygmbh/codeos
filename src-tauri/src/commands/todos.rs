use chrono::Local;
use tauri::State;

use crate::config;
use crate::log_store::LogStore;
use crate::models::{LogLevel, TodoItem};

fn now() -> String {
    Local::now().to_rfc3339()
}

#[tauri::command]
pub async fn get_todos(project_id: String) -> Result<Vec<TodoItem>, String> {
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let project = cfg
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;
    Ok(project.todos.clone())
}

#[tauri::command]
pub async fn add_todo(
    project_id: String,
    text: String,
    logs: State<'_, LogStore>,
) -> Result<TodoItem, String> {
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    let project = cfg
        .projects
        .iter_mut()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;

    let todo = TodoItem {
        id: uuid::Uuid::new_v4().to_string(),
        text: text.trim().to_string(),
        completed: false,
        created_at: now(),
        updated_at: now(),
    };
    project.todos.push(todo.clone());
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    Ok(todo)
}

#[tauri::command]
pub async fn update_todo(
    project_id: String,
    todo_id: String,
    text: Option<String>,
    completed: Option<bool>,
) -> Result<TodoItem, String> {
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    let project = cfg
        .projects
        .iter_mut()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;
    let todo = project
        .todos
        .iter_mut()
        .find(|t| t.id == todo_id)
        .ok_or_else(|| format!("Todo not found: {}", todo_id))?;

    if let Some(t) = text {
        todo.text = t.trim().to_string();
    }
    if let Some(c) = completed {
        todo.completed = c;
    }
    todo.updated_at = now();

    let updated = todo.clone();
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    Ok(updated)
}

#[tauri::command]
pub async fn delete_todo(
    project_id: String,
    todo_id: String,
) -> Result<(), String> {
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    let project = cfg
        .projects
        .iter_mut()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;
    project.todos.retain(|t| t.id != todo_id);
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    Ok(())
}

/// Reorder todos according to the provided list of IDs.
#[tauri::command]
pub async fn reorder_todos(
    project_id: String,
    todo_ids: Vec<String>,
) -> Result<Vec<TodoItem>, String> {
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    let project = cfg
        .projects
        .iter_mut()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;

    let mut ordered: Vec<TodoItem> = Vec::with_capacity(project.todos.len());
    for id in &todo_ids {
        if let Some(t) = project.todos.iter().find(|t| &t.id == id) {
            ordered.push(t.clone());
        }
    }
    // Append anything not in the provided order (safety net).
    for t in &project.todos {
        if !todo_ids.contains(&t.id) {
            ordered.push(t.clone());
        }
    }
    project.todos = ordered.clone();
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    Ok(ordered)
}

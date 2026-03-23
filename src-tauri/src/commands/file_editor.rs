use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

use crate::config;
use crate::log_store::LogStore;
use crate::models::{FileEntry, LogLevel};

// Binary extensions we never try to open as text
const BINARY_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "ico", "svg",
    "pdf", "zip", "gz", "tar", "bz2", "7z", "rar",
    "ttf", "woff", "woff2", "eot", "otf",
    "mp3", "mp4", "mov", "avi", "mkv", "wav",
    "exe", "dmg", "so", "dylib", "dll", "a",
    "DS_Store", "lock",
];

// Directories to skip when listing files
const SKIP_DIRS: &[&str] = &[
    ".git", "node_modules", "vendor", ".idea", ".vscode",
    "target", "dist", ".next", ".nuxt", "build",
    "__pycache__", ".mypy_cache", ".pytest_cache",
    "coverage", ".nyc_output",
];

fn project_root(project_id: &str) -> Result<PathBuf, String> {
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let project = cfg
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project '{}' not found", project_id))?;
    Ok(PathBuf::from(&project.path))
}

fn is_binary(name: &str) -> bool {
    let ext = name.rsplit('.').next().unwrap_or("").to_lowercase();
    BINARY_EXTENSIONS.contains(&ext.as_str())
}

/// List files in a project directory (non-recursive, one level at a time).
#[tauri::command]
pub async fn list_project_files(
    project_id: String,
    subpath: Option<String>,
) -> Result<Vec<FileEntry>, String> {
    let root = project_root(&project_id)?;
    let dir = match subpath {
        Some(ref sub) if !sub.is_empty() => root.join(sub),
        _ => root.clone(),
    };

    if !dir.exists() || !dir.is_dir() {
        return Err(format!("Directory not found: {}", dir.display()));
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    let read_dir = fs::read_dir(&dir).map_err(|e| format!("Cannot read dir: {}", e))?;

    for entry in read_dir.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();

        // Hidden files (except .env / .htaccess which are useful)
        if name.starts_with('.') && !matches!(name.as_str(), ".env" | ".env.local" | ".env.example" | ".htaccess" | ".gitignore" | ".gitattributes") {
            continue;
        }

        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let is_dir = meta.is_dir();
        let full_path = entry.path().to_string_lossy().to_string();

        // Skip unwanted directories
        if is_dir && SKIP_DIRS.contains(&name.as_str()) {
            continue;
        }

        // Relative path from project root
        let rel = entry
            .path()
            .strip_prefix(&root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| name.clone());

        let extension = if !is_dir {
            name.rsplit('.').next().map(|e| e.to_lowercase())
        } else {
            None
        };

        let size = if !is_dir { Some(meta.len()) } else { None };

        entries.push(FileEntry {
            name,
            path: rel,
            full_path,
            is_dir,
            extension,
            size,
        });
    }

    // Sort: directories first, then files alphabetically
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

/// Read a file from the project as UTF-8 text.
#[tauri::command]
pub async fn read_project_file(
    project_id: String,
    relative_path: String,
) -> Result<String, String> {
    let root = project_root(&project_id)?;

    // Prevent path traversal
    let rel = Path::new(&relative_path);
    for component in rel.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err("Path traversal not allowed".to_string());
        }
    }

    let full = root.join(rel);

    if !full.exists() {
        return Err(format!("File not found: {}", relative_path));
    }
    if full.is_dir() {
        return Err("Cannot read a directory".to_string());
    }

    let name = full.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    if is_binary(&name) {
        return Err(format!("Binary file cannot be opened in the text editor: {}", name));
    }

    // Limit to 2 MB
    let meta = fs::metadata(&full).map_err(|e| e.to_string())?;
    if meta.len() > 2_000_000 {
        return Err(format!("File too large ({} KB). Max 2 MB.", meta.len() / 1024));
    }

    fs::read_to_string(&full)
        .map_err(|e| format!("Cannot read file '{}': {}", relative_path, e))
}

/// Write UTF-8 text to a file in the project (creates parent dirs if needed).
#[tauri::command]
pub async fn write_project_file(
    project_id: String,
    relative_path: String,
    content: String,
    logs: State<'_, LogStore>,
) -> Result<(), String> {
    let root = project_root(&project_id)?;

    let rel = Path::new(&relative_path);
    for component in rel.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err("Path traversal not allowed".to_string());
        }
    }

    let full = root.join(rel);

    if let Some(parent) = full.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create dirs: {}", e))?;
    }

    fs::write(&full, content.as_bytes())
        .map_err(|e| format!("Cannot write '{}': {}", relative_path, e))?;

    logs.push(
        LogLevel::Info,
        format!("Saved {}", relative_path),
        "editor",
    );
    Ok(())
}

/// Create a new file or directory within the project.
#[tauri::command]
pub async fn create_project_entry(
    project_id: String,
    relative_path: String,
    is_dir: bool,
) -> Result<(), String> {
    let root = project_root(&project_id)?;

    let rel = Path::new(&relative_path);
    for component in rel.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err("Path traversal not allowed".to_string());
        }
    }

    let full = root.join(rel);

    if full.exists() {
        return Err(format!("'{}' already exists", relative_path));
    }

    if is_dir {
        fs::create_dir_all(&full).map_err(|e| format!("Cannot create dir: {}", e))?;
    } else {
        if let Some(parent) = full.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("Cannot create parent dirs: {}", e))?;
        }
        fs::write(&full, b"").map_err(|e| format!("Cannot create file: {}", e))?;
    }

    Ok(())
}

/// Delete a file within the project (no recursive dir delete for safety).
#[tauri::command]
pub async fn delete_project_entry(
    project_id: String,
    relative_path: String,
) -> Result<(), String> {
    let root = project_root(&project_id)?;

    let rel = Path::new(&relative_path);
    for component in rel.components() {
        if matches!(component, std::path::Component::ParentDir) {
            return Err("Path traversal not allowed".to_string());
        }
    }

    let full = root.join(rel);

    if !full.exists() {
        return Err(format!("'{}' not found", relative_path));
    }

    if full.is_dir() {
        fs::remove_dir_all(&full).map_err(|e| format!("Cannot remove dir: {}", e))?;
    } else {
        fs::remove_file(&full).map_err(|e| format!("Cannot remove file: {}", e))?;
    }

    Ok(())
}

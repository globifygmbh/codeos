use std::fs;
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::process::Command;
use std::time::Instant;
use tauri::State;

use crate::config;
use crate::log_store::LogStore;
use crate::models::{CommandOutput, LogLevel, ProjectLogEntry};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn project_log_path(project_id: &str) -> Result<PathBuf, String> {
    let dir = config::log_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{}.log", project_id)))
}

/// Append a single entry to the project log file (called from any module).
pub fn write_project_log(
    project_id: &str,
    level: &str,
    message: &str,
    source: &str,
) -> Result<(), String> {
    let path = project_log_path(project_id)?;
    let entry = ProjectLogEntry {
        timestamp: chrono::Local::now().to_rfc3339(),
        level: level.to_string(),
        message: message.to_string(),
        source: source.to_string(),
    };
    let line = serde_json::to_string(&entry).map_err(|e| e.to_string())?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Cannot open project log: {}", e))?;
    writeln!(file, "{}", line).map_err(|e| format!("Cannot write project log: {}", e))?;

    // Trim to last 2 000 lines when file exceeds ~400 KB
    if let Ok(meta) = fs::metadata(&path) {
        if meta.len() > 400_000 {
            trim_log_file(&path, 2_000);
        }
    }
    Ok(())
}

fn trim_log_file(path: &PathBuf, keep: usize) {
    if let Ok(content) = fs::read_to_string(path) {
        let lines: Vec<&str> = content.lines().collect();
        if lines.len() > keep {
            let trimmed = lines[lines.len() - keep..].join("\n") + "\n";
            let _ = fs::write(path, trimmed);
        }
    }
}

/// Execute a shell command in a given directory.
/// Called both by `run_command_in_project` and by the Claude tool-use loop.
pub fn execute_in_dir(working_dir: &str, command: &str) -> CommandOutput {
    let start = Instant::now();

    // Extend PATH so Homebrew tools are available
    let path_env = "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

    let output = Command::new("bash")
        .arg("-c")
        .arg(command)
        .current_dir(working_dir)
        .env("PATH", path_env)
        .env("HOME", dirs::home_dir().unwrap_or_default())
        .output();

    let duration_ms = start.elapsed().as_millis() as u64;

    match output {
        Ok(out) => CommandOutput {
            stdout: String::from_utf8_lossy(&out.stdout).to_string(),
            stderr: String::from_utf8_lossy(&out.stderr).to_string(),
            exit_code: out.status.code().unwrap_or(-1),
            duration_ms,
            command: command.to_string(),
        },
        Err(e) => CommandOutput {
            stdout: String::new(),
            stderr: format!("Failed to spawn command: {}", e),
            exit_code: -1,
            duration_ms,
            command: command.to_string(),
        },
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Read the project log file and return up to the last 500 entries.
#[tauri::command]
pub async fn get_project_log(project_id: String) -> Result<Vec<ProjectLogEntry>, String> {
    let path = project_log_path(&project_id)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let file = fs::File::open(&path).map_err(|e| format!("Cannot open project log: {}", e))?;
    let reader = std::io::BufReader::new(file);
    let mut entries: Vec<ProjectLogEntry> = Vec::new();
    for line in reader.lines() {
        let line = line.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        if let Ok(entry) = serde_json::from_str::<ProjectLogEntry>(&line) {
            entries.push(entry);
        }
    }
    if entries.len() > 500 {
        entries = entries[entries.len() - 500..].to_vec();
    }
    Ok(entries)
}

/// Delete the project log file.
#[tauri::command]
pub async fn clear_project_log(project_id: String) -> Result<(), String> {
    let path = project_log_path(&project_id)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Cannot delete project log: {}", e))?;
    }
    Ok(())
}

/// Append a single log entry (called from the frontend, e.g. for custom events).
#[tauri::command]
pub async fn append_project_log_entry(
    project_id: String,
    level: String,
    message: String,
    source: String,
) -> Result<(), String> {
    write_project_log(&project_id, &level, &message, &source)
}

/// Run a shell command in the project's root directory.
/// The command and its output are automatically appended to the project log.
#[tauri::command]
pub async fn run_command_in_project(
    project_id: String,
    command: String,
    logs: State<'_, LogStore>,
) -> Result<CommandOutput, String> {
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let project = cfg
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project '{}' not found", project_id))?;

    let project_path = project.path.clone();
    let project_name = project.name.clone();

    logs.push(
        LogLevel::Info,
        format!("Running in '{}': {}", project_name, command),
        "agent",
    );

    let result = execute_in_dir(&project_path, &command);

    // Log to project log file
    let level = if result.exit_code == 0 { "success" } else { "error" };
    let log_msg = if result.exit_code == 0 {
        format!(
            "$ {}\n{}",
            result.command,
            if result.stdout.trim().is_empty() { "(no output)".to_string() } else { result.stdout.trim().to_string() }
        )
    } else {
        format!(
            "$ {} [exit {}]\nstdout: {}\nstderr: {}",
            result.command,
            result.exit_code,
            result.stdout.trim(),
            result.stderr.trim()
        )
    };
    let _ = write_project_log(&project_id, level, &log_msg, "agent");

    Ok(result)
}

use std::path::Path;
use std::process::{Command, Stdio};
use tauri::State;

use crate::config;
use crate::log_store::LogStore;
use crate::models::{GitStatus, LogLevel};

// ── Low-level Git runner ──────────────────────────────────────────────────────

/// Runs a git command in a given directory.
/// Returns (stdout, stderr) or an error string.
fn git(dir: &Path, args: &[&str]) -> Result<(String, String), String> {
    let out = Command::new("git")
        .current_dir(dir)
        .args(args)
        // Disable interactive prompts — crucial for automated runs.
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();

    if out.status.success() {
        Ok((stdout, stderr))
    } else {
        Err(if !stderr.is_empty() { stderr } else { stdout })
    }
}

/// Same as `git()` but injects the GitHub token into the remote URL for HTTPS auth.
fn git_with_auth(dir: &Path, args: &[&str], token: Option<&str>) -> Result<(String, String), String> {
    let mut cmd = Command::new("git");
    cmd.current_dir(dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .args(args);

    if let Some(tok) = token {
        // Inject credential via GIT_ASKPASS helper.
        // We pass a tiny inline script that prints the token as password.
        // Username defaults to "x-token" (GitHub accepts any non-empty username).
        cmd.env("GIT_ASKPASS", "echo")
            .env("GIT_USERNAME", "x-token")
            .env("GIT_PASSWORD", tok);
        // Use a helper inline so git uses env vars.
        cmd.env(
            "GIT_CONFIG_COUNT", "1",
        )
        .env("GIT_CONFIG_KEY_0", "credential.helper")
        .env(
            "GIT_CONFIG_VALUE_0",
            "!f() { echo username=x-token; echo password=$GIT_PASSWORD; }; f",
        );
    }

    let out = cmd.output().map_err(|e| format!("Failed to run git: {}", e))?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();

    if out.status.success() {
        Ok((stdout, stderr))
    } else {
        Err(if !stderr.is_empty() { stderr } else { stdout })
    }
}

// ── Parsers ───────────────────────────────────────────────────────────────────

fn parse_ahead_behind(output: &str) -> (u32, u32) {
    // `git rev-list --left-right --count HEAD...@{upstream}` → "3\t1"
    let parts: Vec<&str> = output.split_whitespace().collect();
    let ahead = parts.first().and_then(|s| s.parse().ok()).unwrap_or(0);
    let behind = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    (ahead, behind)
}

fn parse_status_porcelain(output: &str) -> (Vec<String>, Vec<String>, Vec<String>) {
    let mut untracked = Vec::new();
    let mut modified = Vec::new();
    let mut staged = Vec::new();

    for line in output.lines() {
        if line.len() < 3 {
            continue;
        }
        let (xy, path) = line.split_at(2);
        let path = path.trim().to_string();
        let x = xy.chars().next().unwrap_or(' ');
        let y = xy.chars().nth(1).unwrap_or(' ');

        if x == '?' && y == '?' {
            untracked.push(path);
        } else {
            if x != ' ' && x != '?' {
                staged.push(path.clone());
            }
            if y != ' ' && y != '?' {
                modified.push(path);
            }
        }
    }
    (untracked, modified, staged)
}

// ── Tauri Commands ────────────────────────────────────────────────────────────

/// Clone a repository into a given directory.
#[tauri::command]
pub async fn git_clone(
    url: String,
    destination: String,
    logs: State<'_, LogStore>,
) -> Result<String, String> {
    logs.push(
        LogLevel::Info,
        format!("Cloning {} → {}", url, destination),
        "git",
    );

    let token = config::load_github_token().unwrap_or(None);

    // Build the authenticated URL if token is present and URL is HTTPS.
    let effective_url = if let Some(ref tok) = token {
        if url.starts_with("https://github.com/") {
            url.replacen("https://", &format!("https://x-token:{}@", tok), 1)
        } else {
            url.clone()
        }
    } else {
        url.clone()
    };

    let parent = Path::new(&destination)
        .parent()
        .ok_or_else(|| "Invalid destination path".to_string())?;

    std::fs::create_dir_all(parent)
        .map_err(|e| format!("Cannot create parent directory: {}", e))?;

    let out = Command::new("git")
        .env("GIT_TERMINAL_PROMPT", "0")
        .args(["clone", "--progress", &effective_url, &destination])
        .output()
        .map_err(|e| format!("git clone failed: {}", e))?;

    let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();

    if out.status.success() {
        logs.push(LogLevel::Success, format!("Cloned successfully to {}", destination), "git");
        Ok(format!("{}\n{}", stdout, stderr).trim().to_string())
    } else {
        let msg = if !stderr.is_empty() { &stderr } else { &stdout };
        logs.push(LogLevel::Error, format!("Clone failed: {}", msg), "git");
        Err(msg.clone())
    }
}

/// Returns the full git status for a project directory.
#[tauri::command]
pub async fn git_status(
    project_path: String,
    logs: State<'_, LogStore>,
) -> Result<GitStatus, String> {
    let dir = Path::new(&project_path);
    if !dir.exists() {
        return Err(format!("Project path does not exist: {}", project_path));
    }

    // Current branch.
    let branch = git(dir, &["rev-parse", "--abbrev-ref", "HEAD"])
        .map(|(s, _)| s)
        .unwrap_or_else(|_| "unknown".to_string());

    // Local HEAD commit.
    let local_commit = git(dir, &["rev-parse", "--short", "HEAD"])
        .map(|(s, _)| s)
        .unwrap_or_else(|_| "unknown".to_string());

    // Remote tracking commit.
    let remote_commit = git(dir, &["rev-parse", "--short", "@{upstream}"])
        .map(|(s, _)| if s.is_empty() { None } else { Some(s) })
        .unwrap_or(None);

    // Ahead/behind counts.
    let (ahead, behind) = git(
        dir,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    )
    .map(|(s, _)| parse_ahead_behind(&s))
    .unwrap_or((0, 0));

    // Conflict markers.
    let has_conflicts = git(dir, &["diff", "--name-only", "--diff-filter=U"])
        .map(|(s, _)| !s.is_empty())
        .unwrap_or(false);

    // Working-tree status (porcelain v1).
    let (untracked, modified, staged) = git(dir, &["status", "--porcelain"])
        .map(|(s, _)| parse_status_porcelain(&s))
        .unwrap_or_default();

    // Last commit message and date.
    let last_commit_message = git(dir, &["log", "-1", "--pretty=format:%s"])
        .map(|(s, _)| if s.is_empty() { None } else { Some(s) })
        .unwrap_or(None);

    let last_commit_date = git(dir, &["log", "-1", "--pretty=format:%ci"])
        .map(|(s, _)| if s.is_empty() { None } else { Some(s) })
        .unwrap_or(None);

    Ok(GitStatus {
        branch,
        local_commit,
        remote_commit,
        ahead,
        behind,
        has_conflicts,
        untracked_files: untracked,
        modified_files: modified,
        staged_files: staged,
        last_commit_message,
        last_commit_date,
    })
}

/// Fetch from remote without merging.
#[tauri::command]
pub async fn git_fetch(
    project_path: String,
    logs: State<'_, LogStore>,
) -> Result<GitStatus, String> {
    let dir = Path::new(&project_path);
    logs.push(LogLevel::Info, format!("Fetching remotes for {}", project_path), "git");

    let token = config::load_github_token().unwrap_or(None);
    git_with_auth(dir, &["fetch", "--all", "--prune"], token.as_deref())
        .map_err(|e| {
            logs.push(LogLevel::Error, format!("git fetch failed: {}", e), "git");
            e
        })?;

    logs.push(LogLevel::Success, "Fetch complete", "git");
    git_status(project_path, logs).await
}

/// Pull (fast-forward only) from the tracked remote branch.
#[tauri::command]
pub async fn git_pull(
    project_path: String,
    logs: State<'_, LogStore>,
) -> Result<GitStatus, String> {
    let dir = Path::new(&project_path);
    logs.push(LogLevel::Info, format!("Pulling latest for {}", project_path), "git");

    let token = config::load_github_token().unwrap_or(None);
    let (out, _) = git_with_auth(
        dir,
        &["pull", "--ff-only"],
        token.as_deref(),
    )
    .map_err(|e| {
        logs.push(LogLevel::Error, format!("git pull failed: {}", e), "git");
        e
    })?;

    logs.push(LogLevel::Success, format!("Pull complete: {}", out), "git");
    git_status(project_path, logs).await
}

/// Push the current branch to its remote.
#[tauri::command]
pub async fn git_push(
    project_path: String,
    logs: State<'_, LogStore>,
) -> Result<GitStatus, String> {
    let dir = Path::new(&project_path);
    logs.push(LogLevel::Info, format!("Pushing for {}", project_path), "git");

    let token = config::load_github_token().unwrap_or(None);
    git_with_auth(dir, &["push"], token.as_deref()).map_err(|e| {
        logs.push(LogLevel::Error, format!("git push failed: {}", e), "git");
        e
    })?;

    logs.push(LogLevel::Success, "Push complete", "git");
    git_status(project_path, logs).await
}

/// Set (or update) the remote origin URL.
#[tauri::command]
pub async fn git_set_remote(
    project_path: String,
    remote_url: String,
    logs: State<'_, LogStore>,
) -> Result<(), String> {
    let dir = Path::new(&project_path);

    // Check if origin already exists.
    let has_origin = git(dir, &["remote", "get-url", "origin"]).is_ok();

    if has_origin {
        git(dir, &["remote", "set-url", "origin", &remote_url]).map_err(|e| e)?;
    } else {
        git(dir, &["remote", "add", "origin", &remote_url]).map_err(|e| e)?;
    }

    logs.push(
        LogLevel::Info,
        format!("Remote origin set to {}", remote_url),
        "git",
    );
    Ok(())
}

/// Initialize a new git repository at a path.
#[tauri::command]
pub async fn git_init(
    project_path: String,
    logs: State<'_, LogStore>,
) -> Result<(), String> {
    let dir = Path::new(&project_path);
    git(dir, &["init"]).map_err(|e| e)?;
    logs.push(LogLevel::Success, format!("Initialized git repo at {}", project_path), "git");
    Ok(())
}

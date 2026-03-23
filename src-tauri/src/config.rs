use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;

use crate::models::AppConfig;

pub fn config_dir() -> Result<PathBuf> {
    let base = dirs::config_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join(".config")))
        .context("Cannot determine config directory")?;
    let dir = base.join("dev.codeos.manager");
    fs::create_dir_all(&dir).context("Failed to create config directory")?;
    Ok(dir)
}

pub fn config_file_path() -> Result<PathBuf> {
    Ok(config_dir()?.join("config.json"))
}

pub fn log_dir() -> Result<PathBuf> {
    let dir = config_dir()?.join("logs");
    fs::create_dir_all(&dir).context("Failed to create log directory")?;
    Ok(dir)
}

pub fn load_config() -> Result<AppConfig> {
    let path = config_file_path()?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let raw = fs::read_to_string(&path)
        .with_context(|| format!("Failed to read config from {}", path.display()))?;
    let config: AppConfig = serde_json::from_str(&raw)
        .context("Failed to parse config JSON — resetting to default")?;
    Ok(config)
}

pub fn save_config(config: &AppConfig) -> Result<()> {
    let path = config_file_path()?;
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(config).context("Failed to serialize config")?;
    fs::write(&tmp, &json)
        .with_context(|| format!("Failed to write tmp config to {}", tmp.display()))?;
    fs::rename(&tmp, &path)
        .with_context(|| format!("Failed to finalize config at {}", path.display()))?;
    Ok(())
}

// ── Generic Keychain helpers ──────────────────────────────────────────────────

const KEYCHAIN_SERVICE: &str = "dev.codeos.manager";

fn keychain_get(account: &str) -> Result<Option<String>> {
    let output = std::process::Command::new("security")
        .args(["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"])
        .output()
        .context("Failed to run `security find-generic-password`")?;
    if output.status.success() {
        let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(if s.is_empty() { None } else { Some(s) })
    } else {
        Ok(None)
    }
}

fn keychain_set(account: &str, value: &str) -> Result<()> {
    let _ = std::process::Command::new("security")
        .args(["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account])
        .output();
    let status = std::process::Command::new("security")
        .args(["add-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w", value])
        .status()
        .context("Failed to run `security add-generic-password`")?;
    if !status.success() {
        anyhow::bail!("Keychain write failed");
    }
    Ok(())
}

fn keychain_delete(account: &str) -> Result<()> {
    let _ = std::process::Command::new("security")
        .args(["delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account])
        .status();
    Ok(())
}

// ── GitHub token ─────────────────────────────────────────────────────────────

pub fn store_github_token(token: &str) -> Result<()>   { keychain_set("github-token", token) }
pub fn load_github_token() -> Result<Option<String>>   { keychain_get("github-token") }
pub fn delete_github_token() -> Result<()>             { keychain_delete("github-token") }

// ── Claude API key ────────────────────────────────────────────────────────────

pub fn store_claude_api_key(key: &str) -> Result<()>   { keychain_set("claude-api-key", key) }
pub fn load_claude_api_key() -> Result<Option<String>> { keychain_get("claude-api-key") }
pub fn delete_claude_api_key() -> Result<()>           { keychain_delete("claude-api-key") }

// ── MySQL password (per project) ─────────────────────────────────────────────

pub fn store_mysql_password(project_id: &str, password: &str) -> Result<()> {
    keychain_set(&format!("mysql-{}", project_id), password)
}
pub fn load_mysql_password(project_id: &str) -> Result<Option<String>> {
    keychain_get(&format!("mysql-{}", project_id))
}
pub fn delete_mysql_password(project_id: &str) -> Result<()> {
    keychain_delete(&format!("mysql-{}", project_id))
}

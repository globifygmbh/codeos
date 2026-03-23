use anyhow::{Context, Result};
use std::fs;
use std::path::PathBuf;

use crate::models::AppConfig;

/// Returns the path to the app's config directory.
/// macOS: ~/Library/Application Support/dev.codeos.manager/
pub fn config_dir() -> Result<PathBuf> {
    let base = dirs::config_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join(".config")))
        .context("Cannot determine config directory")?;
    let dir = base.join("dev.codeos.manager");
    fs::create_dir_all(&dir).context("Failed to create config directory")?;
    Ok(dir)
}

/// Returns the path to the config JSON file.
pub fn config_file_path() -> Result<PathBuf> {
    Ok(config_dir()?.join("config.json"))
}

/// Returns the path to the log directory.
pub fn log_dir() -> Result<PathBuf> {
    let dir = config_dir()?.join("logs");
    fs::create_dir_all(&dir).context("Failed to create log directory")?;
    Ok(dir)
}

/// Loads the AppConfig from disk, returning a default if no config exists yet.
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

/// Persists the AppConfig to disk atomically (write to tmp, rename).
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

// ── GitHub Token (macOS Keychain via `security` CLI) ─────────────────────────

const KEYCHAIN_SERVICE: &str = "dev.codeos.manager";
const KEYCHAIN_ACCOUNT: &str = "github-token";

/// Stores the GitHub personal access token in macOS Keychain.
pub fn store_github_token(token: &str) -> Result<()> {
    // Delete any existing entry first (ignore error if not present)
    let _ = std::process::Command::new("security")
        .args([
            "delete-generic-password",
            "-s", KEYCHAIN_SERVICE,
            "-a", KEYCHAIN_ACCOUNT,
        ])
        .output();

    let status = std::process::Command::new("security")
        .args([
            "add-generic-password",
            "-s", KEYCHAIN_SERVICE,
            "-a", KEYCHAIN_ACCOUNT,
            "-w", token,
        ])
        .status()
        .context("Failed to run `security add-generic-password`")?;

    if !status.success() {
        anyhow::bail!("Keychain write failed (exit {:?})", status.code());
    }
    Ok(())
}

/// Retrieves the GitHub personal access token from macOS Keychain.
pub fn load_github_token() -> Result<Option<String>> {
    let output = std::process::Command::new("security")
        .args([
            "find-generic-password",
            "-s", KEYCHAIN_SERVICE,
            "-a", KEYCHAIN_ACCOUNT,
            "-w",
        ])
        .output()
        .context("Failed to run `security find-generic-password`")?;

    if output.status.success() {
        let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if token.is_empty() {
            return Ok(None);
        }
        Ok(Some(token))
    } else {
        // No entry found is a normal case, not an error.
        Ok(None)
    }
}

/// Deletes the GitHub token from Keychain.
pub fn delete_github_token() -> Result<()> {
    let _ = std::process::Command::new("security")
        .args([
            "delete-generic-password",
            "-s", KEYCHAIN_SERVICE,
            "-a", KEYCHAIN_ACCOUNT,
        ])
        .status();
    Ok(())
}

use std::process::Command;
use tauri::State;

use crate::config;
use crate::log_store::LogStore;
use crate::models::{AppConfig, LogLevel, SystemCheck, ToolCheck};


fn which(cmd: &str) -> Option<String> {
    Command::new("which").arg(cmd).output().ok().and_then(|o| {
        if o.status.success() {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() { None } else { Some(s) }
        } else {
            None
        }
    })
}

/// Like `which`, but also checks a list of absolute fallback paths.
/// Needed because Tauri spawns processes with a minimal PATH that
/// does not include /opt/homebrew/bin or /usr/local/bin.
fn find_binary(cmd: &str, fallbacks: &[&str]) -> Option<String> {
    which(cmd).or_else(|| {
        fallbacks.iter()
            .find(|p| std::path::Path::new(p).exists())
            .map(|p| p.to_string())
    })
}

fn run_version_at(path: &str, args: &[&str]) -> Option<String> {
    Command::new(path).args(args).output().ok().and_then(|o| {
        let s = if o.status.success() {
            String::from_utf8_lossy(&o.stdout).trim().to_string()
        } else {
            String::from_utf8_lossy(&o.stderr).trim().to_string()
        };
        if s.is_empty() { None } else { Some(s) }
    })
}

fn detect_homebrew_prefix() -> Option<String> {
    if std::path::Path::new("/opt/homebrew/bin/brew").exists() {
        return Some("/opt/homebrew".to_string());
    }
    if std::path::Path::new("/usr/local/bin/brew").exists() {
        return Some("/usr/local".to_string());
    }
    Command::new("brew").arg("--prefix").output().ok().and_then(|o| {
        if o.status.success() {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() { None } else { Some(s) }
        } else { None }
    })
}

#[tauri::command]
pub async fn system_check(logs: State<'_, LogStore>) -> Result<SystemCheck, String> {
    logs.push(LogLevel::Info, "Running system check…", "system");

    let homebrew_prefix = detect_homebrew_prefix();
    let prefix = homebrew_prefix.clone().unwrap_or_else(|| "/opt/homebrew".to_string());

    // Use filesystem check first so detection works even when Homebrew's bin
    // directory is not in the minimal PATH that Tauri inherits.
    let brew_bin = find_binary("brew", &[
        "/opt/homebrew/bin/brew",
        "/usr/local/bin/brew",
    ]);
    let brew_installed = brew_bin.is_some();
    let homebrew = ToolCheck {
        installed: brew_installed,
        version:   brew_bin.as_deref().and_then(|p| run_version_at(p, &["--version"])),
        path:      brew_bin,
    };

    let git_bin = find_binary("git", &[
        "/usr/bin/git",
        "/opt/homebrew/bin/git",
        "/usr/local/bin/git",
    ]);
    let git_installed = git_bin.is_some();
    let git = ToolCheck {
        installed: git_installed,
        version:   git_bin.as_deref().and_then(|p| run_version_at(p, &["--version"])),
        path:      git_bin,
    };

    let apache_bin = format!("{}/bin/httpd", prefix);
    let apache_path = find_binary("httpd", &[apache_bin.as_str(), "/usr/sbin/httpd"]);
    let apache_installed = apache_path.is_some();
    let apache = ToolCheck {
        installed: apache_installed,
        version:   apache_path.as_deref().and_then(|p| run_version_at(p, &["-v"])),
        path:      apache_path,
    };

    let mysql_bin = format!("{}/bin/mysql", prefix);
    let mysql_path = find_binary("mysql", &[mysql_bin.as_str()]);
    let mysql_installed = mysql_path.is_some();
    let mysql = ToolCheck {
        installed: mysql_installed,
        version:   mysql_path.as_deref().and_then(|p| run_version_at(p, &["--version"])),
        path:      mysql_path,
    };

    let php_bin = format!("{}/bin/php", prefix);
    let php_path = find_binary("php", &[php_bin.as_str(), "/usr/bin/php"]);
    let php_installed = php_path.is_some();
    let php = ToolCheck {
        installed: php_installed,
        version:   php_path.as_deref().and_then(|p| {
            run_version_at(p, &["--version"])
                .map(|v| v.lines().next().unwrap_or("").to_string())
        }),
        path: php_path,
    };

    logs.push(LogLevel::Success, "System check complete", "system");
    Ok(SystemCheck { homebrew, git, apache, mysql, php, homebrew_prefix })
}

#[tauri::command]
pub async fn complete_setup(
    homebrew_prefix: String,
    apache_service: String,
    mysql_service: String,
    php_service: Option<String>,
    logs: State<'_, LogStore>,
) -> Result<AppConfig, String> {
    logs.push(LogLevel::Info, "Completing setup wizard…", "setup");
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    cfg.setup_completed   = true;
    cfg.homebrew_prefix   = Some(homebrew_prefix);
    cfg.apache_service_name = apache_service;
    cfg.mysql_service_name  = mysql_service;
    cfg.php_service_name    = php_service;
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    logs.push(LogLevel::Success, "Setup complete", "setup");
    Ok(cfg)
}

/// Open a URL in the configured preferred browser, or the system default.
#[tauri::command]
pub async fn open_in_browser(url: String) -> Result<(), String> {
    let cfg = config::load_config().unwrap_or_default();
    let mut cmd = Command::new("open");
    if let Some(browser) = cfg.preferred_browser.filter(|b| !b.is_empty()) {
        cmd.args(["-a", &browser]);
    }
    cmd.arg(&url).spawn().map_err(|e| format!("Failed to open URL: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn reveal_in_finder(path: String) -> Result<(), String> {
    Command::new("open").args(["-R", &path]).spawn()
        .map_err(|e| format!("Failed to reveal in Finder: {}", e))?;
    Ok(())
}

/// Open the config directory itself in Finder.
#[tauri::command]
pub async fn open_config_dir_in_finder() -> Result<(), String> {
    let dir = config::config_dir().map_err(|e| e.to_string())?;
    Command::new("open").arg(dir.to_string_lossy().as_ref())
        .spawn().map_err(|e| format!("Failed to open dir: {}", e))?;
    Ok(())
}

// ── Credential commands ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn save_github_token(token: String, logs: State<'_, LogStore>) -> Result<(), String> {
    config::store_github_token(&token).map_err(|e| e.to_string())?;
    logs.push(LogLevel::Success, "GitHub token saved to Keychain", "auth");
    Ok(())
}

#[tauri::command]
pub async fn get_github_token() -> Result<Option<String>, String> {
    config::load_github_token().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_github_token(logs: State<'_, LogStore>) -> Result<(), String> {
    config::delete_github_token().map_err(|e| e.to_string())?;
    logs.push(LogLevel::Info, "GitHub token removed from Keychain", "auth");
    Ok(())
}

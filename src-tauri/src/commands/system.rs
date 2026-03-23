use std::process::Command;
use tauri::State;

use crate::config;
use crate::log_store::LogStore;
use crate::models::{AppConfig, LogLevel, SystemCheck, ToolCheck};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn run_version(cmd: &str, args: &[&str]) -> Option<String> {
    Command::new(cmd)
        .args(args)
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                // Some tools print version to stderr.
                let stderr = String::from_utf8_lossy(&o.stderr).trim().to_string();
                if !stderr.is_empty() {
                    Some(stderr)
                } else {
                    None
                }
            }
        })
}

fn which(cmd: &str) -> Option<String> {
    Command::new("which")
        .arg(cmd)
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                let path = String::from_utf8_lossy(&o.stdout).trim().to_string();
                if path.is_empty() {
                    None
                } else {
                    Some(path)
                }
            } else {
                None
            }
        })
}

fn detect_homebrew_prefix() -> Option<String> {
    // Apple Silicon default
    if std::path::Path::new("/opt/homebrew/bin/brew").exists() {
        return Some("/opt/homebrew".to_string());
    }
    // Intel default
    if std::path::Path::new("/usr/local/bin/brew").exists() {
        return Some("/usr/local".to_string());
    }
    // Fallback: ask brew itself
    Command::new("brew")
        .arg("--prefix")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                if s.is_empty() { None } else { Some(s) }
            } else {
                None
            }
        })
}

fn check_brew_package(prefix: &str, bin_name: &str, formula: &str, version_args: &[&str]) -> ToolCheck {
    let bin_path = format!("{}/bin/{}", prefix, bin_name);
    let alt_path = which(bin_name);
    let installed = std::path::Path::new(&bin_path).exists() || alt_path.is_some();
    if !installed {
        return ToolCheck { installed: false, version: None, path: None };
    }
    let path = if std::path::Path::new(&bin_path).exists() {
        Some(bin_path)
    } else {
        alt_path
    };
    let version = run_version(bin_name, version_args)
        .or_else(|| run_version(&format!("{}/bin/{}", prefix, bin_name), version_args));
    ToolCheck { installed: true, version, path }
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Full system check: Homebrew, Git, Apache, MySQL, PHP.
#[tauri::command]
pub async fn system_check(logs: State<'_, LogStore>) -> Result<SystemCheck, String> {
    logs.push(LogLevel::Info, "Running system check…", "system");

    let homebrew_path = which("brew");
    let homebrew_prefix = detect_homebrew_prefix();
    let brew_installed = homebrew_path.is_some();

    let homebrew = ToolCheck {
        installed: brew_installed,
        version: if brew_installed {
            run_version("brew", &["--version"])
        } else {
            None
        },
        path: homebrew_path,
    };

    let git_path = which("git");
    let git = ToolCheck {
        installed: git_path.is_some(),
        version: if git_path.is_some() {
            run_version("git", &["--version"])
        } else {
            None
        },
        path: git_path,
    };

    let prefix = homebrew_prefix.clone().unwrap_or_else(|| "/usr/local".to_string());

    // Apache: httpd binary
    let apache_bin = format!("{}/bin/httpd", prefix);
    let apache_installed = std::path::Path::new(&apache_bin).exists() || which("httpd").is_some();
    let apache = ToolCheck {
        installed: apache_installed,
        version: if apache_installed {
            run_version("httpd", &["-v"])
                .or_else(|| run_version(&apache_bin, &["-v"]))
        } else {
            None
        },
        path: if apache_installed { Some(apache_bin) } else { None },
    };

    // MySQL: mysql binary
    let mysql_bin = format!("{}/bin/mysql", prefix);
    let mysql_installed = std::path::Path::new(&mysql_bin).exists() || which("mysql").is_some();
    let mysql = ToolCheck {
        installed: mysql_installed,
        version: if mysql_installed {
            run_version("mysql", &["--version"])
                .or_else(|| run_version(&mysql_bin, &["--version"]))
        } else {
            None
        },
        path: if mysql_installed { Some(mysql_bin) } else { None },
    };

    // PHP
    let php_bin = format!("{}/bin/php", prefix);
    let php_installed = std::path::Path::new(&php_bin).exists() || which("php").is_some();
    let php = ToolCheck {
        installed: php_installed,
        version: if php_installed {
            run_version("php", &["--version"])
                .or_else(|| run_version(&php_bin, &["--version"]))
                .map(|v| v.lines().next().unwrap_or("").to_string())
        } else {
            None
        },
        path: if php_installed { Some(php_bin) } else { None },
    };

    logs.push(LogLevel::Success, "System check complete", "system");

    Ok(SystemCheck {
        homebrew,
        git,
        apache,
        mysql,
        php,
        homebrew_prefix,
    })
}

/// Complete the first-run setup wizard: saves homebrew prefix and marks setup done.
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
    cfg.setup_completed = true;
    cfg.homebrew_prefix = Some(homebrew_prefix);
    cfg.apache_service_name = apache_service;
    cfg.mysql_service_name = mysql_service;
    cfg.php_service_name = php_service;
    config::save_config(&cfg).map_err(|e| e.to_string())?;

    logs.push(LogLevel::Success, "Setup complete", "setup");
    Ok(cfg)
}

/// Open a URL or path with macOS `open` command.
#[tauri::command]
pub async fn open_in_browser(url: String) -> Result<(), String> {
    Command::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| format!("Failed to open URL: {}", e))?;
    Ok(())
}

/// Reveal a path in Finder.
#[tauri::command]
pub async fn reveal_in_finder(path: String) -> Result<(), String> {
    Command::new("open")
        .args(["-R", &path])
        .spawn()
        .map_err(|e| format!("Failed to reveal in Finder: {}", e))?;
    Ok(())
}

/// Store a GitHub PAT in macOS Keychain.
#[tauri::command]
pub async fn save_github_token(token: String, logs: State<'_, LogStore>) -> Result<(), String> {
    config::store_github_token(&token).map_err(|e| e.to_string())?;
    logs.push(LogLevel::Success, "GitHub token saved to Keychain", "auth");
    Ok(())
}

/// Retrieve the GitHub PAT from macOS Keychain.
#[tauri::command]
pub async fn get_github_token() -> Result<Option<String>, String> {
    config::load_github_token().map_err(|e| e.to_string())
}

/// Delete the GitHub PAT from Keychain.
#[tauri::command]
pub async fn delete_github_token(logs: State<'_, LogStore>) -> Result<(), String> {
    config::delete_github_token().map_err(|e| e.to_string())?;
    logs.push(LogLevel::Info, "GitHub token removed from Keychain", "auth");
    Ok(())
}

/// Build an augmented PATH string that includes all common Homebrew and
/// system binary directories.
///
/// Tauri on macOS inherits a minimal PATH from launchd (typically only
/// "/usr/bin:/bin:/sbin") which does not include /opt/homebrew/bin.
/// Pass this to every child process via `.env("PATH", brew_path())`.
pub fn brew_path() -> String {
    let base = std::env::var("PATH").unwrap_or_default();
    format!(
        "/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin:/usr/sbin:/sbin:{}",
        base
    )
}

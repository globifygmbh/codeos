mod commands;
mod config;
mod log_store;
mod models;
mod updater;

use log_store::LogStore;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing for debug builds.
    #[cfg(debug_assertions)]
    {
        tracing_subscriber::fmt()
            .with_env_filter("codeos=debug,tauri=info")
            .init();
    }

    tauri::Builder::default()
        // ── Plugins ────────────────────────────────────────────────────────
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        // Updater: only wire up in release builds to avoid key errors during dev.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // ── Shared state ───────────────────────────────────────────────────
        .manage(LogStore::new())
        // ── Tauri commands ─────────────────────────────────────────────────
        .invoke_handler(tauri::generate_handler![
            // System / setup
            commands::system::system_check,
            commands::system::complete_setup,
            commands::system::open_in_browser,
            commands::system::reveal_in_finder,
            commands::system::save_github_token,
            commands::system::get_github_token,
            commands::system::delete_github_token,
            // Services
            commands::services::get_all_services_status,
            commands::services::get_service_status,
            commands::services::start_service,
            commands::services::stop_service,
            commands::services::restart_service,
            commands::services::get_apache_error_log,
            commands::services::get_mysql_error_log,
            // Git
            commands::git::git_clone,
            commands::git::git_status,
            commands::git::git_fetch,
            commands::git::git_pull,
            commands::git::git_push,
            commands::git::git_set_remote,
            commands::git::git_init,
            // Projects
            commands::projects::get_projects,
            commands::projects::add_project,
            commands::projects::update_project,
            commands::projects::remove_project,
            commands::projects::enable_vhost,
            commands::projects::disable_vhost,
            commands::projects::get_httpd_include_snippet,
            // Settings / logs
            commands::settings::get_config,
            commands::settings::update_config,
            commands::settings::get_logs,
            commands::settings::clear_logs,
            commands::settings::get_config_dir,
            commands::settings::reset_setup,
            // Updater
            updater::check_for_updates,
            updater::install_update,
        ])
        .run(tauri::generate_context!())
        .expect("CodeOS failed to start");
}

mod commands;
mod config;
mod log_store;
mod models;
mod updater;

use log_store::LogStore;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)]
    {
        tracing_subscriber::fmt()
            .with_env_filter("codeos=debug,tauri=info")
            .init();
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .manage(LogStore::new())
        .invoke_handler(tauri::generate_handler![
            // System / setup
            commands::system::system_check,
            commands::system::complete_setup,
            commands::system::open_in_browser,
            commands::system::reveal_in_finder,
            commands::system::open_config_dir_in_finder,
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
            commands::git::git_stage_all,
            commands::git::git_commit,
            commands::git::git_push,
            commands::git::git_set_remote,
            commands::git::git_init,
            commands::git::git_log,
            // Projects
            commands::projects::get_projects,
            commands::projects::add_project,
            commands::projects::update_project,
            commands::projects::remove_project,
            commands::projects::rename_project,
            commands::projects::duplicate_project,
            commands::projects::enable_vhost,
            commands::projects::disable_vhost,
            commands::projects::get_httpd_include_snippet,
            // Todos
            commands::todos::get_todos,
            commands::todos::add_todo,
            commands::todos::update_todo,
            commands::todos::delete_todo,
            commands::todos::reorder_todos,
            // Claude AI
            commands::claude::save_claude_api_key,
            commands::claude::get_claude_api_key_status,
            commands::claude::delete_claude_api_key_cmd,
            commands::claude::get_claude_models,
            commands::claude::claude_send_message,
            commands::claude::take_screenshot,
            commands::claude::read_image_as_base64,
            // MySQL manager
            commands::mysql_mgr::save_mysql_config,
            commands::mysql_mgr::get_mysql_config,
            commands::mysql_mgr::mysql_run_query,
            commands::mysql_mgr::mysql_list_tables,
            commands::mysql_mgr::mysql_export_database,
            commands::mysql_mgr::mysql_export_to_file,
            commands::mysql_mgr::mysql_test_connection,
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

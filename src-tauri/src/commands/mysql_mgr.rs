use std::process::Command;
use tauri::State;

use crate::config;
use crate::log_store::LogStore;
use crate::models::{LogLevel, MysqlConfig, QueryResult};
use crate::utils::brew_path;

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Builds a Vec of `mysql` CLI arguments from a MysqlConfig + optional password.
fn mysql_args<'a>(cfg: &'a MysqlConfig, password: Option<&'a str>) -> Vec<String> {
    let mut args = vec![
        format!("-h{}", cfg.host),
        format!("-P{}", cfg.port),
        format!("-u{}", cfg.user),
    ];
    if let Some(pw) = password {
        if !pw.is_empty() {
            args.push(format!("-p{}", pw));
        }
    }
    args.push("--batch".to_string());
    args.push("--raw".to_string());
    args
}

fn parse_tabular_output(output: &str) -> QueryResult {
    let mut lines = output.lines();
    let columns: Vec<String> = lines
        .next()
        .unwrap_or("")
        .split('\t')
        .map(|s| s.to_string())
        .collect();

    let rows: Vec<Vec<String>> = lines
        .map(|line| {
            line.split('\t')
                .map(|s| {
                    if s == "NULL" {
                        String::from("NULL")
                    } else {
                        s.to_string()
                    }
                })
                .collect()
        })
        .collect();

    let row_count = rows.len();
    QueryResult {
        columns,
        rows,
        row_count,
        affected_rows: None,
    }
}

// ── Config management ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn save_mysql_config(
    project_id: String,
    mysql_cfg: MysqlConfig,
    password: Option<String>,
) -> Result<(), String> {
    let mut cfg = config::load_config().map_err(|e| e.to_string())?;
    let project = cfg
        .projects
        .iter_mut()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;

    project.mysql_config = Some(mysql_cfg);

    if let Some(pw) = password {
        if !pw.is_empty() {
            config::store_mysql_password(&project_id, &pw)
                .map_err(|e| e.to_string())?;
        }
    }
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    Ok(())
}

/// Returns the stored MysqlConfig for a project (without password).
#[tauri::command]
pub async fn get_mysql_config(project_id: String) -> Result<Option<MysqlConfig>, String> {
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let mysql = cfg
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .map(|p| p.mysql_config.clone())
        .flatten();
    Ok(mysql)
}

// ── Query execution ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn mysql_run_query(
    project_id: String,
    query: String,
    logs: State<'_, LogStore>,
) -> Result<QueryResult, String> {
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let project = cfg
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;
    let mysql_cfg = project
        .mysql_config
        .as_ref()
        .ok_or_else(|| "MySQL not configured for this project".to_string())?;

    let password = config::load_mysql_password(&project_id)
        .unwrap_or(None)
        .unwrap_or_default();

    let mut args = mysql_args(mysql_cfg, Some(&password));

    // Only add database arg if set.
    if !mysql_cfg.database.is_empty() {
        args.push(mysql_cfg.database.clone());
    }
    args.push("-e".to_string());
    args.push(query.clone());

    logs.push(
        LogLevel::Info,
        format!("MySQL query on '{}': {}", mysql_cfg.database, &query[..query.len().min(80)]),
        "mysql",
    );

    let output = Command::new("mysql")
        .args(&args)
        .env("PATH", brew_path())
        .output()
        .map_err(|e| format!("mysql CLI not found or failed: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        logs.push(LogLevel::Error, format!("MySQL error: {}", err), "mysql");
        return Err(err);
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let result = parse_tabular_output(&stdout);
    logs.push(
        LogLevel::Success,
        format!("Query returned {} rows", result.row_count),
        "mysql",
    );
    Ok(result)
}


/// List all tables in the configured database.
#[tauri::command]
pub async fn mysql_list_tables(
    project_id: String,
    logs: State<'_, LogStore>,
) -> Result<Vec<String>, String> {
    let result = mysql_run_query(project_id, "SHOW TABLES".to_string(), logs).await?;
    Ok(result
        .rows
        .into_iter()
        .filter_map(|row| row.into_iter().next())
        .collect())
}

/// Export the database using `mysqldump` and return the SQL as a string.
/// For large databases, use `mysql_export_to_file` instead.
#[tauri::command]
pub async fn mysql_export_database(
    project_id: String,
    logs: State<'_, LogStore>,
) -> Result<String, String> {
    let cfg = config::load_config().map_err(|e| e.to_string())?;
    let project = cfg
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or_else(|| format!("Project not found: {}", project_id))?;
    let mysql_cfg = project
        .mysql_config
        .as_ref()
        .ok_or_else(|| "MySQL not configured for this project".to_string())?;

    if mysql_cfg.database.is_empty() {
        return Err("No database name configured for this project".to_string());
    }

    let password = config::load_mysql_password(&project_id)
        .unwrap_or(None)
        .unwrap_or_default();

    let mut args = vec![
        format!("-h{}", mysql_cfg.host),
        format!("-P{}", mysql_cfg.port),
        format!("-u{}", mysql_cfg.user),
    ];
    if !password.is_empty() {
        args.push(format!("-p{}", password));
    }
    args.push("--single-transaction".to_string());
    args.push("--routines".to_string());
    args.push(mysql_cfg.database.clone());

    logs.push(
        LogLevel::Info,
        format!("mysqldump: exporting '{}'", mysql_cfg.database),
        "mysql",
    );

    let output = Command::new("mysqldump")
        .args(&args)
        .env("PATH", brew_path())
        .output()
        .map_err(|e| format!("mysqldump not found or failed: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        logs.push(LogLevel::Error, format!("mysqldump failed: {}", err), "mysql");
        return Err(err);
    }

    logs.push(LogLevel::Success, "Export complete", "mysql");
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Export the database to a file on disk.
#[tauri::command]
pub async fn mysql_export_to_file(
    project_id: String,
    file_path: String,
    logs: State<'_, LogStore>,
) -> Result<(), String> {
    let sql = mysql_export_database(project_id, logs).await?;
    std::fs::write(&file_path, sql)
        .map_err(|e| format!("Cannot write export file: {}", e))?;
    Ok(())
}

/// Test connection to the configured MySQL server.
#[tauri::command]
pub async fn mysql_test_connection(
    project_id: String,
    logs: State<'_, LogStore>,
) -> Result<String, String> {
    mysql_run_query(
        project_id,
        "SELECT VERSION() AS version".to_string(),
        logs,
    )
    .await
    .map(|r| {
        r.rows
            .first()
            .and_then(|row| row.first())
            .cloned()
            .unwrap_or_else(|| "Connected".to_string())
    })
}

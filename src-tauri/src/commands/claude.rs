use base64::{engine::general_purpose, Engine as _};
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::{AppHandle, Emitter, State};

use crate::config;
use crate::log_store::LogStore;
use crate::models::LogLevel;

// ── API key management ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn save_claude_api_key(key: String, logs: State<'_, LogStore>) -> Result<(), String> {
    config::store_claude_api_key(&key).map_err(|e| e.to_string())?;
    logs.push(LogLevel::Success, "Claude API key saved to Keychain", "claude");
    Ok(())
}

#[tauri::command]
pub async fn get_claude_api_key_status() -> Result<bool, String> {
    Ok(config::load_claude_api_key()
        .map(|k| k.is_some())
        .unwrap_or(false))
}

#[tauri::command]
pub async fn delete_claude_api_key_cmd(logs: State<'_, LogStore>) -> Result<(), String> {
    config::delete_claude_api_key().map_err(|e| e.to_string())?;
    logs.push(LogLevel::Info, "Claude API key removed from Keychain", "claude");
    Ok(())
}

/// Returns the list of selectable Claude models.
#[tauri::command]
pub fn get_claude_models() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({
            "id": "claude-sonnet-4-6",
            "name": "Claude Sonnet 4.6",
            "description": "Balanced speed & intelligence — recommended"
        }),
        serde_json::json!({
            "id": "claude-opus-4-6",
            "name": "Claude Opus 4.6",
            "description": "Most capable — best for complex tasks"
        }),
        serde_json::json!({
            "id": "claude-haiku-4-5-20251001",
            "name": "Claude Haiku 4.5",
            "description": "Fastest — great for quick questions"
        }),
    ]
}

// ── Message types ─────────────────────────────────────────────────────────────

/// A single text or image content block for the Claude API.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    Text {
        text: String,
    },
    Image {
        source: ImageSource,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageSource {
    #[serde(rename = "type")]
    pub source_type: String, // "base64"
    pub media_type: String,  // "image/png" | "image/jpeg" | "image/webp" | "image/gif"
    pub data: String,        // base64-encoded bytes
}

/// A chat message from the frontend — content may be either a plain string
/// (text-only) or a list of ContentBlock (text + images).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "user" | "assistant"
    pub content: ChatContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ChatContent {
    Text(String),
    Blocks(Vec<ContentBlock>),
}

/// Converts ChatContent to the form accepted by the Anthropic API.
fn content_to_api_value(content: &ChatContent) -> serde_json::Value {
    match content {
        ChatContent::Text(t) => serde_json::json!(t),
        ChatContent::Blocks(blocks) => serde_json::json!(blocks),
    }
}

// ── System prompt builder ─────────────────────────────────────────────────────

fn build_system_prompt(project_path: Option<&str>, project_name: Option<&str>) -> String {
    let mut system = String::from(
        "You are Claude, an expert software engineer embedded in CodeOS — a local macOS \
         development environment manager. You specialise in PHP, HTML, CSS, JavaScript, \
         MySQL, Apache, and web development in general.\n\n\
         Be concise and practical. When suggesting file changes, always include the \
         relative path from the project root. Prefer working code over lengthy explanations.",
    );

    if let (Some(path), Some(name)) = (project_path, project_name) {
        system.push_str(&format!(
            "\n\n## Active project\nName: {name}\nRoot path: `{path}`\n\
             Use this context when referring to files or suggesting shell commands."
        ));
    }

    system
}

// ── Streaming chat command ────────────────────────────────────────────────────

/// Send a chat message to the Claude API and stream the response back
/// via Tauri events: `claude-chunk-<stream_id>` and `claude-done-<stream_id>`.
#[tauri::command]
pub async fn claude_send_message(
    app: AppHandle,
    messages: Vec<ChatMessage>,
    model: String,
    project_path: Option<String>,
    project_name: Option<String>,
    stream_id: String,
    logs: State<'_, LogStore>,
) -> Result<(), String> {
    let api_key = config::load_claude_api_key()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Claude API key not configured. Add it in Settings → Claude API.".to_string())?;

    // Validate model to prevent arbitrary strings reaching the API.
    let model = match model.as_str() {
        "claude-sonnet-4-6" | "claude-opus-4-6" | "claude-haiku-4-5-20251001" => model,
        _ => "claude-sonnet-4-6".to_string(),
    };

    let system = build_system_prompt(project_path.as_deref(), project_name.as_deref());

    // Convert messages to Anthropic API format.
    let api_messages: Vec<serde_json::Value> = messages
        .iter()
        .map(|m| {
            serde_json::json!({
                "role": m.role,
                "content": content_to_api_value(&m.content)
            })
        })
        .collect();

    logs.push(
        LogLevel::Info,
        format!("Claude request — model: {}, turns: {}", model, messages.len()),
        "claude",
    );

    let client = Client::new();
    let body = serde_json::json!({
        "model": model,
        "max_tokens": 8192,
        "system": system,
        "messages": api_messages,
        "stream": true
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            let msg = format!("Request failed: {}", e);
            logs.push(LogLevel::Error, &msg, "claude");
            msg
        })?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body_text = response.text().await.unwrap_or_default();
        // Try to extract a readable message from the API error JSON.
        let friendly = serde_json::from_str::<serde_json::Value>(&body_text)
            .ok()
            .and_then(|v| {
                v.get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or(body_text);
        let msg = format!("API error {}: {}", status, friendly);
        logs.push(LogLevel::Error, &msg, "claude");
        app.emit(&format!("claude-error-{}", stream_id), &msg).ok();
        return Err(msg);
    }

    // ── SSE streaming ─────────────────────────────────────────────────────────
    let mut byte_stream = response.bytes_stream();
    let mut buffer = String::new();

    'stream: while let Some(chunk) = byte_stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // SSE events are separated by double newlines.
        loop {
            let Some(event_end) = buffer.find("\n\n") else {
                break;
            };
            let event_text = buffer[..event_end].to_string();
            buffer = buffer[event_end + 2..].to_string();

            // Find the data: line within this event.
            let Some(data) = event_text
                .lines()
                .find(|l| l.starts_with("data: "))
                .map(|l| &l[6..])
            else {
                continue;
            };

            if data.trim() == "[DONE]" {
                break 'stream;
            }

            let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) else {
                continue;
            };

            match parsed.get("type").and_then(|t| t.as_str()) {
                Some("content_block_delta") => {
                    if let Some(text) = parsed
                        .get("delta")
                        .and_then(|d| d.get("text"))
                        .and_then(|t| t.as_str())
                    {
                        app.emit(&format!("claude-chunk-{}", stream_id), text).ok();
                    }
                }
                Some("message_stop") => break 'stream,
                _ => {}
            }
        }
    }

    app.emit(&format!("claude-done-{}", stream_id), ()).ok();
    logs.push(LogLevel::Success, "Claude response complete", "claude");
    Ok(())
}

// ── Screenshot capture ────────────────────────────────────────────────────────

/// Take a full-screen screenshot (without window selection prompt) and return
/// it as a base64-encoded PNG string ready for the Claude API.
#[tauri::command]
pub async fn take_screenshot() -> Result<String, String> {
    let path = format!(
        "/tmp/codeos-screenshot-{}.png",
        chrono::Local::now().timestamp_millis()
    );

    let status = Command::new("screencapture")
        .args(["-x", "-t", "png", &path])
        .status()
        .map_err(|e| format!("screencapture failed: {}", e))?;

    if !status.success() {
        return Err("Screenshot command failed".to_string());
    }

    let bytes =
        std::fs::read(&path).map_err(|e| format!("Could not read screenshot file: {}", e))?;
    let _ = std::fs::remove_file(&path); // cleanup

    Ok(general_purpose::STANDARD.encode(&bytes))
}

/// Read an image file from disk and return it as base64 + media_type.
#[tauri::command]
pub async fn read_image_as_base64(path: String) -> Result<serde_json::Value, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Cannot read {}: {}", path, e))?;
    let b64 = general_purpose::STANDARD.encode(&bytes);
    let media_type = if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        "image/jpeg"
    } else if path.ends_with(".webp") {
        "image/webp"
    } else if path.ends_with(".gif") {
        "image/gif"
    } else {
        "image/png"
    };
    Ok(serde_json::json!({ "data": b64, "media_type": media_type }))
}

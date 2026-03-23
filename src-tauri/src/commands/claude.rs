use base64::{engine::general_purpose, Engine as _};
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::{AppHandle, Emitter, State};

use crate::commands::credentials::upsert_credential;
use crate::commands::project_logs::{execute_in_dir, write_project_log};
use crate::config;
use crate::log_store::LogStore;
use crate::models::{CredentialEntry, CredentialField, LogLevel};

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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
    Text { text: String },
    Image { source: ImageSource },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageSource {
    #[serde(rename = "type")]
    pub source_type: String,
    pub media_type: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: ChatContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ChatContent {
    Text(String),
    Blocks(Vec<ContentBlock>),
}

fn content_to_api_value(content: &ChatContent) -> serde_json::Value {
    match content {
        ChatContent::Text(t) => serde_json::json!(t),
        ChatContent::Blocks(blocks) => serde_json::json!(blocks),
    }
}

// ── System prompts ────────────────────────────────────────────────────────────

fn build_system_prompt(
    project_path: Option<&str>,
    project_name: Option<&str>,
    has_tools: bool,
) -> String {
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

    if has_tools {
        system.push_str(
            "\n\n## Tool use\n\
             You have two tools available:\n\n\
             ### bash\n\
             Executes shell commands inside the project directory. Use it to:\n\
             - Install packages: `npm install <pkg>`, `composer require <pkg>`, `pip install <pkg>`\n\
             - Read files: `cat package.json`, `ls -la src/`\n\
             - Run build tools: `npm run build`, `npx tailwindcss ...`\n\
             - Check versions: `node --version`, `php --version`\n\
             Always prefer using the tool over asking the user to run commands manually.\n\n\
             ### save_credential\n\
             Saves a credential or project info entry (login, database, API key, notes) to the \
             project info panel. The user can view all saved credentials at any time in the \
             project card under the Info tab.\n\
             **Always use this when you:**\n\
             - Create a test user, admin account, or staging login\n\
             - Set up a database with credentials\n\
             - Generate or configure an API key\n\
             - Set environment variables with sensitive values\n\
             - Create any access credentials the user might need later\n\
             This ensures the user never has to ask you to repeat credentials.",
        );
    }

    system
}

fn build_test_system_prompt(project_name: Option<&str>) -> String {
    let mut system = String::from(
        "You are a QA test agent embedded in CodeOS. Your job is to analyse screenshots of \
         web projects and identify issues.\n\n\
         When given a screenshot, you:\n\
         1. **Describe what you see** — what page/section is shown, key UI elements visible\n\
         2. **Identify issues** — broken layouts, misaligned elements, wrong colours, missing \
            content, overlapping elements, console errors visible on screen, 404 pages, \
            empty states that shouldn't be empty, etc.\n\
         3. **Rate severity** — Critical (breaks functionality), Major (visible bug), \
            Minor (cosmetic issue), OK (no issues found)\n\
         4. **Ask for fix** — if issues were found, end with: \
            \"Soll ich diese Probleme direkt beheben? (Wechsle zum Code-Agent zum Umsetzen)\"\n\n\
         Be specific and actionable. Reference exact element positions (top-right, \
         below the header, etc.). Keep your analysis concise.\n\
         Respond in the same language as the user.",
    );

    if let Some(name) = project_name {
        system.push_str(&format!("\n\n## Project under test: {name}"));
    }

    system
}

fn build_design_system_prompt(project_name: Option<&str>) -> String {
    let mut system = String::from(
        "You are a senior UI/UX designer and design consultant embedded in CodeOS. \
         Your role is to help define the visual identity and design system for web projects \
         before any code is written.\n\n\
         When the user describes their project or shares design inspiration images, you:\n\
         1. **Analyse the visual style** — identify colour palette, typography, spacing, \
            component patterns, motion/animation style, overall mood (minimal, bold, dark, etc.)\n\
         2. **Describe design references** — suggest specific established design systems, \
            UI libraries, or well-known sites with a similar aesthetic. Be concrete \
            (e.g. \"similar to Linear's dark dashboard\", \"Stripe's clean documentation style\", \
            \"Vercel's monochrome minimal aesthetic\").\n\
         3. **Produce a structured Design Brief** with the following sections:\n\
            - **Visual Style** — mood, personality keywords, overall direction\n\
            - **Colour Palette** — primary, secondary, accent, background, text colours \
              as hex values with semantic names (e.g. `--color-primary: #6366f1`)\n\
            - **Typography** — heading font, body font, font sizes scale, weights\n\
            - **Spacing & Layout** — grid system, spacing scale, border-radius style\n\
            - **Components** — list key UI components needed (nav, cards, buttons, forms, etc.) \
              with a brief visual description for each\n\
            - **CSS Variables** — a ready-to-use `:root {}` block the developer can paste in\n\
            - **Tailwind Config** — relevant Tailwind `theme.extend` entries if applicable\n\
            - **Key Libraries** — recommend specific npm packages (e.g. Framer Motion for \
              animations, a specific icon set, a specific component library)\n\
         4. End your brief with a **\"🚀 Bereit für den Code-Agent\"** section summarising in \
            2–3 sentences what the code agent should build first.\n\n\
         Be visual and inspiring. Give hex codes, real font names (Google Fonts are fine), \
         and concrete library names. Avoid vague language like \"modern\" without backing it up \
         with specific design decisions.\n\
         Respond in the same language as the user (German if they write German, English if English).",
    );

    if let Some(name) = project_name {
        system.push_str(&format!("\n\n## Project: {name}"));
    }

    system
}

// ── Tool definitions ──────────────────────────────────────────────────────────

fn bash_tool_definition() -> serde_json::Value {
    serde_json::json!({
        "name": "bash",
        "description": "Run a shell command in the project's root directory. \
                         Use this to install packages, read files, run build tools, \
                         or inspect the project structure.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The bash command to execute (e.g. 'npm install tailwindcss', 'cat package.json')"
                }
            },
            "required": ["command"]
        }
    })
}

fn save_credential_tool_definition() -> serde_json::Value {
    serde_json::json!({
        "name": "save_credential",
        "description": "Save a credential or project info entry to the project's Info panel. \
                         Use this whenever you create a login, database, API key, or any other \
                         credentials the user will need. The user sees these in the Info tab of the project card.",
        "input_schema": {
            "type": "object",
            "properties": {
                "label": {
                    "type": "string",
                    "description": "Short name for this entry (e.g. 'Admin Login', 'MySQL Datenbank', 'Stripe API Key')"
                },
                "category": {
                    "type": "string",
                    "enum": ["login", "database", "api", "env", "note"],
                    "description": "Category: login (username/password), database, api (API key), env (.env variable), note"
                },
                "fields": {
                    "type": "array",
                    "description": "Key-value pairs for this credential",
                    "items": {
                        "type": "object",
                        "properties": {
                            "key":    { "type": "string", "description": "Field name (e.g. 'URL', 'Benutzername', 'Passwort', 'Datenbank')" },
                            "value":  { "type": "string", "description": "Field value" },
                            "secret": { "type": "boolean", "description": "Set to true for passwords, API keys, secrets" }
                        },
                        "required": ["key", "value"]
                    }
                }
            },
            "required": ["label", "category", "fields"]
        }
    })
}

// ── Streaming helpers ─────────────────────────────────────────────────────────

/// A content block being accumulated from the SSE stream.
#[derive(Debug)]
enum StreamBlock {
    Text { index: usize, text: String },
    ToolUse { index: usize, id: String, name: String, input_json: String },
}

/// Result of draining one full streaming response.
struct StreamResult {
    text_blocks: Vec<String>,
    tool_use_blocks: Vec<(String, String, String)>, // (id, name, input_json)
    stop_reason: String,
}

/// chunk_event: if Some("event-name"), emits text deltas to that event; if None, silently accumulates.
async fn drain_stream(
    response: reqwest::Response,
    app: &AppHandle,
    chunk_event: Option<&str>,
) -> Result<StreamResult, String> {
    let mut byte_stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut blocks: Vec<StreamBlock> = Vec::new();
    let mut stop_reason = String::from("end_turn");

    'outer: while let Some(chunk) = byte_stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        loop {
            let Some(event_end) = buffer.find("\n\n") else {
                break;
            };
            let event_text = buffer[..event_end].to_string();
            buffer = buffer[event_end + 2..].to_string();

            let Some(data) = event_text
                .lines()
                .find(|l| l.starts_with("data: "))
                .map(|l| l[6..].to_string())
            else {
                continue;
            };

            if data.trim() == "[DONE]" {
                break 'outer;
            }

            let Ok(ev) = serde_json::from_str::<serde_json::Value>(&data) else {
                continue;
            };

            match ev.get("type").and_then(|t| t.as_str()) {
                // Start a new content block
                Some("content_block_start") => {
                    let index = ev.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;
                    let cb = ev.get("content_block");
                    match cb.and_then(|b| b.get("type")).and_then(|t| t.as_str()) {
                        Some("text") => blocks.push(StreamBlock::Text { index, text: String::new() }),
                        Some("tool_use") => {
                            let id = cb.and_then(|b| b.get("id")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let name = cb.and_then(|b| b.get("name")).and_then(|v| v.as_str()).unwrap_or("bash").to_string();
                            blocks.push(StreamBlock::ToolUse { index, id, name, input_json: String::new() });
                        }
                        _ => {}
                    }
                }

                // Delta into an existing block
                Some("content_block_delta") => {
                    let index = ev.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;
                    let delta = ev.get("delta");
                    let delta_type = delta.and_then(|d| d.get("type")).and_then(|t| t.as_str());

                    match delta_type {
                        Some("text_delta") => {
                            let text = delta.and_then(|d| d.get("text")).and_then(|t| t.as_str()).unwrap_or("");
                            if let Some(event) = chunk_event {
                                app.emit(event, text).ok();
                            }
                            if let Some(b) = blocks.iter_mut().find(|b| matches!(b, StreamBlock::Text { index: i, .. } if *i == index)) {
                                if let StreamBlock::Text { text: t, .. } = b {
                                    t.push_str(text);
                                }
                            }
                        }
                        Some("input_json_delta") => {
                            let partial = delta.and_then(|d| d.get("partial_json")).and_then(|v| v.as_str()).unwrap_or("");
                            if let Some(b) = blocks.iter_mut().find(|b| matches!(b, StreamBlock::ToolUse { index: i, .. } if *i == index)) {
                                if let StreamBlock::ToolUse { input_json, .. } = b {
                                    input_json.push_str(partial);
                                }
                            }
                        }
                        _ => {}
                    }
                }

                Some("message_delta") => {
                    if let Some(reason) = ev.get("delta").and_then(|d| d.get("stop_reason")).and_then(|r| r.as_str()) {
                        stop_reason = reason.to_string();
                    }
                }

                Some("message_stop") => break 'outer,
                _ => {}
            }
        }
    }

    let mut text_blocks = Vec::new();
    let mut tool_use_blocks = Vec::new();

    for block in blocks {
        match block {
            StreamBlock::Text { text, .. } if !text.is_empty() => text_blocks.push(text),
            StreamBlock::ToolUse { id, name, input_json, .. } => tool_use_blocks.push((id, name, input_json)),
            _ => {}
        }
    }

    Ok(StreamResult { text_blocks, tool_use_blocks, stop_reason })
}

// ── Main send command ─────────────────────────────────────────────────────────

#[tauri::command]
pub async fn claude_send_message(
    app: AppHandle,
    messages: Vec<ChatMessage>,
    model: String,
    project_path: Option<String>,
    project_id: Option<String>,
    project_name: Option<String>,
    mode: Option<String>,
    stream_id: String,
    logs: State<'_, LogStore>,
) -> Result<(), String> {
    let api_key = config::load_claude_api_key()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Claude API key not configured. Add it in Settings → Claude API.".to_string())?;

    let model = match model.as_str() {
        "claude-sonnet-4-6" | "claude-opus-4-6" | "claude-haiku-4-5-20251001" => model,
        _ => "claude-sonnet-4-6".to_string(),
    };

    let is_design_mode = mode.as_deref() == Some("design");
    let is_test_mode   = mode.as_deref() == Some("test");

    // Enable tool use only in code mode when a project path is selected
    let enable_tools = project_path.is_some() && !is_design_mode && !is_test_mode;
    let system = if is_design_mode {
        build_design_system_prompt(project_name.as_deref())
    } else if is_test_mode {
        build_test_system_prompt(project_name.as_deref())
    } else {
        build_system_prompt(project_path.as_deref(), project_name.as_deref(), enable_tools)
    };

    let mut conversation: Vec<serde_json::Value> = messages
        .iter()
        .map(|m| serde_json::json!({ "role": m.role, "content": content_to_api_value(&m.content) }))
        .collect();

    logs.push(
        LogLevel::Info,
        format!("Claude request — model: {}, turns: {}", model, messages.len()),
        "claude",
    );

    let client = Client::new();
    const MAX_TOOL_ROUNDS: usize = 10;

    for round in 0..MAX_TOOL_ROUNDS {
        let mut body = serde_json::json!({
            "model": model,
            "max_tokens": 8192,
            "system": system,
            "messages": conversation,
            "stream": true
        });

        if enable_tools {
            body["tools"] = serde_json::json!([
                bash_tool_definition(),
                save_credential_tool_definition(),
            ]);
        }

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
            let friendly = serde_json::from_str::<serde_json::Value>(&body_text)
                .ok()
                .and_then(|v| v.get("error").and_then(|e| e.get("message")).and_then(|m| m.as_str()).map(|s| s.to_string()))
                .unwrap_or(body_text);
            let msg = format!("API error {}: {}", status, friendly);
            logs.push(LogLevel::Error, &msg, "claude");
            app.emit(&format!("claude-error-{}", stream_id), &msg).ok();
            return Err(msg);
        }

        let result = drain_stream(response, &app, Some(&format!("claude-chunk-{}", stream_id))).await?;

        // Build the assistant turn for conversation history
        let mut assistant_content: Vec<serde_json::Value> = Vec::new();
        for text in &result.text_blocks {
            assistant_content.push(serde_json::json!({ "type": "text", "text": text }));
        }
        for (id, name, input_json) in &result.tool_use_blocks {
            let input: serde_json::Value = serde_json::from_str(input_json).unwrap_or(serde_json::json!({}));
            assistant_content.push(serde_json::json!({
                "type": "tool_use",
                "id": id,
                "name": name,
                "input": input
            }));
        }
        conversation.push(serde_json::json!({ "role": "assistant", "content": assistant_content }));

        // If Claude wants to use tools, execute them
        if result.stop_reason == "tool_use" && !result.tool_use_blocks.is_empty() {
            let mut tool_results: Vec<serde_json::Value> = Vec::new();

            for (call_id, tool_name, input_json) in &result.tool_use_blocks {
                let input: serde_json::Value = serde_json::from_str(input_json).unwrap_or_default();

                match tool_name.as_str() {
                    // ── bash tool ─────────────────────────────────────────────
                    "bash" => {
                        let command = input.get("command").and_then(|v| v.as_str()).unwrap_or("").to_string();

                        app.emit(&format!("claude-tool-call-{}", stream_id), serde_json::json!({
                            "call_id": call_id,
                            "command": command,
                            "round": round
                        })).ok();

                        let exec_result = if let Some(path) = &project_path {
                            execute_in_dir(path, &command)
                        } else {
                            crate::models::CommandOutput {
                                stdout: String::new(),
                                stderr: "No project directory available".to_string(),
                                exit_code: 1,
                                duration_ms: 0,
                                command: command.clone(),
                            }
                        };

                        if let Some(pid) = &project_id {
                            let level = if exec_result.exit_code == 0 { "success" } else { "error" };
                            let _ = write_project_log(
                                pid,
                                level,
                                &format!("$ {}\n{}{}", command,
                                    if exec_result.stdout.trim().is_empty() { String::new() } else { exec_result.stdout.trim().to_string() + "\n" },
                                    if exec_result.stderr.trim().is_empty() { String::new() } else { exec_result.stderr.trim().to_string() }
                                ),
                                "claude-agent",
                            );
                        }

                        logs.push(
                            if exec_result.exit_code == 0 { LogLevel::Success } else { LogLevel::Error },
                            format!("Agent ran: {} → exit {}", command, exec_result.exit_code),
                            "claude-agent",
                        );

                        app.emit(&format!("claude-tool-result-{}", stream_id), serde_json::json!({
                            "call_id": call_id,
                            "stdout": exec_result.stdout,
                            "stderr": exec_result.stderr,
                            "exit_code": exec_result.exit_code,
                            "duration_ms": exec_result.duration_ms
                        })).ok();

                        let output = format!(
                            "exit_code: {}\nstdout:\n{}\nstderr:\n{}",
                            exec_result.exit_code, exec_result.stdout.trim(), exec_result.stderr.trim()
                        );

                        tool_results.push(serde_json::json!({
                            "type": "tool_result",
                            "tool_use_id": call_id,
                            "content": output
                        }));
                    }

                    // ── save_credential tool ──────────────────────────────────
                    "save_credential" => {
                        let label    = input.get("label").and_then(|v| v.as_str()).unwrap_or("Unbekannt").to_string();
                        let category = input.get("category").and_then(|v| v.as_str()).unwrap_or("note").to_string();

                        let fields: Vec<CredentialField> = input
                            .get("fields")
                            .and_then(|v| v.as_array())
                            .map(|arr| arr.iter().filter_map(|f| {
                                let key    = f.get("key").and_then(|v| v.as_str())?.to_string();
                                let value  = f.get("value").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                let secret = f.get("secret").and_then(|v| v.as_bool()).unwrap_or(false);
                                Some(CredentialField { key, value, secret })
                            }).collect())
                            .unwrap_or_default();

                        let entry = CredentialEntry {
                            id: uuid::Uuid::new_v4().to_string(),
                            label: label.clone(),
                            category,
                            fields,
                            created_at: chrono::Local::now().to_rfc3339(),
                        };

                        let result_msg = if let Some(pid) = &project_id {
                            match upsert_credential(pid.clone(), entry, logs.clone()).await {
                                Ok(_) => {
                                    // Emit event so frontend refreshes credentials panel
                                    app.emit("credential-saved", serde_json::json!({ "project_id": pid })).ok();
                                    format!("Credential '{}' saved to project info panel.", label)
                                }
                                Err(e) => format!("Failed to save credential: {}", e),
                            }
                        } else {
                            "No project selected — credential not saved.".to_string()
                        };

                        // Emit as a special tool-call event for UI display
                        app.emit(&format!("claude-tool-call-{}", stream_id), serde_json::json!({
                            "call_id": call_id,
                            "command": format!("save_credential: {}", label),
                            "round": round
                        })).ok();
                        app.emit(&format!("claude-tool-result-{}", stream_id), serde_json::json!({
                            "call_id": call_id,
                            "stdout": result_msg,
                            "stderr": "",
                            "exit_code": 0,
                            "duration_ms": 0
                        })).ok();

                        tool_results.push(serde_json::json!({
                            "type": "tool_result",
                            "tool_use_id": call_id,
                            "content": result_msg
                        }));
                    }

                    _ => {
                        tool_results.push(serde_json::json!({
                            "type": "tool_result",
                            "tool_use_id": call_id,
                            "content": format!("Unknown tool: {}", tool_name)
                        }));
                    }
                }
            }

            // Add tool results as user turn and continue loop
            conversation.push(serde_json::json!({ "role": "user", "content": tool_results }));
            continue; // next round
        }

        // stop_reason == "end_turn" (or not tool_use) → done
        break;
    }

    app.emit(&format!("claude-done-{}", stream_id), ()).ok();
    logs.push(LogLevel::Success, "Claude response complete", "claude");
    Ok(())
}

// ── Specialist agent system prompts ──────────────────────────────────────────

fn build_planning_system_prompt(project_name: Option<&str>) -> String {
    let mut s = String::from(
        "You are a senior software architect embedded in CodeOS. Before any code is written, \
         break the given task into a clear, actionable implementation plan.\n\n\
         Output EXACTLY this structure:\n\
         ## Task Classification\n- Type: [feature|bugfix|refactor|review]\n\
         - Domain: [website|admin_panel|api|backend|general]\n\
         - Risk Level: [low|medium|high|critical]\n\n\
         ## Architecture Plan\n[Step-by-step implementation — use real file paths]\n\n\
         ## Files to Create or Modify\n[Concrete list: path + brief description of change]\n\n\
         ## Technical Decisions\n[State management, caching, auth, DB design, folder structure]\n\n\
         ## Recommended Reviewers\n[List from: test,security,ux,accessibility,performance,data,\
         api,devops,seo,conversion,rbac,table_workflow,forms — with reason]\n\n\
         ## Potential Risks\n[Technical debt, edge cases, scaling concerns]\n\n\
         Be specific. Use concrete file paths. Avoid generic advice. \
         Respond in the same language as the user.",
    );
    if let Some(n) = project_name {
        s.push_str(&format!("\n\n## Project: {n}"));
    }
    s
}

fn build_ux_system_prompt(project_name: Option<&str>) -> String {
    let mut s = String::from(
        "You are a senior UX and product specialist embedded in CodeOS. Review digital products \
         through the lens of real user workflows, not aesthetics.\n\
         Focus on: user flows and unnecessary steps, jobs-to-be-done thinking, empty states and \
         error messages, table/filter/bulk action patterns, onboarding experience, modal flows.\n\
         For each issue: describe the user impact and suggest a concrete fix.\n\
         Rate issues: Critical (blocks user goal) | Major (frustrates users) | Minor (small friction).\n\
         End your review with exactly one of: `## Ergebnis: PASS` or `## Ergebnis: NEEDS_CHANGES`\n\
         Respond in the same language as the user.",
    );
    if let Some(n) = project_name { s.push_str(&format!("\n\n## Project: {n}")); }
    s
}

fn build_accessibility_system_prompt(project_name: Option<&str>) -> String {
    let mut s = String::from(
        "You are an accessibility expert specializing in WCAG 2.1 AA compliance embedded in CodeOS.\n\
         Review for: semantic HTML structure, keyboard navigation and focus management, ARIA roles \
         (only where native HTML is insufficient), color contrast (4.5:1 normal text), screen reader \
         compatibility, form labels and error states, modal/dialog/table/tab patterns.\n\
         Cite specific WCAG success criteria (e.g. 1.3.1, 2.1.1). Prioritize issues that block \
         users with disabilities from completing core tasks.\n\
         End your review with exactly one of: `## Ergebnis: PASS` or `## Ergebnis: NEEDS_CHANGES`\n\
         Respond in the same language as the user.",
    );
    if let Some(n) = project_name { s.push_str(&format!("\n\n## Project: {n}")); }
    s
}

fn build_security_agent_system_prompt(project_name: Option<&str>) -> String {
    let mut s = String::from(
        "You are a strict application security expert embedded in CodeOS. Be strict — flag even \
         potential vulnerabilities. Review for: auth and session management flaws, RBAC and \
         authorization bypasses, XSS/CSRF/SQLi/SSRF vectors, insecure secrets handling, file upload \
         vulnerabilities, missing security headers (CSP, HSTS, X-Frame-Options), multi-tenant data \
         leaks, audit logging gaps.\n\
         Rate findings: Critical (exploitable immediately) | High (likely exploitable) | \
         Medium (specific conditions) | Low (defense-in-depth).\n\
         End your review with exactly one of: `## Ergebnis: PASS` or `## Ergebnis: NEEDS_CHANGES`\n\
         Respond in the same language as the user.",
    );
    if let Some(n) = project_name { s.push_str(&format!("\n\n## Project: {n}")); }
    s
}

fn build_data_system_prompt(project_name: Option<&str>) -> String {
    let mut s = String::from(
        "You are a database and data modeling expert embedded in CodeOS. Review and advise on: \
         schema design and normalization, migration strategies, index selection and query performance, \
         soft vs hard delete patterns, audit trail design, roles/permissions data models, N+1 query \
         risks, and analytics/reporting structures.\n\
         Provide specific SQL or ORM changes where relevant. Consider current correctness and \
         long-term scalability.\n\
         End your review with exactly one of: `## Ergebnis: PASS` or `## Ergebnis: NEEDS_CHANGES`\n\
         Respond in the same language as the user.",
    );
    if let Some(n) = project_name { s.push_str(&format!("\n\n## Project: {n}")); }
    s
}

fn build_api_system_prompt(project_name: Option<&str>) -> String {
    let mut s = String::from(
        "You are an API design and integration specialist embedded in CodeOS. Review and design: \
         REST/GraphQL contracts, request/response shapes and type safety, consistent error codes, \
         pagination/filtering/sorting patterns, idempotency for mutations, webhook design, \
         retry/timeout/backoff strategies, and third-party integration reliability.\n\
         Output concrete API spec snippets where relevant. Flag breaking changes.\n\
         End your review with exactly one of: `## Ergebnis: PASS` or `## Ergebnis: NEEDS_CHANGES`\n\
         Respond in the same language as the user.",
    );
    if let Some(n) = project_name { s.push_str(&format!("\n\n## Project: {n}")); }
    s
}

fn build_performance_system_prompt(project_name: Option<&str>) -> String {
    let mut s = String::from(
        "You are a web performance engineer embedded in CodeOS. Analyze: JS bundle size and code \
         splitting, rendering bottlenecks (unnecessary re-renders, layout thrashing), caching \
         strategies (HTTP/client/CDN), image and asset optimization, lazy loading, DB query N+1 \
         and missing indexes, Core Web Vitals impact (TTFB, LCP, INP, CLS).\n\
         For admin panels: table virtualization, filter performance, export job queuing.\n\
         Be specific with thresholds and measurements.\n\
         End your review with exactly one of: `## Ergebnis: PASS` or `## Ergebnis: NEEDS_CHANGES`\n\
         Respond in the same language as the user.",
    );
    if let Some(n) = project_name { s.push_str(&format!("\n\n## Project: {n}")); }
    s
}

fn build_content_system_prompt(project_name: Option<&str>) -> String {
    let mut s = String::from(
        "You are a UX copywriter and content strategist embedded in CodeOS. Review and improve: \
         button and CTA labels (describe the action, not the mechanism), error messages (explain \
         what happened and what to do), empty state messages (guide toward next action), \
         confirmation dialog text, onboarding instructions, table header and filter label clarity.\n\
         Apply: be direct, concrete, consistent. Avoid jargon. Suggest replacement text inline.\n\
         End your review with exactly one of: `## Ergebnis: PASS` or `## Ergebnis: NEEDS_CHANGES`\n\
         Respond in the same language as the user.",
    );
    if let Some(n) = project_name { s.push_str(&format!("\n\n## Project: {n}")); }
    s
}

fn build_devops_system_prompt(project_name: Option<&str>) -> String {
    let mut s = String::from(
        "You are a DevOps and infrastructure engineer embedded in CodeOS. Review and advise on: \
         CI/CD pipeline design, environment variable management and secrets handling, \
         Docker/containerization, database migration strategies during deployment, rollback \
         procedures, monitoring/alerting/logging setup, backup and restore, preview deployments, \
         and zero-downtime deployment patterns. Be specific about tooling choices.\n\
         End your review with exactly one of: `## Ergebnis: PASS` or `## Ergebnis: NEEDS_CHANGES`\n\
         Respond in the same language as the user.",
    );
    if let Some(n) = project_name { s.push_str(&format!("\n\n## Project: {n}")); }
    s
}

fn build_refactor_system_prompt(project_name: Option<&str>) -> String {
    let mut s = String::from(
        "You are a clean code and refactoring specialist embedded in CodeOS. Identify and fix: \
         duplicated logic, oversized components that should be split, dead code and unused imports, \
         inconsistent naming conventions, premature abstractions, missing abstractions, circular \
         dependencies, and architectural drift.\n\
         Make only targeted, minimal changes. Explain the reasoning for each refactoring.\n\
         End your review with exactly one of: `## Ergebnis: PASS` or `## Ergebnis: NEEDS_CHANGES`\n\
         Respond in the same language as the user.",
    );
    if let Some(n) = project_name { s.push_str(&format!("\n\n## Project: {n}")); }
    s
}

fn build_seo_system_prompt(project_name: Option<&str>) -> String {
    let mut s = String::from(
        "You are an SEO and web visibility specialist embedded in CodeOS. Review: meta tags \
         (title/description/OG/Twitter Card), structured data (Schema.org), heading hierarchy \
         (H1–H6), internal linking structure, URL design, canonical tags, robots.txt/sitemap, \
         crawlability, Core Web Vitals impact on ranking, JS rendering considerations.\n\
         Provide actionable recommendations with expected SEO impact.\n\
         End your review with exactly one of: `## Ergebnis: PASS` or `## Ergebnis: NEEDS_CHANGES`\n\
         Respond in the same language as the user.",
    );
    if let Some(n) = project_name { s.push_str(&format!("\n\n## Project: {n}")); }
    s
}

fn build_conversion_system_prompt(project_name: Option<&str>) -> String {
    let mut s = String::from(
        "You are a conversion rate optimization (CRO) specialist embedded in CodeOS. Analyze: \
         hero section clarity and value proposition, primary CTA placement and copy, trust signals \
         (testimonials, logos, security badges), pricing page design and plan differentiation, \
         form friction and length, funnel drop-off points, mobile conversion experience.\n\
         Suggest specific A/B test hypotheses with expected impact.\n\
         End your review with exactly one of: `## Ergebnis: PASS` or `## Ergebnis: NEEDS_CHANGES`\n\
         Respond in the same language as the user.",
    );
    if let Some(n) = project_name { s.push_str(&format!("\n\n## Project: {n}")); }
    s
}

fn build_rbac_system_prompt(project_name: Option<&str>) -> String {
    let mut s = String::from(
        "You are a permissions and access control specialist embedded in CodeOS. Review: role \
         definitions and permission granularity, field-level permissions, route-level authorization \
         checks, bulk action authorization, impersonation and delegation flows, permission \
         inheritance and conflicts, audit trail completeness, multi-tenant isolation, and what \
         users see vs what they can do. Apply the principle of least privilege.\n\
         Flag any authorization bypass risks as Critical.\n\
         End your review with exactly one of: `## Ergebnis: PASS` or `## Ergebnis: NEEDS_CHANGES`\n\
         Respond in the same language as the user.",
    );
    if let Some(n) = project_name { s.push_str(&format!("\n\n## Project: {n}")); }
    s
}

fn build_table_workflow_system_prompt(project_name: Option<&str>) -> String {
    let mut s = String::from(
        "You are a data table and workflow UI specialist embedded in CodeOS. Review and design: \
         table column selection and default ordering, filtering/search UX, multi-sort behavior, \
         saved views/presets, pagination vs infinite scroll, bulk selection and bulk actions, \
         row-level status management and transitions, detail panel/drawer patterns, inline editing, \
         CSV/Excel export. Focus on performance with large datasets and multi-step workflows.\n\
         End your review with exactly one of: `## Ergebnis: PASS` or `## Ergebnis: NEEDS_CHANGES`\n\
         Respond in the same language as the user.",
    );
    if let Some(n) = project_name { s.push_str(&format!("\n\n## Project: {n}")); }
    s
}

fn build_forms_system_prompt(project_name: Option<&str>) -> String {
    let mut s = String::from(
        "You are a forms and data entry specialist embedded in CodeOS. Review: form structure and \
         logical field grouping, real-time vs on-submit validation, field-level error messages, \
         autosave behavior and dirty state indicators, dependent field logic, multi-step form \
         navigation, undo/redo and confirm-before-leave patterns, loading/success/error state \
         handling, form layout across screen sizes.\n\
         End your review with exactly one of: `## Ergebnis: PASS` or `## Ergebnis: NEEDS_CHANGES`\n\
         Respond in the same language as the user.",
    );
    if let Some(n) = project_name { s.push_str(&format!("\n\n## Project: {n}")); }
    s
}

fn reviewer_system_prompt(reviewer_id: &str, project_name: Option<&str>) -> String {
    match reviewer_id {
        "ux"             => build_ux_system_prompt(project_name),
        "accessibility"  => build_accessibility_system_prompt(project_name),
        "security"       => build_security_agent_system_prompt(project_name),
        "data"           => build_data_system_prompt(project_name),
        "api"            => build_api_system_prompt(project_name),
        "performance"    => build_performance_system_prompt(project_name),
        "content"        => build_content_system_prompt(project_name),
        "devops"         => build_devops_system_prompt(project_name),
        "refactor"       => build_refactor_system_prompt(project_name),
        "seo"            => build_seo_system_prompt(project_name),
        "conversion"     => build_conversion_system_prompt(project_name),
        "rbac"           => build_rbac_system_prompt(project_name),
        "table_workflow" => build_table_workflow_system_prompt(project_name),
        "forms"          => build_forms_system_prompt(project_name),
        _                => build_test_system_prompt(project_name), // default: test
    }
}

fn reviewer_display_name(id: &str) -> &'static str {
    match id {
        "test"           => "Test Agent",
        "ux"             => "UX/Product Agent",
        "accessibility"  => "Accessibility Agent",
        "security"       => "Security Agent",
        "data"           => "Data/DB Agent",
        "api"            => "API Agent",
        "performance"    => "Performance Agent",
        "content"        => "Content Agent",
        "devops"         => "DevOps Agent",
        "refactor"       => "Refactor Agent",
        "seo"            => "SEO Agent",
        "conversion"     => "Conversion Agent",
        "rbac"           => "RBAC Agent",
        "table_workflow" => "Table/Workflow Agent",
        "forms"          => "Forms Agent",
        _                => "Reviewer",
    }
}

// ── Pipeline helpers ──────────────────────────────────────────────────────────

fn emit_pipeline_phase(app: &AppHandle, sid: &str, id: &str, name: &str, status: &str, text: &str) {
    app.emit(&format!("pipeline-phase-{sid}"), serde_json::json!({
        "id": id, "name": name, "status": status, "text": text
    })).ok();
}

async fn call_claude_simple(
    client: &reqwest::Client,
    api_key: &str,
    model: &str,
    system: &str,
    user_message: &str,
    app: &AppHandle,
    chunk_event: Option<String>,
) -> Result<String, String> {
    let body = serde_json::json!({
        "model": model,
        "max_tokens": 8192,
        "system": system,
        "messages": [{ "role": "user", "content": user_message }],
        "stream": true
    });

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send().await.map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        let t = resp.text().await.unwrap_or_default();
        return Err(format!("API error: {}", t));
    }

    let result = drain_stream(resp, app, chunk_event.as_deref()).await?;
    Ok(result.text_blocks.join(""))
}

// ── Agent Pipeline command ────────────────────────────────────────────────────

#[tauri::command]
pub async fn run_agent_pipeline(
    app: AppHandle,
    task: String,
    project_path: Option<String>,
    project_id: Option<String>,
    project_name: Option<String>,
    model: String,
    pipeline_mode: String,   // "fast" | "standard" | "critical"
    reviewers: Vec<String>,  // used in "standard" mode
    stream_id: String,
    logs: State<'_, LogStore>,
) -> Result<(), String> {
    let api_key = config::load_claude_api_key()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Claude API key not configured.".to_string())?;

    let model = match model.as_str() {
        "claude-sonnet-4-6" | "claude-opus-4-6" | "claude-haiku-4-5-20251001" => model,
        _ => "claude-sonnet-4-6".to_string(),
    };

    let selected_reviewers: Vec<String> = match pipeline_mode.as_str() {
        "fast"     => vec!["test".into()],
        "critical" => vec![
            "test".into(), "security".into(), "ux".into(),
            "accessibility".into(), "performance".into(),
            "data".into(), "api".into(), "rbac".into(),
        ],
        _ => reviewers, // standard: use what was passed
    };

    let client = reqwest::Client::new();
    logs.push(LogLevel::Info,
        format!("Pipeline start — mode: {}, task: {:.60}", pipeline_mode, task),
        "pipeline");

    // ── Phase 1: Planner ──────────────────────────────────────────
    emit_pipeline_phase(&app, &stream_id, "planner", "Planer & Architekt", "running", "");
    let planner_system = build_planning_system_prompt(project_name.as_deref());
    let plan_text = call_claude_simple(
        &client, &api_key, &model, &planner_system, &task,
        &app, Some(format!("pipeline-chunk-{}", stream_id)),
    ).await.unwrap_or_else(|e| format!("[Planner error: {}]", e));
    emit_pipeline_phase(&app, &stream_id, "planner", "Planer & Architekt", "done", &plan_text);

    // ── Phase 2: Code Agent (with tool use) ───────────────────────
    emit_pipeline_phase(&app, &stream_id, "code", "Code Agent", "running", "");

    let enable_tools = project_path.is_some();
    let code_system = build_system_prompt(project_path.as_deref(), project_name.as_deref(), enable_tools);
    let code_prompt = format!(
        "## Architecture Plan\n{plan_text}\n\n## Task\n{task}\n\nBitte setze den Plan um.",
    );

    let mut conversation: Vec<serde_json::Value> = vec![
        serde_json::json!({ "role": "user", "content": code_prompt })
    ];

    let mut code_output = String::new();
    const MAX_ROUNDS: usize = 10;

    for round in 0..MAX_ROUNDS {
        let mut body = serde_json::json!({
            "model": model,
            "max_tokens": 8192,
            "system": code_system,
            "messages": conversation,
            "stream": true
        });
        if enable_tools {
            body["tools"] = serde_json::json!([
                bash_tool_definition(),
                save_credential_tool_definition(),
            ]);
        }

        let resp = client.post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body).send().await.map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            let t = resp.text().await.unwrap_or_default();
            emit_pipeline_phase(&app, &stream_id, "code", "Code Agent", "error", &t);
            break;
        }

        let chunk_ev = format!("pipeline-chunk-{}", stream_id);
        let result = drain_stream(resp, &app, Some(&chunk_ev)).await?;

        for text in &result.text_blocks { code_output.push_str(text); }

        let mut assistant_content: Vec<serde_json::Value> = Vec::new();
        for text in &result.text_blocks {
            assistant_content.push(serde_json::json!({ "type": "text", "text": text }));
        }
        for (id, name, input_json) in &result.tool_use_blocks {
            let input: serde_json::Value = serde_json::from_str(input_json).unwrap_or_default();
            assistant_content.push(serde_json::json!({ "type": "tool_use", "id": id, "name": name, "input": input }));
        }
        conversation.push(serde_json::json!({ "role": "assistant", "content": assistant_content }));

        if result.stop_reason == "tool_use" && !result.tool_use_blocks.is_empty() {
            let mut tool_results: Vec<serde_json::Value> = Vec::new();
            for (call_id, tool_name, input_json) in &result.tool_use_blocks {
                let input: serde_json::Value = serde_json::from_str(input_json).unwrap_or_default();
                match tool_name.as_str() {
                    "bash" => {
                        let command = input.get("command").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        app.emit(&format!("pipeline-tool-call-{}", stream_id), serde_json::json!({
                            "call_id": call_id, "command": command, "round": round, "phase": "code"
                        })).ok();
                        let exec_result = if let Some(p) = &project_path {
                            execute_in_dir(p, &command)
                        } else {
                            crate::models::CommandOutput {
                                stdout: String::new(), stderr: "No project dir".into(),
                                exit_code: 1, duration_ms: 0, command: command.clone(),
                            }
                        };
                        if let Some(pid) = &project_id {
                            let _ = write_project_log(pid, if exec_result.exit_code == 0 { "success" } else { "error" },
                                &format!("$ {}\n{}", command, exec_result.stdout.trim()), "pipeline");
                        }
                        app.emit(&format!("pipeline-tool-result-{}", stream_id), serde_json::json!({
                            "call_id": call_id, "stdout": exec_result.stdout,
                            "stderr": exec_result.stderr, "exit_code": exec_result.exit_code,
                            "duration_ms": exec_result.duration_ms, "phase": "code"
                        })).ok();
                        tool_results.push(serde_json::json!({
                            "type": "tool_result", "tool_use_id": call_id,
                            "content": format!("exit: {}\n{}\n{}", exec_result.exit_code,
                                exec_result.stdout.trim(), exec_result.stderr.trim())
                        }));
                    }
                    "save_credential" => {
                        let label = input.get("label").and_then(|v| v.as_str()).unwrap_or("Unbekannt").to_string();
                        let category = input.get("category").and_then(|v| v.as_str()).unwrap_or("note").to_string();
                        let fields: Vec<crate::models::CredentialField> = input.get("fields")
                            .and_then(|v| v.as_array())
                            .map(|arr| arr.iter().filter_map(|f| {
                                Some(crate::models::CredentialField {
                                    key: f.get("key").and_then(|v| v.as_str())?.to_string(),
                                    value: f.get("value").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                    secret: f.get("secret").and_then(|v| v.as_bool()).unwrap_or(false),
                                })
                            }).collect())
                            .unwrap_or_default();
                        let entry = CredentialEntry {
                            id: uuid::Uuid::new_v4().to_string(),
                            label: label.clone(), category, fields,
                            created_at: chrono::Local::now().to_rfc3339(),
                        };
                        let msg = if let Some(pid) = &project_id {
                            match upsert_credential(pid.clone(), entry, logs.clone()).await {
                                Ok(_) => { app.emit("credential-saved", serde_json::json!({ "project_id": pid })).ok(); format!("Saved: {label}") }
                                Err(e) => format!("Error: {e}"),
                            }
                        } else { "No project selected".to_string() };
                        tool_results.push(serde_json::json!({ "type": "tool_result", "tool_use_id": call_id, "content": msg }));
                    }
                    _ => { tool_results.push(serde_json::json!({ "type": "tool_result", "tool_use_id": call_id, "content": "unknown tool" })); }
                }
            }
            conversation.push(serde_json::json!({ "role": "user", "content": tool_results }));
            continue;
        }
        break;
    }

    emit_pipeline_phase(&app, &stream_id, "code", "Code Agent", "done", &code_output);

    // ── Phase 3: Reviewers ────────────────────────────────────────
    let mut has_issues = false;
    let mut issues_text = String::new();

    for reviewer_id in &selected_reviewers {
        let display = reviewer_display_name(reviewer_id);
        emit_pipeline_phase(&app, &stream_id, reviewer_id, display, "running", "");

        let rev_system = reviewer_system_prompt(reviewer_id, project_name.as_deref());
        let rev_prompt = format!(
            "## Original Task\n{task}\n\n## Architecture Plan\n{plan_text}\n\n\
             ## Code Agent Output\n{code_output}\n\nBitte reviewe das aus deiner Perspektive.",
        );
        let chunk_ev = format!("pipeline-chunk-{}", stream_id);
        let review = call_claude_simple(
            &client, &api_key, &model, &rev_system, &rev_prompt,
            &app, Some(chunk_ev),
        ).await.unwrap_or_else(|e| format!("[Reviewer error: {}]", e));

        let needs_fix = review.contains("NEEDS_CHANGES") || review.contains("blocked");
        if needs_fix {
            has_issues = true;
            issues_text.push_str(&format!("\n\n## Findings from {display}\n{review}"));
        }

        let status = if needs_fix { "needs_changes" } else { "pass" };
        emit_pipeline_phase(&app, &stream_id, reviewer_id, display, status, &review);
    }

    // ── Phase 4: Fix Agent (if needed) ───────────────────────────
    if has_issues {
        emit_pipeline_phase(&app, &stream_id, "fix", "Fix Agent", "running", "");
        let fix_system = build_system_prompt(project_path.as_deref(), project_name.as_deref(), enable_tools);
        let fix_prompt = format!(
            "## Original Task\n{task}\n\n## Reviewer Findings\n{issues_text}\n\n\
             Bitte behebe alle aufgezeigten Probleme minimal und zielgerichtet.",
        );
        let chunk_ev = format!("pipeline-chunk-{}", stream_id);
        let fix_output = call_claude_simple(
            &client, &api_key, &model, &fix_system, &fix_prompt,
            &app, Some(chunk_ev),
        ).await.unwrap_or_else(|e| format!("[Fix error: {}]", e));
        emit_pipeline_phase(&app, &stream_id, "fix", "Fix Agent", "done", &fix_output);
    }

    // ── Done ──────────────────────────────────────────────────────
    let final_status = if has_issues { "fixed" } else { "done" };
    app.emit(&format!("pipeline-done-{}", stream_id), serde_json::json!({
        "status": final_status,
        "phases": 2 + selected_reviewers.len() + if has_issues { 1 } else { 0 }
    })).ok();

    logs.push(LogLevel::Success,
        format!("Pipeline done — status: {final_status}, reviewers: {}", selected_reviewers.len()),
        "pipeline");
    Ok(())
}

// ── Screenshot capture ────────────────────────────────────────────────────────

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

    let bytes = std::fs::read(&path).map_err(|e| format!("Could not read screenshot file: {}", e))?;
    let _ = std::fs::remove_file(&path);

    Ok(general_purpose::STANDARD.encode(&bytes))
}

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

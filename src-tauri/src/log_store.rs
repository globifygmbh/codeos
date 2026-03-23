use std::sync::Mutex;

use crate::models::{LogEntry, LogLevel};

/// In-memory circular log buffer, shared via Tauri state.
pub struct LogStore(pub Mutex<Vec<LogEntry>>);

impl LogStore {
    pub fn new() -> Self {
        LogStore(Mutex::new(Vec::with_capacity(512)))
    }

    pub fn push(&self, level: LogLevel, message: impl Into<String>, source: impl Into<String>) {
        if let Ok(mut buf) = self.0.lock() {
            buf.push(LogEntry::new(level, message, source));
            // Keep the last 500 entries to avoid unbounded growth.
            if buf.len() > 500 {
                let drain_count = buf.len() - 500;
                buf.drain(..drain_count);
            }
        }
    }

    pub fn entries(&self) -> Vec<LogEntry> {
        self.0
            .lock()
            .map(|buf| buf.clone())
            .unwrap_or_default()
    }

    pub fn clear(&self) {
        if let Ok(mut buf) = self.0.lock() {
            buf.clear();
        }
    }
}

/// Convenience macros that operate on the store directly.
#[macro_export]
macro_rules! log_info {
    ($store:expr, $source:expr, $msg:expr) => {
        $store.push($crate::models::LogLevel::Info, $msg, $source)
    };
}

#[macro_export]
macro_rules! log_warn {
    ($store:expr, $source:expr, $msg:expr) => {
        $store.push($crate::models::LogLevel::Warn, $msg, $source)
    };
}

#[macro_export]
macro_rules! log_error {
    ($store:expr, $source:expr, $msg:expr) => {
        $store.push($crate::models::LogLevel::Error, $msg, $source)
    };
}

#[macro_export]
macro_rules! log_success {
    ($store:expr, $source:expr, $msg:expr) => {
        $store.push($crate::models::LogLevel::Success, $msg, $source)
    };
}

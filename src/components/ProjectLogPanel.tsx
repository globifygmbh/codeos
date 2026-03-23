import { invoke } from "@tauri-apps/api/core";
import {
  Bot,
  FileText,
  RefreshCw,
  Trash2,
  Terminal,
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "../stores/store";
import type { Project, ProjectLogEntry } from "../types";

interface Props {
  project: Project;
}

function levelColor(level: string) {
  switch (level) {
    case "error":   return "text-accent-red";
    case "warn":    return "text-accent-yellow";
    case "success": return "text-accent-green";
    case "debug":   return "text-[var(--text-muted)]";
    default:        return "text-[var(--text-secondary)]";
  }
}

function levelBg(level: string) {
  switch (level) {
    case "error":   return "bg-accent-red/8";
    case "warn":    return "bg-accent-yellow/8";
    case "success": return "bg-accent-green/8";
    default:        return "";
  }
}

function LevelIcon({ level }: { level: string }) {
  const cls = `shrink-0 ${levelColor(level)}`;
  switch (level) {
    case "error":   return <AlertCircle size={11} className={cls} />;
    case "warn":    return <AlertTriangle size={11} className={cls} />;
    case "success": return <CheckCircle size={11} className={cls} />;
    default:        return <Info size={11} className={cls} />;
  }
}

function formatTs(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts.slice(11, 19);
  }
}

export default function ProjectLogPanel({ project }: Props) {
  const [entries, setEntries] = useState<ProjectLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const result = await invoke<ProjectLogEntry[]>("get_project_log", { projectId: project.id });
      setEntries(result);
    } catch (e) {
      useStore.getState().setGlobalError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    try {
      await invoke("clear_project_log", { projectId: project.id });
      setEntries([]);
    } catch (e) {
      useStore.getState().setGlobalError(String(e));
    }
  }

  async function handleSendToAgent() {
    if (entries.length === 0) return;
    setSending(true);
    try {
      const errors = entries.filter((e) => e.level === "error" || e.level === "warn");
      const toSend = errors.length > 0 ? errors : entries.slice(-30);
      const logText = toSend
        .map((e) => `[${formatTs(e.timestamp)}] [${e.level.toUpperCase()}] (${e.source}) ${e.message}`)
        .join("\n");

      const hasErrors = errors.length > 0;
      const message = hasErrors
        ? `Hier sind die Fehler aus den Logs von "${project.name}". Bitte analysiere sie und behebe die Probleme:\n\n\`\`\`\n${logText}\n\`\`\``
        : `Hier sind die letzten Logs von "${project.name}". Gibt es etwas zu verbessern?\n\n\`\`\`\n${logText}\n\`\`\``;

      await useStore.getState().sendLogsToAgent(project.id, message);
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    load();
  }, [project.id]);

  const filtered = filter === "all"
    ? entries
    : entries.filter((e) => e.level === filter);

  const errorCount = entries.filter((e) => e.level === "error").length;
  const warnCount  = entries.filter((e) => e.level === "warn").length;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={13} className="text-[var(--text-muted)]" />
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {entries.length} Einträge
          </span>
          {errorCount > 0 && (
            <span className="rounded bg-accent-red/12 px-1.5 py-0.5 text-[10px] text-accent-red">
              {errorCount} Error{errorCount > 1 ? "s" : ""}
            </span>
          )}
          {warnCount > 0 && (
            <span className="rounded bg-accent-yellow/12 px-1.5 py-0.5 text-[10px] text-accent-yellow">
              {warnCount} Warn{warnCount > 1 ? "ings" : "ing"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={load}
            disabled={loading}
            title="Logs aktualisieren"
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-secondary)]"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleClear}
            disabled={entries.length === 0}
            title="Logs löschen"
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-accent-red disabled:opacity-30"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1">
        {["all", "error", "warn", "success", "info"].map((lvl) => {
          const count = lvl === "all" ? entries.length : entries.filter((e) => e.level === lvl).length;
          return (
            <button
              key={lvl}
              onClick={() => setFilter(lvl)}
              className={`rounded px-2 py-0.5 text-[10px] capitalize transition ${
                filter === lvl
                  ? "bg-[var(--surface-3)] font-medium text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {lvl} {count > 0 && <span className="opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Log entries */}
      <div className="max-h-56 overflow-y-auto rounded-lg border"
        style={{ borderColor: "var(--border-color)", background: "var(--surface-2)" }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Terminal size={18} className="mb-2 text-[var(--text-muted)]" />
            <p className="text-xs text-[var(--text-muted)]">
              {entries.length === 0 ? "Noch keine Logs vorhanden" : "Keine Einträge für diesen Filter"}
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border-color)" }}>
            {[...filtered].reverse().map((entry, i) => (
              <div
                key={i}
                className={`px-3 py-2 ${levelBg(entry.level)}`}
              >
                <div className="flex items-start gap-2">
                  <LevelIcon level={entry.level} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-[10px] text-[var(--text-muted)]">
                        {formatTs(entry.timestamp)}
                      </span>
                      <span className="rounded bg-[var(--surface-3)] px-1 py-0 text-[9px] text-[var(--text-muted)]">
                        {entry.source}
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap break-all text-[11px] leading-relaxed text-[var(--text-primary)] font-mono">
                      {entry.message}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Send to Agent button */}
      <button
        onClick={handleSendToAgent}
        disabled={entries.length === 0 || sending}
        className="flex items-center justify-center gap-2 rounded-lg bg-accent-purple/12 px-3 py-2 text-xs text-accent-purple transition hover:bg-accent-purple/20 disabled:opacity-40"
      >
        <Bot size={13} />
        {sending
          ? "Wird gesendet…"
          : errorCount > 0
          ? `${errorCount} Fehler an Claude senden & beheben lassen`
          : "Logs an Claude senden"}
      </button>
    </div>
  );
}

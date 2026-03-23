import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "../stores/store";
import type { LogEntry, LogLevel } from "../types";

const LEVEL_STYLES: Record<LogLevel, { dot: string; text: string; bg: string }> = {
  info:    { dot: "bg-gray-500",         text: "text-gray-400",        bg: "bg-gray-500/10" },
  warn:    { dot: "bg-accent-yellow",    text: "text-accent-yellow",   bg: "bg-yellow-500/10" },
  error:   { dot: "bg-accent-red",       text: "text-accent-red",      bg: "bg-red-500/10" },
  success: { dot: "bg-accent-green",     text: "text-accent-green",    bg: "bg-green-500/10" },
  debug:   { dot: "bg-gray-700",         text: "text-gray-600",        bg: "" },
};

function LogRow({ entry }: { entry: LogEntry }) {
  const styles = LEVEL_STYLES[entry.level] ?? LEVEL_STYLES.info;
  return (
    <div className={`flex items-start gap-3 border-b border-white/5 px-4 py-2.5 ${styles.bg}`}>
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${styles.dot}`} />
      <div className="min-w-0 flex-1">
        <p className={`log-output break-words ${styles.text}`}>{entry.message}</p>
        <p className="mt-0.5 text-[10px] text-gray-600">
          <span className="uppercase tracking-wider">{entry.source}</span>
          {" · "}
          {new Date(entry.timestamp).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

export default function LogViewer() {
  const { logs, loadLogs, clearLogs } = useStore();
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [search, setSearch] = useState("");
  const [apacheLog, setApacheLog] = useState<string | null>(null);
  const [loadingApache, setLoadingApache] = useState(false);

  useEffect(() => {
    loadLogs();
  }, []);

  const filtered = logs
    .filter((l) => filter === "all" || l.level === filter)
    .filter(
      (l) =>
        search === "" ||
        l.message.toLowerCase().includes(search.toLowerCase()) ||
        l.source.toLowerCase().includes(search.toLowerCase())
    )
    .slice()
    .reverse(); // newest first

  async function loadApacheLog() {
    setLoadingApache(true);
    try {
      const text = await invoke<string>("get_apache_error_log", { lines: 200 });
      setApacheLog(text);
    } catch (e) {
      setApacheLog("Error: " + String(e));
    } finally {
      setLoadingApache(false);
    }
  }

  return (
    <div className="view-enter flex h-full flex-col p-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-white">Logs</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={loadLogs}
            className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/8 hover:text-gray-200"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
          <button
            onClick={clearLogs}
            className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-gray-400 hover:bg-accent-red/10 hover:text-accent-red"
          >
            <Trash2 size={12} />
            Clear
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter logs…"
          className="rounded-lg border border-white/10 bg-surface-1 px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
        />
        {(["all", "info", "success", "warn", "error", "debug"] as const).map((lvl) => (
          <button
            key={lvl}
            onClick={() => setFilter(lvl)}
            className={`rounded-lg px-3 py-1.5 text-xs capitalize transition ${
              filter === lvl
                ? "bg-accent-blue/15 text-accent-blue"
                : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200"
            }`}
          >
            {lvl}
          </button>
        ))}
      </div>

      {/* App logs */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-white/5 bg-surface-1">
        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-600">No log entries to show.</p>
        ) : (
          filtered.map((entry) => <LogRow key={entry.id} entry={entry} />)
        )}
      </div>

      {/* Apache log section */}
      <div className="mt-4">
        <button
          onClick={loadApacheLog}
          disabled={loadingApache}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 disabled:opacity-40"
        >
          <RefreshCw size={11} className={loadingApache ? "animate-spin" : ""} />
          Load Apache error log (last 200 lines)
        </button>
        {apacheLog && (
          <pre className="log-output mt-3 max-h-64 overflow-y-auto rounded-xl border border-white/5 bg-surface-1 p-4 text-gray-400 whitespace-pre-wrap">
            {apacheLog}
          </pre>
        )}
      </div>
    </div>
  );
}

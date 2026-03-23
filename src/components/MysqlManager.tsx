import { invoke } from "@tauri-apps/api/core";
import { open as openSaveDialog } from "@tauri-apps/plugin-dialog";
import {
  Database,
  Download,
  Loader,
  Play,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../stores/store";
import type { MysqlConfig, QueryResult } from "../types";

// ── Connection config panel ───────────────────────────────────────────────────

function ConnectionConfig({
  projectId,
  existing,
  onSaved,
}: {
  projectId: string;
  existing: MysqlConfig | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<MysqlConfig>(
    existing ?? { host: "127.0.0.1", port: 3306, user: "root", database: "" }
  );
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    try {
      await invoke("save_mysql_config", {
        projectId,
        mysqlCfg: form,
        password: password || null,
      });
      onSaved();
    } catch (e) {
      setTestResult("Save failed: " + String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    // Save first so the test uses the latest values.
    try {
      await invoke("save_mysql_config", { projectId, mysqlCfg: form, password: password || null });
      const version = await invoke<string>("mysql_test_connection", { projectId });
      setTestResult("✓ Connected — MySQL " + version);
    } catch (e) {
      setTestResult("✕ " + String(e));
    } finally {
      setTesting(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent-blue/50";
  const inputStyle = { background: "var(--surface-2)", borderColor: "var(--border-color)", color: "var(--text-primary)" };

  return (
    <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">MySQL Connection</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--text-secondary)]">Host</label>
          <input type="text" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} className={inputCls} style={inputStyle} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--text-secondary)]">Port</label>
          <input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) })} className={inputCls} style={inputStyle} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--text-secondary)]">User</label>
          <input type="text" value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} className={inputCls} style={inputStyle} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-[var(--text-secondary)]">Password (Keychain)</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to keep existing" className={inputCls} style={inputStyle} />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs text-[var(--text-secondary)]">Database</label>
          <input type="text" value={form.database} onChange={(e) => setForm({ ...form, database: e.target.value })} className={inputCls} style={inputStyle} placeholder="my_database" />
        </div>
      </div>
      {testResult && (
        <p className={`text-xs rounded-lg px-3 py-2 ${testResult.startsWith("✓") ? "text-accent-green bg-accent-green/10" : "text-accent-red bg-accent-red/10"}`}>
          {testResult}
        </p>
      )}
      <div className="flex gap-2">
        <button onClick={handleTest} disabled={testing} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-2)] disabled:opacity-40" style={{ borderColor: "var(--border-color)" }}>
          {testing ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Test
        </button>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent-blue px-3 py-1.5 text-sm text-white hover:bg-accent-blue/80 disabled:opacity-40">
          {saving ? <Loader size={13} className="animate-spin" /> : null}
          Save
        </button>
      </div>
    </div>
  );
}

// ── Query results table ───────────────────────────────────────────────────────

function ResultTable({ result }: { result: QueryResult }) {
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border-color)" }}>
      <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
        <span className="text-xs text-[var(--text-muted)]">{result.row_count} row{result.row_count !== 1 ? "s" : ""}</span>
      </div>
      {result.columns.length > 0 ? (
        <table className="w-full text-xs" style={{ background: "var(--surface-1)" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-color)", background: "var(--surface-2)" }}>
              {result.columns.map((col) => (
                <th key={col} className="px-3 py-2 text-left font-medium text-[var(--text-secondary)]">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, ri) => (
              <tr key={ri} className="transition hover:bg-[var(--surface-2)]"
                style={{ borderBottom: "1px solid var(--border-color)" }}>
                {row.map((cell, ci) => (
                  <td key={ci} className="max-w-xs truncate px-3 py-2 font-mono text-[var(--text-primary)]"
                    title={cell}>
                    {cell === "NULL" ? <span className="text-[var(--text-muted)] italic">NULL</span> : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="py-4 text-center text-xs text-[var(--text-muted)]">Query executed — no rows returned.</p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MysqlManager() {
  const { projects, mysqlProjectId, setMysqlProject } = useStore();

  const [query, setQuery] = useState("SELECT * FROM ");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [mysqlCfg, setMysqlCfg] = useState<MysqlConfig | null>(null);

  const selectedProject = projects.find((p) => p.id === mysqlProjectId) ?? null;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!mysqlProjectId) return;
    invoke<MysqlConfig | null>("get_mysql_config", { projectId: mysqlProjectId })
      .then(setMysqlCfg)
      .catch(() => {});
  }, [mysqlProjectId]);

  async function loadTables() {
    if (!mysqlProjectId) return;
    setLoading(true);
    try {
      const t = await invoke<string[]>("mysql_list_tables", { projectId: mysqlProjectId });
      setTables(t);
    } catch (_) {}
    finally { setLoading(false); }
  }

  async function runQuery() {
    if (!mysqlProjectId || !query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const r = await invoke<QueryResult>("mysql_run_query", { projectId: mysqlProjectId, query: query.trim() });
      setResult(r);
      // Refresh tables after schema-changing queries.
      if (/^\s*(CREATE|DROP|ALTER|RENAME)/i.test(query)) loadTables();
    } catch (e) {
      setError(String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function exportDb() {
    if (!mysqlProjectId) return;
    setExporting(true);
    try {
      const path = await openSaveDialog({
        defaultPath: `${mysqlCfg?.database ?? "dump"}.sql`,
        filters: [{ name: "SQL", extensions: ["sql"] }],
      });
      if (!path || typeof path !== "string") return;
      await invoke("mysql_export_to_file", { projectId: mysqlProjectId, filePath: path });
    } catch (e) {
      setError("Export failed: " + String(e));
    } finally {
      setExporting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); runQuery(); }
  }

  const inputStyle = { background: "var(--surface-2)", borderColor: "var(--border-color)", color: "var(--text-primary)" };

  return (
    <div className="view-enter flex h-full flex-col p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">MySQL Manager</h1>
        <div className="flex-1" />
        {mysqlProjectId && (
          <>
            <button onClick={() => setShowConfig((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
              style={{ borderColor: "var(--border-color)" }}>
              <Settings2 size={14} />
              Configure
            </button>
            <button onClick={exportDb} disabled={exporting}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-2)] disabled:opacity-40"
              style={{ borderColor: "var(--border-color)" }}>
              {exporting ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
              Export SQL
            </button>
          </>
        )}
      </div>

      {/* Project selector */}
      <div className="flex items-center gap-3">
        <Database size={15} className="text-[var(--text-muted)]" />
        <select value={mysqlProjectId ?? ""} onChange={(e) => { setMysqlProject(e.target.value || null); setResult(null); setTables([]); }}
          className="rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
          style={inputStyle}>
          <option value="">Select project…</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {mysqlProjectId && mysqlCfg && (
          <span className="text-xs text-[var(--text-muted)]">
            {mysqlCfg.user}@{mysqlCfg.host}:{mysqlCfg.port}/{mysqlCfg.database || "—"}
          </span>
        )}
        {mysqlProjectId && (
          <button onClick={loadTables} disabled={loading}
            className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
            Tables
          </button>
        )}
      </div>

      {/* Config panel */}
      {showConfig && mysqlProjectId && (
        <ConnectionConfig
          projectId={mysqlProjectId}
          existing={mysqlCfg}
          onSaved={() => {
            setShowConfig(false);
            invoke<MysqlConfig | null>("get_mysql_config", { projectId: mysqlProjectId }).then(setMysqlCfg);
            loadTables();
          }}
        />
      )}

      {!mysqlProjectId && (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed py-16 text-center"
          style={{ borderColor: "var(--border-color)" }}>
          <Database size={28} className="mb-3 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-secondary)]">Select a project to manage its MySQL database.</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Each project has its own connection config.</p>
        </div>
      )}

      {mysqlProjectId && (
        <div className="flex flex-1 gap-4 overflow-hidden">
          {/* Table list sidebar */}
          {tables.length > 0 && (
            <div className="w-44 shrink-0 overflow-y-auto rounded-xl border"
              style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
              <p className="border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
                style={{ borderColor: "var(--border-color)" }}>
                Tables ({tables.length})
              </p>
              {tables.map((t) => (
                <button key={t} onClick={() => setQuery(`SELECT * FROM \`${t}\` LIMIT 100;`)}
                  className="w-full border-b px-3 py-2 text-left text-xs font-mono text-[var(--text-primary)] transition hover:bg-[var(--surface-2)] last:border-0"
                  style={{ borderColor: "var(--border-color)" }}>
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* Query panel */}
          <div className="flex flex-1 flex-col gap-4 overflow-hidden">
            {/* Editor */}
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border-color)" }}>
              <div className="flex items-center justify-between border-b px-3 py-2"
                style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
                <span className="text-xs text-[var(--text-muted)]">SQL Editor</span>
                <span className="text-[10px] text-[var(--text-muted)]">⌘↵ to run</span>
              </div>
              <textarea
                ref={textareaRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={5}
                spellCheck={false}
                className="w-full p-3 text-sm log-output focus:outline-none"
                style={{ background: "var(--surface-2)", color: "var(--text-primary)", resize: "vertical" }}
              />
            </div>

            <div className="flex items-center gap-2">
              <button onClick={runQuery} disabled={loading || !query.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-accent-blue px-4 py-2 text-sm text-white hover:bg-accent-blue/80 disabled:opacity-40">
                {loading ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
                Run Query
              </button>
              <button onClick={() => { setQuery(""); setResult(null); setError(null); }}
                className="rounded-lg border px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-2)]"
                style={{ borderColor: "var(--border-color)" }}>
                Clear
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-accent-red/30 bg-accent-red/10 px-4 py-3 text-sm text-accent-red log-output">
                {error}
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="flex-1 overflow-auto">
                <ResultTable result={result} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

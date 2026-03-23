import { invoke } from "@tauri-apps/api/core";
import { Eye, EyeOff, FolderOpen, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "../stores/store";
import type { AppConfigUpdate } from "../types";

const BROWSERS = [
  { value: "",               label: "Default (System)" },
  { value: "Safari",        label: "Safari" },
  { value: "Google Chrome", label: "Google Chrome" },
  { value: "Firefox",       label: "Firefox" },
  { value: "Brave Browser", label: "Brave Browser" },
  { value: "Arc",           label: "Arc" },
  { value: "Microsoft Edge",label: "Microsoft Edge" },
];

const inputCls =
  "w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent-blue/60";
const inputStyle = {
  background: "var(--surface-2)",
  borderColor: "var(--border-color)",
  color: "var(--text-primary)",
};

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="w-44 shrink-0 text-xs text-[var(--text-secondary)]">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export default function Settings() {
  const { config, updateConfig, loadConfig } = useStore();

  const [form, setForm] = useState<AppConfigUpdate>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // GitHub token
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [tokenMsg, setTokenMsg] = useState<string | null>(null);

  // Claude API key
  const [claudeKeyInput, setClaudeKeyInput] = useState("");
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [hasClaudeKey, setHasClaudeKey] = useState(false);
  const [claudeKeyMsg, setClaudeKeyMsg] = useState<string | null>(null);

  // Misc
  const [configDir, setConfigDir] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setForm({
        apache_service_name:        config.apache_service_name,
        mysql_service_name:         config.mysql_service_name,
        php_service_name:           config.php_service_name ?? "",
        auto_check_git_updates:     config.auto_check_git_updates,
        git_check_interval_minutes: config.git_check_interval_minutes,
        log_level:                  config.log_level,
        vhost_management_enabled:   config.vhost_management_enabled,
        preferred_browser:          config.preferred_browser ?? "",
      });
    }
    invoke<string>("get_config_dir").then(setConfigDir).catch(() => {});
    invoke<string | null>("get_github_token").then((t) => setHasToken(!!t)).catch(() => {});
    invoke<boolean>("get_claude_api_key_status").then(setHasClaudeKey).catch(() => {});
  }, [config]);

  function set<K extends keyof AppConfigUpdate>(key: K, value: AppConfigUpdate[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateConfig(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  // GitHub token
  async function handleSaveToken() {
    if (!tokenInput.trim()) return;
    try {
      await invoke("save_github_token", { token: tokenInput.trim() });
      setHasToken(true);
      setTokenInput("");
      setTokenMsg("Token saved to macOS Keychain.");
    } catch (e) {
      setTokenMsg("Error: " + String(e));
    }
  }

  async function handleDeleteToken() {
    await invoke("delete_github_token");
    setHasToken(false);
    setTokenMsg("Token removed from Keychain.");
  }

  // Claude API key
  async function handleSaveClaudeKey() {
    if (!claudeKeyInput.trim()) return;
    try {
      await invoke("save_claude_api_key", { key: claudeKeyInput.trim() });
      setHasClaudeKey(true);
      setClaudeKeyInput("");
      setClaudeKeyMsg("API key saved to macOS Keychain.");
    } catch (e) {
      setClaudeKeyMsg("Error: " + String(e));
    }
  }

  async function handleDeleteClaudeKey() {
    try {
      await invoke("delete_claude_api_key_cmd");
      setHasClaudeKey(false);
      setClaudeKeyMsg("API key removed from Keychain.");
    } catch (e) {
      setClaudeKeyMsg("Error: " + String(e));
    }
  }

  async function handleResetSetup() {
    await invoke("reset_setup");
    await loadConfig();
  }

  if (!config) return null;

  return (
    <div className="view-enter max-w-xl space-y-8 p-6">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">Settings</h1>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Homebrew Services */}
        <section className="rounded-xl border p-5" style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
          <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Homebrew Services</h2>
          <div className="space-y-3">
            <SettingsRow label="Apache service name">
              <input type="text" value={form.apache_service_name ?? ""} onChange={(e) => set("apache_service_name", e.target.value)}
                className={inputCls} style={inputStyle} placeholder="httpd" />
            </SettingsRow>
            <SettingsRow label="MySQL service name">
              <input type="text" value={form.mysql_service_name ?? ""} onChange={(e) => set("mysql_service_name", e.target.value)}
                className={inputCls} style={inputStyle} placeholder="mysql or mysql@8.4" />
            </SettingsRow>
            <SettingsRow label="PHP-FPM service name">
              <input type="text" value={form.php_service_name ?? ""} onChange={(e) => set("php_service_name", e.target.value)}
                className={inputCls} style={inputStyle} placeholder="php or php@8.3 (leave empty to hide)" />
            </SettingsRow>
          </div>
        </section>

        {/* Git */}
        <section className="rounded-xl border p-5" style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
          <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Git / Auto-update</h2>
          <div className="space-y-3">
            <SettingsRow label="Auto-check remote">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={form.auto_check_git_updates ?? false}
                  onChange={(e) => set("auto_check_git_updates", e.target.checked)} className="rounded" />
                <span className="text-sm text-[var(--text-secondary)]">Enable periodic git fetch</span>
              </label>
            </SettingsRow>
            <SettingsRow label="Check interval (min)">
              <input type="number" min={5} value={form.git_check_interval_minutes ?? 15}
                onChange={(e) => set("git_check_interval_minutes", parseInt(e.target.value))}
                className={`${inputCls} w-24`} style={inputStyle} />
            </SettingsRow>
          </div>
        </section>

        {/* VHost */}
        <section className="rounded-xl border p-5" style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
          <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Apache Virtual Hosts</h2>
          <SettingsRow label="VHost management">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={form.vhost_management_enabled ?? false}
                onChange={(e) => set("vhost_management_enabled", e.target.checked)} className="rounded" />
              <span className="text-sm text-[var(--text-secondary)]">Enable per-project VirtualHost generation</span>
            </label>
          </SettingsRow>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            When enabled, CodeOS writes <code>.conf</code> files to{" "}
            <code>{config.homebrew_prefix ?? "/opt/homebrew"}/etc/httpd/sites-enabled/</code>.
            Add <code>Include .../sites-enabled/*.conf</code> to your <code>httpd.conf</code>.
          </p>
        </section>

        {/* Browser */}
        <section className="rounded-xl border p-5" style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
          <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Browser</h2>
          <SettingsRow label="Open projects in">
            <select value={form.preferred_browser ?? ""} onChange={(e) => set("preferred_browser", e.target.value || null)}
              className={inputCls} style={inputStyle}>
              {BROWSERS.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </SettingsRow>
        </section>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="rounded-lg bg-accent-blue px-5 py-2 text-sm text-white hover:bg-accent-blue/80 disabled:opacity-40">
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save Settings"}
          </button>
        </div>
      </form>

      {/* Claude API Key */}
      <section className="rounded-xl border p-5" style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Claude API Key</h2>
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          Required for the AI Chat feature. Stored securely in macOS Keychain — never saved to disk.
        </p>
        {hasClaudeKey ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-accent-green">API key stored in Keychain ✓</span>
            <button onClick={handleDeleteClaudeKey} className="text-xs text-accent-red hover:underline">
              Remove key
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showClaudeKey ? "text" : "password"}
                value={claudeKeyInput}
                onChange={(e) => setClaudeKeyInput(e.target.value)}
                placeholder="sk-ant-…"
                className={`${inputCls} pr-9`}
                style={inputStyle}
              />
              <button type="button" onClick={() => setShowClaudeKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                {showClaudeKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <button onClick={handleSaveClaudeKey} disabled={!claudeKeyInput.trim()}
              className="rounded-lg bg-accent-blue px-3 py-2 text-sm text-white hover:bg-accent-blue/80 disabled:opacity-40">
              Save
            </button>
          </div>
        )}
        {claudeKeyMsg && (
          <p className={`mt-2 text-xs ${claudeKeyMsg.startsWith("Error") ? "text-accent-red" : "text-[var(--text-muted)]"}`}>
            {claudeKeyMsg}
          </p>
        )}
      </section>

      {/* GitHub Token */}
      <section className="rounded-xl border p-5" style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">GitHub Personal Access Token</h2>
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          Required for private repositories or to avoid API rate limiting. Stored in macOS Keychain.
        </p>
        {hasToken ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-accent-green">Token stored in Keychain ✓</span>
            <button onClick={handleDeleteToken} className="text-xs text-accent-red hover:underline">
              Remove token
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showToken ? "text" : "password"}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="ghp_…"
                className={`${inputCls} pr-9`}
                style={inputStyle}
              />
              <button type="button" onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
                {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <button onClick={handleSaveToken} disabled={!tokenInput.trim()}
              className="rounded-lg bg-accent-blue px-3 py-2 text-sm text-white hover:bg-accent-blue/80 disabled:opacity-40">
              Save
            </button>
          </div>
        )}
        {tokenMsg && (
          <p className={`mt-2 text-xs ${tokenMsg.startsWith("Error") ? "text-accent-red" : "text-[var(--text-muted)]"}`}>
            {tokenMsg}
          </p>
        )}
      </section>

      {/* Config location */}
      <section className="rounded-xl border p-5" style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
        <h2 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Config Location</h2>
        <p className="mb-2 text-xs text-[var(--text-muted)]">All app data is stored in this directory.</p>
        {configDir && (
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded px-2 py-1 text-xs text-[var(--text-secondary)]"
              style={{ background: "var(--surface-2)" }}>
              {configDir}
            </code>
            <button
              onClick={() => invoke("reveal_in_finder", { path: configDir })}
              className="shrink-0 text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]"
              title="Reveal in Finder"
            >
              <FolderOpen size={14} />
            </button>
          </div>
        )}
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-accent-red/20 p-5" style={{ background: "var(--surface-1)" }}>
        <h2 className="mb-3 text-sm font-semibold text-accent-red">Danger Zone</h2>
        <button
          onClick={handleResetSetup}
          className="flex items-center gap-2 rounded-lg border border-accent-red/30 px-4 py-2 text-sm text-accent-red hover:bg-accent-red/10"
        >
          <RotateCcw size={14} />
          Re-run Setup Wizard
        </button>
      </section>
    </div>
  );
}

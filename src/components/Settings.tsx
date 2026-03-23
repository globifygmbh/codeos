import { invoke } from "@tauri-apps/api/core";
import { Eye, EyeOff, FolderOpen, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "../stores/store";
import type { AppConfigUpdate } from "../types";

export default function Settings() {
  const { config, updateConfig, loadConfig } = useStore();

  const [form, setForm] = useState<AppConfigUpdate>({});
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [configDir, setConfigDir] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tokenMsg, setTokenMsg] = useState<string | null>(null);

  useEffect(() => {
    if (config) {
      setForm({
        apache_service_name: config.apache_service_name,
        mysql_service_name:  config.mysql_service_name,
        php_service_name:    config.php_service_name ?? "",
        auto_check_git_updates:     config.auto_check_git_updates,
        git_check_interval_minutes: config.git_check_interval_minutes,
        log_level:                  config.log_level,
        vhost_management_enabled:   config.vhost_management_enabled,
      });
    }
    invoke<string>("get_config_dir").then(setConfigDir).catch(() => {});
    invoke<string | null>("get_github_token")
      .then((t) => setHasToken(!!t))
      .catch(() => {});
  }, [config]);

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
    setTokenMsg("Token deleted from Keychain.");
  }

  async function handleResetSetup() {
    await invoke("reset_setup");
    await loadConfig();
  }

  if (!config) return null;

  function set<K extends keyof AppConfigUpdate>(key: K, value: AppConfigUpdate[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="view-enter max-w-xl space-y-8 p-6">
      <h1 className="text-xl font-semibold text-white">Settings</h1>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Services */}
        <section className="rounded-xl border border-white/5 bg-surface-1 p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">Homebrew Services</h2>
          <div className="space-y-3">
            <SettingsRow label="Apache service name">
              <input
                type="text"
                value={form.apache_service_name ?? ""}
                onChange={(e) => set("apache_service_name", e.target.value)}
                className={inputCls}
                placeholder="httpd"
              />
            </SettingsRow>
            <SettingsRow label="MySQL service name">
              <input
                type="text"
                value={form.mysql_service_name ?? ""}
                onChange={(e) => set("mysql_service_name", e.target.value)}
                className={inputCls}
                placeholder="mysql or mysql@8.4"
              />
            </SettingsRow>
            <SettingsRow label="PHP-FPM service name">
              <input
                type="text"
                value={form.php_service_name ?? ""}
                onChange={(e) => set("php_service_name", e.target.value)}
                className={inputCls}
                placeholder="php or php@8.3 (leave empty to hide)"
              />
            </SettingsRow>
          </div>
        </section>

        {/* Git */}
        <section className="rounded-xl border border-white/5 bg-surface-1 p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">Git / Auto-update</h2>
          <div className="space-y-3">
            <SettingsRow label="Auto-check remote">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.auto_check_git_updates ?? false}
                  onChange={(e) => set("auto_check_git_updates", e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm text-gray-400">Enable periodic git fetch</span>
              </label>
            </SettingsRow>
            <SettingsRow label="Check interval (minutes)">
              <input
                type="number"
                min={5}
                value={form.git_check_interval_minutes ?? 15}
                onChange={(e) => set("git_check_interval_minutes", parseInt(e.target.value))}
                className={`${inputCls} w-24`}
              />
            </SettingsRow>
          </div>
        </section>

        {/* VHost */}
        <section className="rounded-xl border border-white/5 bg-surface-1 p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">Apache Virtual Hosts</h2>
          <SettingsRow label="VHost management">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.vhost_management_enabled ?? false}
                onChange={(e) => set("vhost_management_enabled", e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-400">Enable per-project VirtualHost generation</span>
            </label>
          </SettingsRow>
          <p className="mt-3 text-xs text-gray-600">
            When enabled, CodeOS will write <code>.conf</code> files to{" "}
            <code>{config.homebrew_prefix ?? "/opt/homebrew"}/etc/httpd/sites-enabled/</code>. You
            must add{" "}
            <code>Include .../sites-enabled/*.conf</code> to your <code>httpd.conf</code>.
          </p>
        </section>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent-blue px-5 py-2 text-sm text-white hover:bg-accent-blue/80 disabled:opacity-40"
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save Settings"}
          </button>
        </div>
      </form>

      {/* GitHub Token */}
      <section className="rounded-xl border border-white/5 bg-surface-1 p-5">
        <h2 className="mb-1 text-sm font-semibold text-white">GitHub Personal Access Token</h2>
        <p className="mb-4 text-xs text-gray-500">
          Required only for private repositories or to avoid rate limiting. Stored securely in macOS
          Keychain.
        </p>
        {hasToken ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-accent-green">Token stored in Keychain ✓</span>
            <button
              onClick={handleDeleteToken}
              className="text-xs text-accent-red hover:underline"
            >
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
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <button
              onClick={handleSaveToken}
              disabled={!tokenInput.trim()}
              className="rounded-lg bg-accent-blue px-3 py-2 text-sm text-white hover:bg-accent-blue/80 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        )}
        {tokenMsg && (
          <p className="mt-2 text-xs text-gray-400">{tokenMsg}</p>
        )}
      </section>

      {/* Config location */}
      <section className="rounded-xl border border-white/5 bg-surface-1 p-5">
        <h2 className="mb-1 text-sm font-semibold text-white">Config Location</h2>
        {configDir && (
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-surface-2 px-2 py-1 text-xs text-gray-400">
              {configDir}
            </code>
            <button
              onClick={() => invoke("reveal_in_finder", { path: configDir })}
              className="shrink-0 text-gray-500 hover:text-gray-300"
              title="Reveal in Finder"
            >
              <FolderOpen size={14} />
            </button>
          </div>
        )}
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-accent-red/20 bg-surface-1 p-5">
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

const inputCls =
  "w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white placeholder-gray-600 font-mono focus:outline-none focus:ring-1 focus:ring-accent-blue/60";

function SettingsRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="shrink-0 text-xs text-gray-400 w-44">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

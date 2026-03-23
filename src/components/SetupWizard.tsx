import { invoke } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader,
  Terminal,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "../stores/store";
import type { SystemCheck, ToolCheck } from "../types";

type WizardStep = "check" | "configure" | "done";

function CheckRow({
  label,
  tool,
  install,
}: {
  label: string;
  tool: ToolCheck | undefined;
  install: string;
}) {
  if (!tool) {
    return (
      <div className="flex items-center gap-3 py-2">
        <Loader size={15} className="animate-spin text-gray-500" />
        <span className="text-sm text-gray-400">{label}</span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 py-2">
      {tool.installed ? (
        <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-accent-green" />
      ) : (
        <XCircle size={15} className="mt-0.5 shrink-0 text-accent-red" />
      )}
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`text-sm ${tool.installed ? "text-white" : "text-gray-400"}`}>
            {label}
          </span>
          {tool.version && (
            <span className="text-xs text-gray-500 font-mono truncate max-w-xs">
              {tool.version.split("\n")[0].split("Homebrew")[0].trim()}
            </span>
          )}
        </div>
        {!tool.installed && (
          <p className="mt-1 text-xs text-gray-600">
            Install:{" "}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-gray-400">
              {install}
            </code>
          </p>
        )}
      </div>
    </div>
  );
}

interface ConfigState {
  apacheService: string;
  mysqlService: string;
  phpService: string;
}

export default function SetupWizard() {
  const { loadConfig, loadServices } = useStore();

  const [step, setStep] = useState<WizardStep>("check");
  const [systemCheck, setSystemCheck] = useState<SystemCheck | null>(null);
  const [checking, setChecking] = useState(false);

  const [cfg, setCfg] = useState<ConfigState>({
    apacheService: "httpd",
    mysqlService:  "mysql",
    phpService:    "php",
  });

  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCheck() {
    setChecking(true);
    setError(null);
    try {
      const check = await invoke<SystemCheck>("system_check");
      setSystemCheck(check);

      // Pre-fill service names from detected prefix.
      if (check.homebrew_prefix) {
        setCfg((c) => ({
          ...c,
          apacheService: "httpd",
          mysqlService: "mysql",
          phpService: "php",
        }));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    runCheck();
  }, []);

  async function handleComplete() {
    if (!systemCheck?.homebrew_prefix) {
      setError("Homebrew not detected. Please install Homebrew first.");
      return;
    }
    setCompleting(true);
    setError(null);
    try {
      await invoke("complete_setup", {
        homebrewPrefix:  systemCheck.homebrew_prefix,
        apacheService:   cfg.apacheService,
        mysqlService:    cfg.mysqlService,
        phpService:      cfg.phpService.trim() || null,
      });
      setStep("done");
      await loadConfig();
      await loadServices();
    } catch (e) {
      setError(String(e));
    } finally {
      setCompleting(false);
    }
  }

  const canProceed =
    systemCheck?.homebrew.installed && systemCheck?.git.installed;

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-0 p-6">
      {/* Fake title bar */}
      <div
        className="pointer-events-none fixed left-0 top-0 h-10 w-full"
        data-tauri-drag-region
      />

      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-blue/15 text-accent-blue">
            <Terminal size={24} />
          </div>
          <h1 className="text-2xl font-semibold text-white">Welcome to CodeOS</h1>
          <p className="mt-2 text-sm text-gray-500">
            Local macOS development environment manager
          </p>
        </div>

        {/* Step indicators */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {(["check", "configure", "done"] as WizardStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  step === s
                    ? "bg-accent-blue text-white"
                    : i < ["check", "configure", "done"].indexOf(step)
                    ? "bg-accent-green/20 text-accent-green"
                    : "bg-white/5 text-gray-600"
                }`}
              >
                {i + 1}
              </div>
              {i < 2 && <ChevronRight size={12} className="text-gray-700" />}
            </div>
          ))}
        </div>

        {/* ── Step: Check ─────────────────────────────────────────── */}
        {step === "check" && (
          <div className="rounded-2xl border border-white/5 bg-surface-1 p-6">
            <h2 className="mb-1 text-base font-semibold text-white">System Check</h2>
            <p className="mb-5 text-sm text-gray-500">
              Verifying required tools on your Mac…
            </p>

            <div className="divide-y divide-white/5">
              <CheckRow
                label="Homebrew"
                tool={systemCheck?.homebrew}
                install="/bin/bash -c &quot;$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)&quot;"
              />
              <CheckRow
                label="Git"
                tool={systemCheck?.git}
                install="xcode-select --install"
              />
              <CheckRow
                label="Apache (httpd)"
                tool={systemCheck?.apache}
                install="brew install httpd"
              />
              <CheckRow
                label="MySQL"
                tool={systemCheck?.mysql}
                install="brew install mysql"
              />
              <CheckRow
                label="PHP"
                tool={systemCheck?.php}
                install="brew install php"
              />
            </div>

            {systemCheck && !systemCheck.homebrew.installed && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-accent-yellow/10 px-3 py-2 text-xs text-accent-yellow">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                Homebrew is required. Install it, then re-run this check.
              </div>
            )}

            {systemCheck && !systemCheck.apache.installed && (
              <div className="mt-4 rounded-lg bg-surface-2 p-3 text-xs text-gray-400">
                <p className="font-medium text-gray-300 mb-1.5">
                  Apache/MySQL not found? Install via Homebrew:
                </p>
                <pre className="log-output">brew install httpd mysql php</pre>
              </div>
            )}

            {error && (
              <p className="mt-4 text-xs text-accent-red">{error}</p>
            )}

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={runCheck}
                disabled={checking}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 disabled:opacity-40"
              >
                {checking ? (
                  <Loader size={13} className="animate-spin" />
                ) : (
                  <Terminal size={13} />
                )}
                Re-run check
              </button>
              <button
                disabled={!canProceed || checking}
                onClick={() => setStep("configure")}
                className="flex items-center gap-2 rounded-lg bg-accent-blue px-5 py-2 text-sm text-white hover:bg-accent-blue/80 disabled:opacity-40"
              >
                Continue
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Configure ─────────────────────────────────────── */}
        {step === "configure" && (
          <div className="rounded-2xl border border-white/5 bg-surface-1 p-6">
            <h2 className="mb-1 text-base font-semibold text-white">Configure Services</h2>
            <p className="mb-5 text-sm text-gray-500">
              Specify the Homebrew service names for your installation.
            </p>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs text-gray-400">
                  Apache service name
                </label>
                <input
                  type="text"
                  value={cfg.apacheService}
                  onChange={(e) => setCfg((c) => ({ ...c, apacheService: e.target.value }))}
                  className={inputCls}
                  placeholder="httpd"
                />
                <p className="mt-1 text-xs text-gray-600">
                  Usually <code>httpd</code>. Run <code>brew services list</code> to confirm.
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-gray-400">
                  MySQL service name
                </label>
                <input
                  type="text"
                  value={cfg.mysqlService}
                  onChange={(e) => setCfg((c) => ({ ...c, mysqlService: e.target.value }))}
                  className={inputCls}
                  placeholder="mysql"
                />
                <p className="mt-1 text-xs text-gray-600">
                  Could be <code>mysql</code>, <code>mysql@8.4</code>, <code>mysql@8.0</code>, etc.
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-gray-400">
                  PHP-FPM service name{" "}
                  <span className="text-gray-600">(optional)</span>
                </label>
                <input
                  type="text"
                  value={cfg.phpService}
                  onChange={(e) => setCfg((c) => ({ ...c, phpService: e.target.value }))}
                  className={inputCls}
                  placeholder="php (leave empty to skip)"
                />
                <p className="mt-1 text-xs text-gray-600">
                  Needed only if you use PHP-FPM with nginx/Apache. Leave empty otherwise.
                </p>
              </div>
            </div>

            {systemCheck?.homebrew_prefix && (
              <div className="mt-4 rounded-lg bg-surface-2 p-3 text-xs text-gray-500">
                Detected Homebrew prefix:{" "}
                <code className="text-gray-300">{systemCheck.homebrew_prefix}</code>
              </div>
            )}

            {error && (
              <p className="mt-4 text-xs text-accent-red">{error}</p>
            )}

            <div className="mt-6 flex items-center justify-between">
              <button
                onClick={() => setStep("check")}
                className="text-sm text-gray-500 hover:text-gray-300"
              >
                ← Back
              </button>
              <button
                disabled={completing || !cfg.apacheService || !cfg.mysqlService}
                onClick={handleComplete}
                className="flex items-center gap-2 rounded-lg bg-accent-blue px-5 py-2 text-sm text-white hover:bg-accent-blue/80 disabled:opacity-40"
              >
                {completing ? (
                  <Loader size={13} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                Finish Setup
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Done ──────────────────────────────────────────── */}
        {step === "done" && (
          <div className="rounded-2xl border border-white/5 bg-surface-1 p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent-green/15 text-accent-green">
              <CheckCircle2 size={28} />
            </div>
            <h2 className="mb-2 text-lg font-semibold text-white">You're all set!</h2>
            <p className="mb-6 text-sm text-gray-500">
              CodeOS is configured. Use the dashboard to manage your services and projects.
            </p>
            <button
              onClick={loadConfig}
              className="rounded-lg bg-accent-blue px-6 py-2.5 text-sm text-white hover:bg-accent-blue/80"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white placeholder-gray-600 font-mono focus:outline-none focus:ring-1 focus:ring-accent-blue/60";

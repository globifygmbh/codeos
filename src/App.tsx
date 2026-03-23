import { useEffect } from "react";
import ChatWindow from "./components/ChatWindow";
import Dashboard from "./components/Dashboard";
import LogViewer from "./components/LogViewer";
import MysqlManager from "./components/MysqlManager";
import ProjectList from "./components/ProjectList";
import Settings from "./components/Settings";
import SetupWizard from "./components/SetupWizard";
import Sidebar from "./components/Sidebar";
import { useStore } from "./stores/store";

export default function App() {
  const { config, isInitialized, loadConfig, activeView, globalError, setGlobalError } = useStore();

  // ── System dark/light mode sync ──────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    loadConfig();
  }, []);

  // Auto-refresh services every 30 s.
  const { loadServices, loadLogs } = useStore();
  useEffect(() => {
    if (!isInitialized) return;
    const id = setInterval(() => { loadServices(); loadLogs(); }, 30_000);
    return () => clearInterval(id);
  }, [isInitialized]);

  if (!isInitialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-0">
        <div className="text-center">
          <div className="mx-auto mb-4 h-9 w-9 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
          <p className="text-sm text-[var(--text-secondary)]">Loading CodeOS…</p>
        </div>
      </div>
    );
  }

  if (config && !config.setup_completed) {
    return <SetupWizard />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0 text-[var(--text-primary)]">
      {/* macOS traffic-light spacer */}
      <div className="pointer-events-none fixed left-0 top-0 z-50 h-10 w-full bg-surface-1/80 backdrop-blur-md" />

      <Sidebar />

      <main className="relative flex flex-1 flex-col overflow-hidden pt-10">
        {globalError && (
          <div className="mx-4 mt-2 flex items-start gap-3 rounded-xl border border-accent-red/30 bg-accent-red/10 px-4 py-3 text-sm text-accent-red">
            <span className="mt-0.5 shrink-0">⚠</span>
            <span className="flex-1">{globalError}</span>
            <button onClick={() => setGlobalError(null)} className="shrink-0 opacity-60 hover:opacity-100">✕</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {activeView === "dashboard" && <Dashboard />}
          {activeView === "projects"  && <ProjectList />}
          {activeView === "chat"      && <ChatWindow />}
          {activeView === "mysql"     && <MysqlManager />}
          {activeView === "logs"      && <LogViewer />}
          {activeView === "settings"  && <Settings />}
        </div>
      </main>
    </div>
  );
}

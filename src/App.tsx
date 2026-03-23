import { useEffect } from "react";
import AgentPipelineView from "./components/AgentPipelineView";
import ChatWindow from "./components/ChatWindow";
import Dashboard from "./components/Dashboard";
import EditorView from "./components/EditorView";
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
      <div className="flex h-screen flex-col items-center justify-center"
        style={{ background: "#000", fontFamily: "-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif" }}>
        {/* Icon */}
        <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-[28px]"
          style={{ background: "linear-gradient(145deg,#1a0030,#0d0020)", boxShadow: "0 0 0 1px rgba(147,51,234,0.3), 0 20px 60px rgba(147,51,234,0.2)" }}>
          <span style={{ fontSize: 52, fontWeight: 700, color: "#9333ea", lineHeight: 1, letterSpacing: "-2px" }}>C</span>
        </div>

        {/* Name */}
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "#fff", letterSpacing: "-0.5px", margin: "0 0 4px" }}>
          CodeOS
        </h1>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "0 0 40px", letterSpacing: "0.02em" }}>
          by nyza-studio
        </p>

        {/* Spinner */}
        <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid rgba(147,51,234,0.2)", borderTopColor: "#9333ea", animation: "spin 0.7s linear infinite" }} />

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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

        <div className={`flex-1 ${activeView === "chat" || activeView === "editor" || activeView === "pipeline" ? "overflow-hidden" : "overflow-y-auto"}`}>
          {activeView === "dashboard" && <Dashboard />}
          {activeView === "projects"  && <ProjectList />}
          {activeView === "chat"      && <ChatWindow />}
          {activeView === "pipeline"  && <AgentPipelineView />}
          {activeView === "editor"    && <EditorView />}
          {activeView === "mysql"     && <MysqlManager />}
          {activeView === "logs"      && <LogViewer />}
          {activeView === "settings"  && <Settings />}
        </div>
      </main>
    </div>
  );
}

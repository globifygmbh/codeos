import {
  Code2,
  Database,
  FolderOpen,
  Gauge,
  GitFork,
  LayoutDashboard,
  MessageSquare,
  ScrollText,
  Settings,
} from "lucide-react";
import { useStore } from "../stores/store";
import type { View } from "../types";

interface NavItem {
  id: View;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

export default function Sidebar() {
  const { activeView, setView, services, projects, chatMessages } = useStore();

  const runningCount   = services.filter((s) => s.state === "running").length;
  const hasError       = services.some((s) => s.state === "error");
  const unreadMessages = chatMessages.filter((m) => m.role === "assistant").length;

  const indicatorColor = hasError ? "bg-accent-red" : runningCount > 0 ? "bg-accent-green" : "bg-gray-400";

  const navItems: NavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={17} /> },
    { id: "projects",  label: "Projects",  icon: <FolderOpen size={17} />, badge: projects.length || undefined },
    { id: "chat",      label: "Claude AI", icon: <MessageSquare size={17} /> },
    { id: "pipeline",  label: "Pipeline",  icon: <GitFork size={17} /> },
    { id: "editor",    label: "Editor",    icon: <Code2 size={17} /> },
    { id: "mysql",     label: "MySQL",     icon: <Database size={17} /> },
    { id: "logs",      label: "Logs",      icon: <ScrollText size={17} /> },
    { id: "settings",  label: "Settings",  icon: <Settings size={17} /> },
  ];

  return (
    <aside
      className="flex w-52 shrink-0 flex-col border-r bg-surface-1 pt-10"
      style={{ borderColor: "var(--border-color)" }}
      data-tauri-drag-region
    >
      {/* Branding */}
      <div className="no-select px-4 pb-4 pt-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-blue/15 text-accent-blue">
            <Gauge size={15} />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-[var(--text-primary)]">CodeOS</p>
            <p className="text-[10px] text-[var(--text-muted)]">by nyza-studio</p>
          </div>
        </div>
      </div>

      {/* Service health pill */}
      <div
        className="no-select mx-3 mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
        style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}
      >
        <span className={`h-2 w-2 rounded-full ${indicatorColor} ${runningCount > 0 && !hasError ? "dot-running" : ""}`} />
        {hasError
          ? "Service error"
          : runningCount === 0
          ? "No services running"
          : `${runningCount} service${runningCount > 1 ? "s" : ""} running`}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-2">
        {navItems.map((item) => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-accent-blue/12 text-accent-blue font-medium"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
              }`}
            >
              {item.icon}
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span className="rounded-full bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="no-select px-4 pb-4 pt-2">
        <p className="text-[10px] text-[var(--text-muted)]">v0.2.0 · nyza-studio</p>
      </div>
    </aside>
  );
}

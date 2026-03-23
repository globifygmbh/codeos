import {
  FolderOpen,
  Gauge,
  LayoutDashboard,
  ScrollText,
  Settings,
} from "lucide-react";
import { useStore } from "../stores/store";
import type { View } from "../types";

interface NavItem {
  id: View;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { id: "projects",  label: "Projects",  icon: <FolderOpen size={18} /> },
  { id: "logs",      label: "Logs",      icon: <ScrollText size={18} /> },
  { id: "settings",  label: "Settings",  icon: <Settings size={18} /> },
];

export default function Sidebar() {
  const { activeView, setView, services } = useStore();

  const runningCount = services.filter((s) => s.state === "running").length;
  const hasError     = services.some((s) => s.state === "error");

  const indicatorColor = hasError
    ? "bg-accent-red"
    : runningCount > 0
    ? "bg-accent-green"
    : "bg-gray-600";

  return (
    <aside
      className="flex w-52 shrink-0 flex-col border-r border-white/5 bg-surface-1 pt-10"
      data-tauri-drag-region
    >
      {/* App branding */}
      <div className="no-select px-4 pb-4 pt-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-blue/20 text-accent-blue">
            <Gauge size={15} />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight text-white">CodeOS</p>
            <p className="text-[10px] text-gray-500">Dev Manager</p>
          </div>
        </div>
      </div>

      {/* Service health summary */}
      <div className="no-select mx-3 mb-3 flex items-center gap-2 rounded-md bg-surface-2/60 px-3 py-2 text-xs text-gray-400">
        <span className={`h-2 w-2 rounded-full ${indicatorColor} ${runningCount > 0 && !hasError ? "dot-running" : ""}`} />
        {hasError
          ? "Service error"
          : runningCount === 0
          ? "All services stopped"
          : `${runningCount} service${runningCount > 1 ? "s" : ""} running`}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
              activeView === item.id
                ? "bg-accent-blue/15 text-accent-blue"
                : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {/* Version footer */}
      <div className="no-select px-4 pb-4 pt-2">
        <p className="text-[10px] text-gray-600">v0.1.0</p>
      </div>
    </aside>
  );
}

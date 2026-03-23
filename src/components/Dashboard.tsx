import { invoke } from "@tauri-apps/api/core";
import { ArrowUpCircle, ExternalLink, GitBranch, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useStore } from "../stores/store";
import ServiceStatusPanel from "./ServiceStatus";

function QuickProjectRow({
  project,
  onOpenBrowser,
}: {
  project: { id: string; name: string; local_url: string; path: string };
  onOpenBrowser: (url: string) => void;
}) {
  const { gitStatuses, fetchGitStatus } = useStore();
  const git = gitStatuses[project.id];

  useEffect(() => {
    fetchGitStatus(project.id, project.path);
  }, [project.id]);

  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-surface-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{project.name}</p>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
          <span className="font-mono truncate">{project.local_url}</span>
          {git && (
            <span className="flex items-center gap-1 shrink-0">
              <GitBranch size={10} className="text-accent-blue" />
              <span className="font-mono">{git.branch}</span>
              {git.behind > 0 && (
                <span className="text-accent-yellow">↓{git.behind}</span>
              )}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => onOpenBrowser(project.local_url)}
        className="ml-3 shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-white/5 hover:text-accent-blue"
        title="Open in browser"
      >
        <ExternalLink size={13} />
      </button>
    </div>
  );
}

export default function Dashboard() {
  const {
    services,
    projects,
    logs,
    loadServices,
    loadProjects,
    loadLogs,
    refreshAll,
    servicesLoading,
    setView,
    config,
  } = useStore();

  useEffect(() => {
    refreshAll();
  }, []);

  const recentProjects = projects.slice(0, 5);
  const recentLogs = logs.slice(-6).reverse();

  const runningServices = services.filter((s) => s.state === "running").length;
  const totalServices   = services.filter((s) => s.state !== "notinstalled").length;
  const errorServices   = services.filter((s) => s.state === "error").length;
  const projectsWithUpdates = Object.values(
    useStore.getState().gitStatuses
  ).filter((g) => g.behind > 0).length;

  return (
    <div className="view-enter space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Dashboard</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Local development environment overview
          </p>
        </div>
        <button
          onClick={refreshAll}
          disabled={servicesLoading}
          className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-400 hover:bg-white/8 hover:text-gray-200 disabled:opacity-40"
        >
          <RefreshCw size={14} className={servicesLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Services running"
          value={`${runningServices} / ${totalServices}`}
          color={errorServices > 0 ? "red" : runningServices > 0 ? "green" : "gray"}
        />
        <StatCard
          label="Projects"
          value={projects.length.toString()}
          color="blue"
        />
        <StatCard
          label="Updates available"
          value={projectsWithUpdates.toString()}
          color={projectsWithUpdates > 0 ? "yellow" : "gray"}
        />
        <StatCard
          label="Service errors"
          value={errorServices.toString()}
          color={errorServices > 0 ? "red" : "gray"}
        />
      </div>

      {/* Services */}
      <ServiceStatusPanel />

      {/* Recent projects */}
      {recentProjects.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Recent Projects
            </h2>
            {projects.length > 5 && (
              <button
                onClick={() => setView("projects")}
                className="text-xs text-accent-blue hover:underline"
              >
                View all
              </button>
            )}
          </div>
          <div className="space-y-2">
            {recentProjects.map((p) => (
              <QuickProjectRow
                key={p.id}
                project={p}
                onOpenBrowser={(url) =>
                  invoke("open_in_browser", { url })
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Recent logs */}
      {recentLogs.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Recent Activity
            </h2>
            <button
              onClick={() => setView("logs")}
              className="text-xs text-accent-blue hover:underline"
            >
              All logs
            </button>
          </div>
          <div className="rounded-xl border border-white/5 bg-surface-1 divide-y divide-white/5">
            {recentLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 px-4 py-2.5">
                <LogLevelBadge level={log.level} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-gray-300 log-output">{log.message}</p>
                  <p className="text-[10px] text-gray-600">
                    {log.source} · {new Date(log.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "green" | "blue" | "yellow" | "red" | "gray";
}) {
  const colorMap = {
    green:  "text-accent-green",
    blue:   "text-accent-blue",
    yellow: "text-accent-yellow",
    red:    "text-accent-red",
    gray:   "text-gray-400",
  };
  return (
    <div className="rounded-xl border border-white/5 bg-surface-1 px-4 py-3">
      <p className={`text-2xl font-semibold tabular-nums ${colorMap[color]}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </div>
  );
}

function LogLevelBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    info:    "text-gray-400",
    warn:    "text-accent-yellow",
    error:   "text-accent-red",
    success: "text-accent-green",
    debug:   "text-gray-600",
  };
  const icons: Record<string, string> = {
    info: "●", warn: "▲", error: "✕", success: "✓", debug: "·",
  };
  return (
    <span className={`mt-0.5 shrink-0 text-xs font-mono ${map[level] ?? "text-gray-500"}`}>
      {icons[level] ?? "·"}
    </span>
  );
}

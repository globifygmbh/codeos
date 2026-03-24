import { invoke } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  GitBranch,
  GitCommit,
  Loader,
  RefreshCw,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "../stores/store";
import type { GitStatus, Project } from "../types";

interface Props {
  project: Project;
}

export default function GitPanel({ project }: Props) {
  const {
    gitStatuses,
    gitLoading,
    fetchGitStatus,
    gitFetch,
    gitPull,
    gitPush,
  } = useStore();

  const status: GitStatus | undefined = gitStatuses[project.id];
  const loading = gitLoading[project.id] ?? false;

  // Clone / link remote state
  const [cloneUrl, setCloneUrl] = useState(project.git_remote ?? "");
  const [cloneTarget, setCloneTarget] = useState(project.path);
  const [cloning, setCloning] = useState(false);
  const [cloneMsg, setCloneMsg] = useState<string | null>(null);
  // Auto-open clone form if git_remote is set but no repo detected yet
  const [showClone, setShowClone] = useState(false);
  const [forceClone, setForceClone] = useState(false);

  useEffect(() => {
    fetchGitStatus(project.id, project.path);
  }, [project.id, project.path]);

  // Auto-open clone form once we know there's no repo but a remote is configured
  useEffect(() => {
    if (!loading && !status && project.git_remote) {
      setShowClone(true);
    }
  }, [loading, status, project.git_remote]);

  async function handleClone() {
    setCloning(true);
    setCloneMsg(null);
    try {
      const msg = await invoke<string>("git_clone", {
        url: cloneUrl,
        destination: cloneTarget,
        force: forceClone,
      });
      setCloneMsg("Cloned: " + msg);
      setShowClone(false);
      setForceClone(false);
      fetchGitStatus(project.id, project.path);
    } catch (e) {
      setCloneMsg("Error: " + String(e));
    } finally {
      setCloning(false);
    }
  }

  async function handleSetRemote() {
    try {
      await invoke("git_set_remote", {
        projectPath: project.path,
        remoteUrl: cloneUrl,
      });
      setShowClone(false);
      fetchGitStatus(project.id, project.path);
    } catch (e) {
      setCloneMsg("Error: " + String(e));
    }
  }

  function openReclone() {
    setCloneUrl(project.git_remote ?? "");
    setCloneTarget(project.path);
    setForceClone(true);
    setCloneMsg(null);
    setShowClone(true);
  }

  const cloneForm = (
    <div className="mt-3 space-y-2">
      {forceClone && (
        <div className="flex items-center gap-2 rounded-md bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
          <AlertTriangle size={12} />
          Der bestehende Ordner wird gelöscht und neu geclont.
        </div>
      )}
      <input
        type="text"
        value={cloneUrl}
        onChange={(e) => setCloneUrl(e.target.value)}
        placeholder="https://github.com/user/repo.git"
        className="w-full rounded-md border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-accent-blue/60"
      />
      <input
        type="text"
        value={cloneTarget}
        onChange={(e) => setCloneTarget(e.target.value)}
        placeholder="Destination path"
        className="w-full rounded-md border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-accent-blue/60"
      />
      <div className="flex gap-2">
        <button
          disabled={cloning || !cloneUrl}
          onClick={handleClone}
          className="flex items-center gap-1.5 rounded-md bg-accent-blue px-3 py-1.5 text-xs text-white disabled:opacity-40 hover:bg-accent-blue/80"
        >
          {cloning ? <Loader size={11} className="animate-spin" /> : null}
          {forceClone ? "Löschen & neu clonen" : "Clone"}
        </button>
        {!forceClone && (
          <button
            disabled={!cloneUrl}
            onClick={handleSetRemote}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10 disabled:opacity-40"
          >
            Link existing repo
          </button>
        )}
        <button
          onClick={() => { setShowClone(false); setForceClone(false); setCloneMsg(null); }}
          className="rounded-md bg-white/5 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/10"
        >
          Abbrechen
        </button>
      </div>
      {cloneMsg && (
        <p className="text-xs text-gray-400 log-output">{cloneMsg}</p>
      )}
    </div>
  );

  if (!status && !loading) {
    return (
      <div className="rounded-xl border border-white/5 bg-surface-1 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Git
        </p>
        <p className="mb-3 text-sm text-gray-400">No git repository detected at this path.</p>
        <div className="flex gap-2">
          <button
            onClick={() => {
              invoke("git_init", { projectPath: project.path }).then(() =>
                fetchGitStatus(project.id, project.path)
              );
            }}
            className="rounded-md bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10"
          >
            git init
          </button>
          <button
            onClick={() => { setForceClone(false); setShowClone(true); }}
            className="rounded-md bg-accent-blue/10 px-3 py-1.5 text-xs text-accent-blue hover:bg-accent-blue/20"
          >
            Clone / Link remote
          </button>
        </div>
        {showClone && cloneForm}
      </div>
    );
  }

  if (loading && !status) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader size={14} className="animate-spin" />
        Loading git status…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/5 bg-surface-1 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Git</p>
        <div className="flex items-center gap-1">
          <button
            onClick={openReclone}
            className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-white/5 hover:text-gray-300"
            title="Re-clone repository"
          >
            Re-clone
          </button>
          <button
            disabled={loading}
            onClick={() => fetchGitStatus(project.id, project.path)}
            className="rounded-md p-1 text-gray-500 hover:bg-white/5 hover:text-gray-300 disabled:opacity-40"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {showClone && cloneForm}

      {status && !showClone && (
        <>
          {/* Branch & commit */}
          <div className="mb-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm text-white">
              <GitBranch size={13} className="text-accent-blue" />
              <span className="font-mono">{status.branch}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <GitCommit size={12} />
              <span className="font-mono">{status.local_commit}</span>
              {status.last_commit_message && (
                <span className="truncate text-gray-500">{status.last_commit_message}</span>
              )}
            </div>
          </div>

          {/* Ahead / behind */}
          {(status.ahead > 0 || status.behind > 0) && (
            <div className="mb-3 flex gap-3">
              {status.behind > 0 && (
                <span className="flex items-center gap-1 text-xs text-accent-yellow">
                  <ArrowDown size={12} />
                  {status.behind} behind
                </span>
              )}
              {status.ahead > 0 && (
                <span className="flex items-center gap-1 text-xs text-accent-blue">
                  <ArrowUp size={12} />
                  {status.ahead} ahead
                </span>
              )}
            </div>
          )}

          {/* Conflicts */}
          {status.has_conflicts && (
            <div className="mb-3 flex items-center gap-2 rounded-md bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
              <AlertTriangle size={12} />
              Merge conflicts detected — resolve manually.
            </div>
          )}

          {/* Working tree summary */}
          {(status.modified_files.length > 0 || status.untracked_files.length > 0) && (
            <div className="mb-3 space-y-1 text-xs text-gray-500">
              {status.modified_files.length > 0 && (
                <p>{status.modified_files.length} modified file{status.modified_files.length > 1 ? "s" : ""}</p>
              )}
              {status.staged_files.length > 0 && (
                <p>{status.staged_files.length} staged</p>
              )}
              {status.untracked_files.length > 0 && (
                <p>{status.untracked_files.length} untracked</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              disabled={loading}
              onClick={() => gitFetch(project.id, project.path)}
              className="flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/10 disabled:opacity-40"
            >
              <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
              Fetch
            </button>
            {status.behind > 0 && (
              <button
                disabled={loading}
                onClick={() => gitPull(project.id, project.path)}
                className="flex items-center gap-1.5 rounded-md bg-accent-green/10 px-3 py-1.5 text-xs text-accent-green hover:bg-accent-green/20 disabled:opacity-40"
              >
                <ArrowDown size={11} />
                Pull ({status.behind})
              </button>
            )}
            {status.ahead > 0 && (
              <button
                disabled={loading}
                onClick={() => gitPush(project.id, project.path)}
                className="flex items-center gap-1.5 rounded-md bg-accent-blue/10 px-3 py-1.5 text-xs text-accent-blue hover:bg-accent-blue/20 disabled:opacity-40"
              >
                <Upload size={11} />
                Push ({status.ahead})
              </button>
            )}
            {status.behind === 0 && status.ahead === 0 && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                Up to date
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

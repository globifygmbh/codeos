import { invoke } from "@tauri-apps/api/core";
import {
  CheckSquare,
  Copy,
  ExternalLink,
  FolderOpen,
  GitBranch,
  Loader,
  MoreHorizontal,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { useStore } from "../stores/store";
import type { GitStatus, Project } from "../types";
import GitPanel from "./GitPanel";
import TodoPanel from "./TodoPanel";

interface Props {
  project: Project;
  isSelected: boolean;
  onSelect: () => void;
}

type Tab = "git" | "todos";

export default function ProjectCard({ project, isSelected, onSelect }: Props) {
  const { removeProject, renameProject, duplicateProject, gitStatuses } = useStore();

  const [showMenu, setShowMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("git");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const gitStatus: GitStatus | undefined = gitStatuses[project.id];
  const openTodos = (project.todos ?? []).filter((t) => !t.completed).length;

  function handleOpenBrowser() {
    invoke("open_in_browser", { url: project.local_url });
  }

  function handleRevealInFinder() {
    invoke("reveal_in_finder", { path: project.path });
    setShowMenu(false);
  }

  async function handleRenameSubmit() {
    const name = renameValue.trim();
    if (!name || name === project.name) { setRenaming(false); return; }
    try {
      await renameProject(project.id, name);
    } catch (e) {
      useStore.getState().setGlobalError(String(e));
    } finally {
      setRenaming(false);
    }
  }

  async function handleDuplicate() {
    setShowMenu(false);
    await duplicateProject(project.id);
  }

  async function handleDelete() {
    await removeProject(project.id);
  }

  return (
    <div
      className={`rounded-xl border transition-colors ${
        isSelected
          ? "border-accent-blue/40"
          : "hover:border-[var(--border-color)]"
      }`}
      style={{
        borderColor: isSelected ? undefined : "var(--border-color)",
        background: isSelected ? "var(--surface-2)" : "var(--surface-1)",
      }}
    >
      {/* ── Card header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between p-4">
        <button onClick={onSelect} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            {/* Inline rename */}
            {renaming ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameSubmit();
                  if (e.key === "Escape") { setRenaming(false); setRenameValue(project.name); }
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                className="rounded-md border px-2 py-0.5 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-accent-blue/60"
                style={{ background: "var(--surface-2)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
              />
            ) : (
              <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {project.name}
              </span>
            )}
            {project.vhost_enabled && (
              <span className="shrink-0 rounded bg-accent-blue/12 px-1.5 py-0.5 text-[10px] text-accent-blue">VHost</span>
            )}
            {openTodos > 0 && (
              <span className="shrink-0 rounded bg-accent-yellow/12 px-1.5 py-0.5 text-[10px] text-accent-yellow">
                {openTodos} todo
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs font-mono text-[var(--text-muted)]">{project.path}</p>

          {/* Git summary */}
          {gitStatus && (
            <div className="mt-1.5 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
              <GitBranch size={11} className="shrink-0 text-accent-blue" />
              <span className="font-mono">{gitStatus.branch}</span>
              {gitStatus.behind > 0 && <span className="text-accent-yellow">↓{gitStatus.behind}</span>}
              {gitStatus.ahead > 0 && <span className="text-accent-blue">↑{gitStatus.ahead}</span>}
              {gitStatus.has_conflicts && <span className="text-accent-red">⚠ conflict</span>}
            </div>
          )}
        </button>

        {/* Quick action buttons */}
        <div className="ml-2 flex shrink-0 items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); handleOpenBrowser(); }}
            title="Open in browser"
            className="rounded-md p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-accent-blue"
          >
            <ExternalLink size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleRevealInFinder(); }}
            title="Reveal in Finder"
            className="rounded-md p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-secondary)]"
          >
            <FolderOpen size={13} />
          </button>
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
              className="rounded-md p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-secondary)]"
            >
              <MoreHorizontal size={13} />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border py-1 shadow-xl"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-color)" }}>
                <button onClick={(e) => { e.stopPropagation(); setRenaming(true); setShowMenu(false); setTimeout(() => renameInputRef.current?.select(), 50); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-2)]">
                  <Pencil size={12} /> Rename
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleDuplicate(); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-2)]">
                  <Copy size={12} /> Duplicate
                </button>
                <hr style={{ borderColor: "var(--border-color)" }} className="my-1" />
                <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); setShowMenu(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-accent-red hover:bg-[var(--surface-2)]">
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-color)" }}>
          <p className="mb-2 text-xs text-[var(--text-secondary)]">
            Remove <strong>{project.name}</strong> from CodeOS? Files on disk are untouched.
          </p>
          <div className="flex gap-2">
            <button onClick={handleDelete}
              className="rounded-lg bg-accent-red/15 px-3 py-1.5 text-xs text-accent-red hover:bg-accent-red/25">
              Remove
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-2)]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Expanded detail */}
      {isSelected && (
        <div className="border-t" style={{ borderColor: "var(--border-color)" }}>
          {/* Meta row */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-4 py-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">Local URL</span>
              <button onClick={handleOpenBrowser} className="font-mono text-accent-blue hover:underline truncate max-w-[160px]">
                {project.local_url}
              </button>
            </div>
            {project.php_version && (
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)]">PHP</span>
                <span className="text-[var(--text-secondary)]">{project.php_version}</span>
              </div>
            )}
            {project.git_remote && (
              <div className="col-span-2 flex items-start justify-between gap-2">
                <span className="shrink-0 text-[var(--text-muted)]">Remote</span>
                <span className="truncate font-mono text-right text-[var(--text-secondary)]">{project.git_remote}</span>
              </div>
            )}
          </div>

          {/* Tab bar */}
          <div className="flex border-t" style={{ borderColor: "var(--border-color)" }}>
            {(["git", "todos"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs capitalize transition ${
                  activeTab === tab
                    ? "border-b-2 border-accent-blue text-accent-blue"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {tab === "git" ? <GitBranch size={11} /> : <CheckSquare size={11} />}
                {tab}
                {tab === "todos" && openTodos > 0 && (
                  <span className="rounded-full bg-accent-yellow/15 px-1 text-[9px] text-accent-yellow">{openTodos}</span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-4">
            {activeTab === "git" && <GitPanel project={project} />}
            {activeTab === "todos" && <TodoPanel project={project} />}
          </div>
        </div>
      )}
    </div>
  );
}

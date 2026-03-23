import { invoke } from "@tauri-apps/api/core";
import {
  ExternalLink,
  FolderOpen,
  GitBranch,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useStore } from "../stores/store";
import type { GitStatus, Project } from "../types";
import GitPanel from "./GitPanel";

interface Props {
  project: Project;
  isSelected: boolean;
  onSelect: () => void;
}

export default function ProjectCard({ project, isSelected, onSelect }: Props) {
  const { removeProject, gitStatuses } = useStore();
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const gitStatus: GitStatus | undefined = gitStatuses[project.id];

  function handleOpenBrowser() {
    invoke("open_in_browser", { url: project.local_url });
  }

  function handleRevealInFinder() {
    invoke("reveal_in_finder", { path: project.path });
    setShowMenu(false);
  }

  async function handleDelete() {
    await removeProject(project.id);
    setConfirmDelete(false);
    setShowMenu(false);
  }

  return (
    <div
      className={`rounded-xl border transition-colors ${
        isSelected
          ? "border-accent-blue/40 bg-surface-2"
          : "border-white/5 bg-surface-1 hover:border-white/10"
      }`}
    >
      {/* Card header */}
      <button
        onClick={onSelect}
        className="flex w-full items-start justify-between p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">
              {project.name}
            </span>
            {project.vhost_enabled && (
              <span className="shrink-0 rounded bg-accent-blue/15 px-1.5 py-0.5 text-[10px] text-accent-blue">
                VHost
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500 font-mono">
            {project.path}
          </p>

          {/* Git summary line */}
          {gitStatus && (
            <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-400">
              <GitBranch size={11} className="shrink-0 text-accent-blue" />
              <span className="font-mono">{gitStatus.branch}</span>
              {gitStatus.behind > 0 && (
                <span className="text-accent-yellow">↓{gitStatus.behind}</span>
              )}
              {gitStatus.ahead > 0 && (
                <span className="text-accent-blue">↑{gitStatus.ahead}</span>
              )}
              {gitStatus.has_conflicts && (
                <span className="text-accent-red">⚠ conflict</span>
              )}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="ml-2 flex shrink-0 items-center gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenBrowser();
            }}
            title="Open in browser"
            className="rounded-md p-1.5 text-gray-500 transition hover:bg-white/8 hover:text-accent-blue"
          >
            <ExternalLink size={13} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu((v) => !v);
            }}
            className="rounded-md p-1.5 text-gray-500 transition hover:bg-white/8 hover:text-gray-300"
          >
            <MoreHorizontal size={13} />
          </button>
        </div>
      </button>

      {/* Dropdown menu */}
      {showMenu && (
        <div className="relative">
          <div
            className="absolute right-3 -top-2 z-10 w-44 rounded-lg border border-white/10 bg-surface-3 py-1 shadow-xl"
            onBlur={() => setShowMenu(false)}
          >
            <button
              onClick={handleRevealInFinder}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-gray-300 hover:bg-white/5"
            >
              <FolderOpen size={12} />
              Reveal in Finder
            </button>
            <hr className="my-1 border-white/5" />
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-accent-red hover:bg-white/5"
            >
              <Trash2 size={12} />
              Remove project
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="border-t border-white/5 px-4 py-3">
          <p className="mb-2 text-xs text-gray-300">
            Remove <strong>{project.name}</strong> from CodeOS? (Files on disk are not deleted.)
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              className="rounded-md bg-accent-red/15 px-3 py-1.5 text-xs text-accent-red hover:bg-accent-red/25"
            >
              Remove
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-md bg-white/5 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Expanded detail */}
      {isSelected && (
        <div className="border-t border-white/5 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Local URL</span>
            <button
              onClick={handleOpenBrowser}
              className="font-mono text-accent-blue hover:underline"
            >
              {project.local_url}
            </button>
          </div>
          {project.git_remote && (
            <div className="flex items-start justify-between gap-2 text-xs">
              <span className="text-gray-500 shrink-0">Remote</span>
              <span className="font-mono text-gray-400 truncate text-right">
                {project.git_remote}
              </span>
            </div>
          )}
          {project.php_version && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">PHP</span>
              <span className="text-gray-400">{project.php_version}</span>
            </div>
          )}
          <GitPanel project={project} />
        </div>
      )}
    </div>
  );
}

import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, X } from "lucide-react";
import { useState } from "react";
import { useStore } from "../stores/store";
import type { ProjectInput } from "../types";

interface Props {
  onClose: () => void;
}

export default function AddProjectModal({ onClose }: Props) {
  const { addProject } = useStore();

  const [form, setForm] = useState<ProjectInput>({
    name: "",
    path: "",
    local_url: "http://localhost:8080",
    port: 8080,
    git_remote: "",
    php_version: "",
    document_root: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set(field: keyof ProjectInput, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function pickFolder() {
    const result = await open({ directory: true, multiple: false });
    if (result && typeof result === "string") {
      set("path", result);
      if (!form.name) {
        set("name", result.split("/").pop() ?? "");
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) return setError("Project name is required.");
    if (!form.path.trim()) return setError("Project path is required.");

    setSaving(true);
    try {
      await addProject({
        ...form,
        git_remote: form.git_remote?.trim() || undefined,
        php_version: form.php_version?.trim() || undefined,
        document_root: form.document_root?.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface-1 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">Add Project</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-500 hover:bg-white/5 hover:text-gray-300"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs text-gray-400">Project name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="My Website"
              className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-accent-blue/60"
            />
          </div>

          {/* Path */}
          <div>
            <label className="mb-1.5 block text-xs text-gray-400">Project path *</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={form.path}
                onChange={(e) => set("path", e.target.value)}
                placeholder="/Users/you/Sites/myproject"
                className="flex-1 rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white placeholder-gray-600 font-mono focus:outline-none focus:ring-1 focus:ring-accent-blue/60"
              />
              <button
                type="button"
                onClick={pickFolder}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-xs text-gray-400 hover:bg-white/5 hover:text-gray-200"
              >
                <FolderOpen size={13} />
                Browse
              </button>
            </div>
          </div>

          {/* Local URL */}
          <div>
            <label className="mb-1.5 block text-xs text-gray-400">Local URL</label>
            <input
              type="text"
              value={form.local_url}
              onChange={(e) => set("local_url", e.target.value)}
              placeholder="http://localhost:8080"
              className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white placeholder-gray-600 font-mono focus:outline-none focus:ring-1 focus:ring-accent-blue/60"
            />
          </div>

          {/* Port */}
          <div>
            <label className="mb-1.5 block text-xs text-gray-400">Port</label>
            <input
              type="number"
              value={form.port}
              onChange={(e) => set("port", parseInt(e.target.value, 10))}
              className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent-blue/60"
            />
          </div>

          {/* Git remote */}
          <div>
            <label className="mb-1.5 block text-xs text-gray-400">
              GitHub / Git remote URL <span className="text-gray-600">(optional)</span>
            </label>
            <input
              type="text"
              value={form.git_remote}
              onChange={(e) => set("git_remote", e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white placeholder-gray-600 font-mono focus:outline-none focus:ring-1 focus:ring-accent-blue/60"
            />
          </div>

          {/* PHP version */}
          <div>
            <label className="mb-1.5 block text-xs text-gray-400">
              PHP version <span className="text-gray-600">(optional)</span>
            </label>
            <input
              type="text"
              value={form.php_version}
              onChange={(e) => set("php_version", e.target.value)}
              placeholder="8.3"
              className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-accent-blue/60"
            />
          </div>

          {/* Document root */}
          <div>
            <label className="mb-1.5 block text-xs text-gray-400">
              Web root <span className="text-gray-600">(optional)</span>
            </label>
            <input
              type="text"
              value={form.document_root}
              onChange={(e) => set("document_root", e.target.value)}
              placeholder="public, dist, frontend, htdocs …"
              className="w-full rounded-lg border border-white/10 bg-surface-2 px-3 py-2 text-sm text-white placeholder-gray-600 font-mono focus:outline-none focus:ring-1 focus:ring-accent-blue/60"
            />
            <p className="mt-1 text-[10px] text-gray-600">Subfolder served as document root (e.g. <span className="font-mono">public</span> for Laravel)</p>
          </div>

          {error && (
            <p className="rounded-md bg-accent-red/10 px-3 py-2 text-xs text-accent-red">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-white/5 px-4 py-2 text-sm text-gray-400 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-accent-blue px-4 py-2 text-sm text-white hover:bg-accent-blue/80 disabled:opacity-40"
            >
              {saving ? "Adding…" : "Add Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

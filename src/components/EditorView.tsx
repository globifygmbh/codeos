import { invoke } from "@tauri-apps/api/core";
import {
  ChevronDown,
  ChevronRight,
  File,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader,
  Save,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../stores/store";
import type { FileEntry, Project } from "../types";

// ── CodeMirror imports ────────────────────────────────────────────────────────
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { indentOnInput, syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { php } from "@codemirror/lang-php";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { sql } from "@codemirror/lang-sql";

// ── Language detection ────────────────────────────────────────────────────────

function languageExtension(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "js": case "jsx": case "mjs": case "cjs": return javascript({ jsx: true });
    case "ts": case "tsx":       return javascript({ typescript: true, jsx: true });
    case "css": case "scss": case "less": return css();
    case "html": case "htm":     return html({ matchClosingTags: true, selfClosingTags: true });
    case "php":                  return php({ baseLanguage: html() });
    case "json": case "jsonc":   return json();
    case "md": case "mdx":       return markdown();
    case "sql":                  return sql();
    default:                     return null;
  }
}

function languageLabel(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    js: "JavaScript", jsx: "JSX", ts: "TypeScript", tsx: "TSX",
    css: "CSS", scss: "SCSS", less: "LESS",
    html: "HTML", htm: "HTML", php: "PHP",
    json: "JSON", jsonc: "JSON", md: "Markdown", mdx: "MDX",
    sql: "SQL", sh: "Shell", bash: "Shell", env: "ENV",
    xml: "XML", yaml: "YAML", yml: "YAML", txt: "Text",
    htaccess: "Apache", gitignore: "GitIgnore",
  };
  return map[ext] ?? ext.toUpperCase() || "Plain text";
}

function fileIcon(entry: FileEntry): string {
  if (entry.is_dir) return "";
  const ext = entry.extension ?? "";
  const color: Record<string, string> = {
    js: "text-yellow-400", jsx: "text-yellow-400",
    ts: "text-blue-400", tsx: "text-blue-400",
    css: "text-sky-400", scss: "text-pink-400",
    html: "text-orange-400", htm: "text-orange-400",
    php: "text-purple-400",
    json: "text-green-400",
    md: "text-slate-400",
    sql: "text-teal-400",
    env: "text-yellow-600",
  };
  return color[ext] ?? "text-[var(--text-muted)]";
}

// ── Sizes ─────────────────────────────────────────────────────────────────────

function fmtSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

// ── File tree node ────────────────────────────────────────────────────────────

interface TreeNodeProps {
  entry: FileEntry;
  depth: number;
  projectId: string;
  activePath: string | null;
  onOpenFile: (entry: FileEntry) => void;
}

function TreeNode({ entry, depth, projectId, activePath, onOpenFile }: TreeNodeProps) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);

  async function toggleDir() {
    if (!entry.is_dir) return;
    if (!open) {
      setLoading(true);
      try {
        const result = await invoke<FileEntry[]>("list_project_files", {
          projectId,
          subpath: entry.path,
        });
        setChildren(result);
        setOpen(true);
      } catch (e) {
        useStore.getState().setGlobalError(String(e));
      } finally {
        setLoading(false);
      }
    } else {
      setOpen(false);
    }
  }

  const isActive = !entry.is_dir && activePath === entry.path;
  const indent = depth * 12;

  return (
    <div>
      <button
        onClick={() => entry.is_dir ? toggleDir() : onOpenFile(entry)}
        className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs transition ${
          isActive
            ? "bg-accent-blue/15 text-accent-blue"
            : "text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
        }`}
        style={{ paddingLeft: `${8 + indent}px` }}
      >
        {entry.is_dir ? (
          <>
            {loading ? (
              <Loader size={11} className="shrink-0 animate-spin" />
            ) : open ? (
              <ChevronDown size={11} className="shrink-0 text-[var(--text-muted)]" />
            ) : (
              <ChevronRight size={11} className="shrink-0 text-[var(--text-muted)]" />
            )}
            {open
              ? <FolderOpen size={12} className="shrink-0 text-accent-yellow" />
              : <Folder      size={12} className="shrink-0 text-accent-yellow" />
            }
          </>
        ) : (
          <File size={12} className={`shrink-0 ${fileIcon(entry)}`} />
        )}
        <span className="truncate">{entry.name}</span>
        {!entry.is_dir && entry.size !== null && (
          <span className="ml-auto shrink-0 text-[9px] text-[var(--text-muted)]">{fmtSize(entry.size)}</span>
        )}
      </button>

      {entry.is_dir && open && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              projectId={projectId}
              activePath={activePath}
              onOpenFile={onOpenFile}
            />
          ))}
          {children.length === 0 && (
            <p className="py-1 text-[10px] text-[var(--text-muted)]" style={{ paddingLeft: `${20 + indent}px` }}>
              Leer
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── CodeMirror component ──────────────────────────────────────────────────────

interface EditorProps {
  content: string;
  filename: string;
  onChange: (value: string) => void;
  isDark: boolean;
}

function CodeEditor({ content, filename, onChange, isDark }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef      = useRef<EditorView | null>(null);
  const onChangeRef  = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const langExt = languageExtension(filename);
    const extensions: any[] = [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      foldGutter(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, indentWithTab]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      EditorView.theme({
        "&": { height: "100%", fontSize: "13px" },
        ".cm-scroller": { fontFamily: "ui-monospace, 'JetBrains Mono', 'Fira Code', monospace", overflow: "auto" },
      }),
    ];

    if (isDark) {
      extensions.push(oneDark);
    } else {
      extensions.push(syntaxHighlighting(defaultHighlightStyle));
    }

    if (langExt) extensions.push(langExt);

    const state = EditorState.create({ doc: content, extensions });
    const view  = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [filename, isDark]); // recreate when file changes

  // Sync external content changes (file opened) without recreating
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== content) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: content },
      });
    }
  }, [content]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}

// ── Main EditorView component ─────────────────────────────────────────────────

export default function EditorView() {
  const { projects, selectedProjectId, selectProject } = useStore();

  const [rootFiles, setRootFiles] = useState<FileEntry[]>([]);
  const [rootLoading, setRootLoading] = useState(false);
  const [openedFile, setOpenedFile] = useState<FileEntry | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [editedContent, setEditedContent] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New file/folder dialog
  const [newEntryParent, setNewEntryParent] = useState("");
  const [newEntryName, setNewEntryName] = useState("");
  const [newEntryIsDir, setNewEntryIsDir] = useState(false);
  const [showNewEntry, setShowNewEntry] = useState(false);

  const isDark = document.documentElement.classList.contains("dark") ||
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const project = projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null;

  useEffect(() => {
    if (project) loadRoot(project);
  }, [project?.id]);

  async function loadRoot(p: Project) {
    setRootLoading(true);
    setError(null);
    try {
      const files = await invoke<FileEntry[]>("list_project_files", { projectId: p.id, subpath: null });
      setRootFiles(files);
    } catch (e) {
      setError(String(e));
    } finally {
      setRootLoading(false);
    }
  }

  async function openFile(entry: FileEntry) {
    if (isDirty) {
      if (!confirm(`"${openedFile?.name}" hat ungespeicherte Änderungen. Trotzdem wechseln?`)) return;
    }
    setFileLoading(true);
    setError(null);
    try {
      const content = await invoke<string>("read_project_file", {
        projectId: project!.id,
        relativePath: entry.path,
      });
      setOpenedFile(entry);
      setFileContent(content);
      setEditedContent(content);
      setIsDirty(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setFileLoading(false);
    }
  }

  async function saveFile() {
    if (!openedFile || !project) return;
    setSaving(true);
    setError(null);
    try {
      await invoke("write_project_file", {
        projectId: project.id,
        relativePath: openedFile.path,
        content: editedContent,
      });
      setFileContent(editedContent);
      setIsDirty(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateEntry() {
    if (!project || !newEntryName.trim()) return;
    const rel = newEntryParent
      ? `${newEntryParent}/${newEntryName.trim()}`
      : newEntryName.trim();
    try {
      await invoke("create_project_entry", {
        projectId: project.id,
        relativePath: rel,
        isDir: newEntryIsDir,
      });
      setShowNewEntry(false);
      setNewEntryName("");
      await loadRoot(project);
    } catch (e) {
      setError(String(e));
    }
  }


  function handleEditorChange(value: string) {
    setEditedContent(value);
    setIsDirty(value !== fileContent);
  }

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      saveFile();
    }
  }, [saveFile]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (!project) {
    return (
      <div className="view-enter flex h-full items-center justify-center">
        <p className="text-sm text-[var(--text-muted)]">Kein Projekt ausgewählt.</p>
      </div>
    );
  }

  return (
    <div className="view-enter flex h-full overflow-hidden">
      {/* ── Sidebar: project selector + file tree ─────────────────────────── */}
      <div className="flex w-52 shrink-0 flex-col border-r" style={{ borderColor: "var(--border-color)" }}>
        {/* Project selector */}
        <div className="border-b p-2" style={{ borderColor: "var(--border-color)" }}>
          <select
            value={project.id}
            onChange={(e) => { selectProject(e.target.value); }}
            className="w-full rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
            style={{ background: "var(--surface-2)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between border-b px-2 py-1.5"
          style={{ borderColor: "var(--border-color)" }}>
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Dateien</span>
          <div className="flex gap-0.5">
            <button
              onClick={() => { setNewEntryIsDir(false); setNewEntryName(""); setNewEntryParent(""); setShowNewEntry(true); }}
              title="Neue Datei"
              className="rounded p-1 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
            >
              <FilePlus size={12} />
            </button>
            <button
              onClick={() => { setNewEntryIsDir(true); setNewEntryName(""); setNewEntryParent(""); setShowNewEntry(true); }}
              title="Neuer Ordner"
              className="rounded p-1 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
            >
              <FolderPlus size={12} />
            </button>
          </div>
        </div>

        {/* New entry input */}
        {showNewEntry && (
          <div className="border-b p-2" style={{ borderColor: "var(--border-color)" }}>
            <div className="flex items-center gap-1 mb-1">
              {newEntryIsDir ? <Folder size={11} className="text-accent-yellow" /> : <File size={11} className="text-[var(--text-muted)]" />}
              <span className="text-[10px] text-[var(--text-secondary)]">
                {newEntryIsDir ? "Neuer Ordner" : "Neue Datei"}
              </span>
            </div>
            <input
              autoFocus
              type="text"
              value={newEntryName}
              onChange={(e) => setNewEntryName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreateEntry(); if (e.key === "Escape") setShowNewEntry(false); }}
              placeholder={newEntryIsDir ? "ordnername" : "datei.php"}
              className="w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
              style={{ background: "var(--surface-2)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
            />
            <div className="mt-1 flex gap-1">
              <button onClick={handleCreateEntry}
                className="flex-1 rounded bg-accent-blue/15 py-1 text-[10px] text-accent-blue hover:bg-accent-blue/25">
                Erstellen
              </button>
              <button onClick={() => setShowNewEntry(false)}
                className="rounded px-2 py-1 text-[10px] text-[var(--text-muted)] hover:bg-[var(--surface-3)]">
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {/* File tree */}
        <div className="flex-1 overflow-y-auto py-1">
          {rootLoading ? (
            <div className="flex justify-center py-8">
              <Loader size={16} className="animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            rootFiles.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                projectId={project.id}
                activePath={openedFile?.path ?? null}
                onOpenFile={openFile}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Editor pane ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {openedFile ? (
          <>
            {/* Tab bar */}
            <div className="flex shrink-0 items-center border-b"
              style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
              <div className="flex items-center gap-2 border-r px-4 py-2"
                style={{ borderColor: "var(--border-color)" }}>
                <File size={12} className={fileIcon(openedFile)} />
                <span className="text-xs font-medium text-[var(--text-primary)]">
                  {openedFile.path}
                </span>
                {isDirty && (
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-yellow" title="Ungespeicherte Änderungen" />
                )}
                <button
                  onClick={() => {
                    if (isDirty && !confirm("Ungespeicherte Änderungen. Trotzdem schließen?")) return;
                    setOpenedFile(null); setFileContent(""); setEditedContent(""); setIsDirty(false);
                  }}
                  className="rounded p-0.5 text-[var(--text-muted)] hover:text-accent-red"
                >
                  <X size={11} />
                </button>
              </div>

              <div className="flex flex-1 items-center justify-end gap-3 px-4">
                <span className="text-[10px] text-[var(--text-muted)]">{languageLabel(openedFile.name)}</span>
                <button
                  onClick={saveFile}
                  disabled={!isDirty || saving}
                  title="Speichern (⌘S)"
                  className="flex items-center gap-1.5 rounded-lg bg-accent-blue/10 px-3 py-1 text-xs text-accent-blue hover:bg-accent-blue/20 disabled:opacity-40"
                >
                  {saving ? <Loader size={11} className="animate-spin" /> : <Save size={11} />}
                  {saving ? "Wird gespeichert…" : isDirty ? "Speichern ⌘S" : "Gespeichert"}
                </button>
              </div>
            </div>

            {/* CodeMirror */}
            {fileLoading ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader size={20} className="animate-spin text-[var(--text-muted)]" />
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <CodeEditor
                  content={editedContent}
                  filename={openedFile.name}
                  onChange={handleEditorChange}
                  isDark={isDark}
                />
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-2)] text-[var(--text-muted)]">
              <File size={22} />
            </div>
            <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">Datei-Editor</p>
            <p className="text-xs text-[var(--text-secondary)]">
              Datei aus dem Baum links öffnen
            </p>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              ⌘S zum Speichern · PHP, HTML, CSS, JS, JSON, SQL, Markdown
            </p>
          </div>
        )}

        {/* Error bar */}
        {error && (
          <div className="shrink-0 border-t px-4 py-2 text-xs text-accent-red"
            style={{ borderColor: "var(--border-color)" }}>
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Schließen</button>
          </div>
        )}
      </div>
    </div>
  );
}

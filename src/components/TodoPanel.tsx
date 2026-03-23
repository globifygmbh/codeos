import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../stores/store";
import type { Project, TodoItem } from "../types";

interface Props {
  project: Project;
}

// ── Single todo row ───────────────────────────────────────────────────────────

function TodoRow({ item, projectId }: { item: TodoItem; projectId: string }) {
  const { updateTodo, deleteTodo } = useStore();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function saveEdit() {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== item.text) {
      updateTodo(projectId, item.id, trimmed, undefined);
    }
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") saveEdit();
    if (e.key === "Escape") { setEditText(item.text); setEditing(false); }
  }

  return (
    <div className={`group flex items-start gap-3 rounded-lg px-3 py-2 transition hover:bg-[var(--surface-2)] ${item.completed ? "opacity-60" : ""}`}>
      {/* Checkbox */}
      <button
        onClick={() => updateTodo(projectId, item.id, undefined, !item.completed)}
        className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-md border transition ${
          item.completed
            ? "border-accent-green bg-accent-green/15 text-accent-green"
            : "border-[var(--border-color)] bg-[var(--surface-2)] hover:border-accent-blue"
        }`}
        style={{ width: 18, height: 18, minWidth: 18 }}
      >
        {item.completed && <Check size={10} />}
      </button>

      {/* Text or edit input */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={handleKeyDown}
            className="w-full rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
            style={{ color: "var(--text-primary)" }}
          />
        ) : (
          <p className={`text-sm leading-relaxed ${item.completed ? "line-through text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>
            {item.text}
          </p>
        )}
      </div>

      {/* Actions (visible on hover) */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
        {!editing && (
          <button
            onClick={() => { setEditText(item.text); setEditing(true); }}
            className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          >
            <Pencil size={11} />
          </button>
        )}
        {editing && (
          <button
            onClick={() => { setEditText(item.text); setEditing(false); }}
            className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          >
            <X size={11} />
          </button>
        )}
        <button
          onClick={() => deleteTodo(projectId, item.id)}
          className="rounded p-1 text-[var(--text-muted)] hover:text-accent-red"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function TodoPanel({ project }: Props) {
  const { addTodo } = useStore();
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const todos    = project.todos ?? [];
  const open     = todos.filter((t) => !t.completed);
  const done     = todos.filter((t) => t.completed);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  async function handleAdd() {
    const text = newText.trim();
    if (!text) return;
    await addTodo(project.id, text);
    setNewText("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleAdd();
    if (e.key === "Escape") { setNewText(""); setAdding(false); }
  }

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--border-color)" }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2.5"
        style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Todos</span>
          {open.length > 0 && (
            <span className="rounded-full bg-accent-blue/15 px-1.5 py-0.5 text-[10px] text-accent-blue font-medium">
              {open.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-accent-blue"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      {/* Add input */}
      {adding && (
        <div className="border-b px-4 py-2.5" style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onBlur={() => { if (!newText.trim()) setAdding(false); }}
              onKeyDown={handleKeyDown}
              placeholder="New task…"
              className="flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
              style={{ background: "var(--surface-2)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
            />
            <button
              onClick={handleAdd}
              disabled={!newText.trim()}
              className="rounded-lg bg-accent-blue px-3 py-1.5 text-xs text-white hover:bg-accent-blue/80 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Open todos */}
      <div className="px-1 py-1" style={{ background: "var(--surface-1)" }}>
        {open.length === 0 && !adding && (
          <p className="py-3 text-center text-xs text-[var(--text-muted)]">
            No open tasks — click + Add to create one.
          </p>
        )}
        {open.map((t) => (
          <TodoRow key={t.id} item={t} projectId={project.id} />
        ))}
      </div>

      {/* Completed todos (collapsible) */}
      {done.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border-color)" }}>
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)] transition"
          >
            <Check size={11} className="text-accent-green" />
            {done.length} completed
            <span className="ml-auto">{showCompleted ? "▲" : "▼"}</span>
          </button>
          {showCompleted && (
            <div className="px-1 pb-1" style={{ background: "var(--surface-1)" }}>
              {done.map((t) => (
                <TodoRow key={t.id} item={t} projectId={project.id} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

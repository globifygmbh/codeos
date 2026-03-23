import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Bot,
  ClipboardCopy,
  Database,
  Eye,
  EyeOff,
  Globe,
  Info,
  KeyRound,
  Loader,
  Plus,
  Server,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useStore } from "../stores/store";
import type { CredentialCategory, CredentialEntry, CredentialField, Project } from "../types";

interface Props {
  project: Project;
}

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORIES: { id: CredentialCategory; label: string; icon: React.ReactNode; color: string }[] = [
  { id: "login",    label: "Login",    icon: <Globe size={12} />,     color: "text-accent-blue" },
  { id: "database", label: "Datenbank",icon: <Database size={12} />,  color: "text-accent-purple" },
  { id: "api",      label: "API Key",  icon: <KeyRound size={12} />,  color: "text-accent-yellow" },
  { id: "env",      label: "ENV",      icon: <Server size={12} />,    color: "text-accent-green" },
  { id: "note",     label: "Notiz",    icon: <StickyNote size={12} />,color: "text-[var(--text-secondary)]" },
];

function categoryConfig(cat: CredentialCategory) {
  return CATEGORIES.find((c) => c.id === cat) ?? CATEGORIES[4];
}

// ── Empty field template per category ────────────────────────────────────────

function defaultFields(cat: CredentialCategory): CredentialField[] {
  switch (cat) {
    case "login":    return [{ key: "URL", value: "", secret: false }, { key: "Benutzername", value: "", secret: false }, { key: "Passwort", value: "", secret: true }];
    case "database": return [{ key: "Host", value: "127.0.0.1", secret: false }, { key: "Port", value: "3306", secret: false }, { key: "Datenbank", value: "", secret: false }, { key: "Benutzername", value: "root", secret: false }, { key: "Passwort", value: "", secret: true }];
    case "api":      return [{ key: "Service", value: "", secret: false }, { key: "API Key", value: "", secret: true }];
    case "env":      return [{ key: "Variable", value: "", secret: false }, { key: "Wert", value: "", secret: true }];
    case "note":     return [{ key: "Notiz", value: "", secret: false }];
  }
}

// ── Single field row ──────────────────────────────────────────────────────────

function FieldRow({ field }: { field: CredentialField }) {
  const [shown, setShown] = useState(!field.secret);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(field.value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 shrink-0 text-[var(--text-muted)]">{field.key}</span>
      <span className={`flex-1 truncate font-mono ${field.secret && !shown ? "tracking-widest text-[var(--text-muted)]" : "text-[var(--text-primary)]"}`}>
        {field.secret && !shown ? "••••••••" : field.value || <em className="text-[var(--text-muted)]">leer</em>}
      </span>
      {field.secret && (
        <button onClick={() => setShown((v) => !v)} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
          {shown ? <EyeOff size={11} /> : <Eye size={11} />}
        </button>
      )}
      {field.value && (
        <button onClick={copy} title="Kopieren" className="shrink-0 text-[var(--text-muted)] hover:text-accent-blue">
          {copied ? <span className="text-accent-green text-[10px]">✓</span> : <ClipboardCopy size={11} />}
        </button>
      )}
    </div>
  );
}

// ── Credential card ───────────────────────────────────────────────────────────

function CredentialCard({ entry, projectId, onDelete }: { entry: CredentialEntry; projectId: string; onDelete: () => void }) {
  const cfg = categoryConfig(entry.category);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await invoke("delete_credential", { projectId, credentialId: entry.id });
      onDelete();
    } catch (e) {
      useStore.getState().setGlobalError(String(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--border-color)", background: "var(--surface-2)" }}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cfg.color}>{cfg.icon}</span>
          <span className="text-xs font-semibold text-[var(--text-primary)]">{entry.label}</span>
          <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]">{cfg.label}</span>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded p-1 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-accent-red disabled:opacity-40"
        >
          {deleting ? <Loader size={11} className="animate-spin" /> : <Trash2 size={11} />}
        </button>
      </div>
      <div className="space-y-1.5">
        {entry.fields.map((field, i) => (
          <FieldRow key={i} field={field} />
        ))}
      </div>
    </div>
  );
}

// ── Add credential form ───────────────────────────────────────────────────────

interface AddFormProps {
  projectId: string;
  onAdded: () => void;
  onCancel: () => void;
}

function AddCredentialForm({ projectId, onAdded, onCancel }: AddFormProps) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<CredentialCategory>("login");
  const [fields, setFields] = useState<CredentialField[]>(defaultFields("login"));
  const [saving, setSaving] = useState(false);

  function handleCategoryChange(cat: CredentialCategory) {
    setCategory(cat);
    setFields(defaultFields(cat));
  }

  function updateField(i: number, key: keyof CredentialField, value: string | boolean) {
    setFields((prev) => prev.map((f, idx) => idx === i ? { ...f, [key]: value } : f));
  }

  function addField() {
    setFields((prev) => [...prev, { key: "", value: "", secret: false }]);
  }

  function removeField(i: number) {
    setFields((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await invoke("upsert_credential", {
        projectId,
        entry: {
          id: crypto.randomUUID(),
          label: label.trim(),
          category,
          fields,
          created_at: new Date().toISOString(),
        },
      });
      onAdded();
    } catch (e) {
      useStore.getState().setGlobalError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--border-color)", background: "var(--surface-2)" }}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold text-[var(--text-primary)]">Neuer Eintrag</span>
        <button onClick={onCancel} className="text-[var(--text-muted)] hover:text-accent-red"><X size={13} /></button>
      </div>

      {/* Label */}
      <input
        autoFocus
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Bezeichnung (z.B. Admin Login)"
        className="mb-2 w-full rounded border px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
      />

      {/* Category */}
      <div className="mb-3 flex gap-1 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => handleCategoryChange(cat.id)}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] transition ${
              category === cat.id
                ? "bg-accent-blue/15 text-accent-blue font-medium"
                : "text-[var(--text-muted)] hover:bg-[var(--surface-3)]"
            }`}
          >
            {cat.icon} {cat.label}
          </button>
        ))}
      </div>

      {/* Fields */}
      <div className="space-y-1.5 mb-3">
        {fields.map((field, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              type="text"
              value={field.key}
              onChange={(e) => updateField(i, "key", e.target.value)}
              placeholder="Feld"
              className="w-24 rounded border px-1.5 py-1 text-[10px] focus:outline-none"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
            />
            <input
              type={field.secret ? "password" : "text"}
              value={field.value}
              onChange={(e) => updateField(i, "value", e.target.value)}
              placeholder="Wert"
              className="flex-1 rounded border px-1.5 py-1 text-[10px] focus:outline-none"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
            />
            <button
              onClick={() => updateField(i, "secret", !field.secret)}
              title={field.secret ? "Nicht geheim" : "Geheim"}
              className={`rounded p-1 text-[10px] ${field.secret ? "text-accent-yellow" : "text-[var(--text-muted)]"} hover:bg-[var(--surface-3)]`}
            >
              {field.secret ? <EyeOff size={10} /> : <Eye size={10} />}
            </button>
            <button onClick={() => removeField(i)} className="rounded p-1 text-[var(--text-muted)] hover:text-accent-red">
              <X size={10} />
            </button>
          </div>
        ))}
        <button
          onClick={addField}
          className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-accent-blue"
        >
          <Plus size={10} /> Feld hinzufügen
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={!label.trim() || saving}
          className="flex-1 rounded-lg bg-accent-blue/15 py-1.5 text-xs text-accent-blue hover:bg-accent-blue/25 disabled:opacity-40"
        >
          {saving ? <Loader size={11} className="animate-spin inline mr-1" /> : null}
          Speichern
        </button>
        <button onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-3)]">
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CredentialsPanel({ project }: Props) {
  const { loadProjects } = useStore();
  const [entries, setEntries] = useState<CredentialEntry[]>(project.credentials ?? []);
  const [showAdd, setShowAdd] = useState(false);

  // Reload when agent saves a credential via tool use
  useEffect(() => {
    const unlisten = listen<{ project_id: string }>("credential-saved", (ev) => {
      if (ev.payload.project_id === project.id) {
        loadProjects().then(() => {
          invoke<CredentialEntry[]>("get_credentials", { projectId: project.id })
            .then(setEntries)
            .catch(() => {});
        });
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [project.id]);

  // Sync when project prop changes (after loadProjects)
  useEffect(() => {
    setEntries(project.credentials ?? []);
  }, [project.credentials]);

  async function reload() {
    try {
      const result = await invoke<CredentialEntry[]>("get_credentials", { projectId: project.id });
      setEntries(result);
    } catch (_) {}
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Info size={13} className="text-[var(--text-muted)]" />
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {entries.length === 0 ? "Keine Zugänge gespeichert" : `${entries.length} Eintrag${entries.length !== 1 ? "e" : ""}`}
          </span>
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-accent-blue/10 px-2.5 py-1.5 text-xs text-accent-blue hover:bg-accent-blue/20"
        >
          <Plus size={11} /> Hinzufügen
        </button>
      </div>

      {/* Claude hint (shown when empty) */}
      {entries.length === 0 && !showAdd && (
        <div className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs"
          style={{ borderColor: "var(--border-color)", background: "var(--surface-2)", color: "var(--text-secondary)" }}>
          <Bot size={13} className="mt-0.5 shrink-0 text-accent-purple" />
          <span>
            Claude speichert hier automatisch alle Zugangsdaten die er erstellt — Logins, Datenbanken, API Keys.
            Du kannst auch manuell Einträge hinzufügen.
          </span>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <AddCredentialForm
          projectId={project.id}
          onAdded={() => { setShowAdd(false); reload(); loadProjects(); }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* Credential cards */}
      {entries.map((entry) => (
        <CredentialCard
          key={entry.id}
          entry={entry}
          projectId={project.id}
          onDelete={() => { reload(); loadProjects(); }}
        />
      ))}
    </div>
  );
}

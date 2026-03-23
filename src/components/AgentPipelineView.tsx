import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Code2,
  FlaskConical,
  Layers,
  Loader,
  Play,
  RotateCcw,
  Terminal,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../stores/store";
import type { PipelineMode, PipelinePhase, PipelinePhaseStatus } from "../types";
import MarkdownMessage from "./MarkdownMessage";

// ── Agent / reviewer catalogue ────────────────────────────────────────────────

interface ReviewerDef { id: string; label: string; desc: string }

const ALL_REVIEWERS: ReviewerDef[] = [
  { id: "test",          label: "Test",          desc: "UI & Funktions-Tests" },
  { id: "security",      label: "Security",      desc: "Auth, XSS, CSRF, SQLi" },
  { id: "ux",            label: "UX/Product",    desc: "User Flows & Jobs-to-be-done" },
  { id: "accessibility", label: "Accessibility", desc: "WCAG, Keyboard, ARIA" },
  { id: "performance",   label: "Performance",   desc: "Bundle, N+1, Core Web Vitals" },
  { id: "data",          label: "Data/DB",       desc: "Schema, Migrations, Indizes" },
  { id: "api",           label: "API",           desc: "Contracts, Pagination, Errors" },
  { id: "devops",        label: "DevOps",        desc: "CI/CD, Docker, Monitoring" },
  { id: "refactor",      label: "Refactor",      desc: "Duplikate, Dead Code, Naming" },
  { id: "seo",           label: "SEO",           desc: "Meta, Schema, Crawlability" },
  { id: "conversion",    label: "Conversion",    desc: "CTA, Funnel, Trust Signals" },
  { id: "rbac",          label: "RBAC",          desc: "Permissions, Multi-Tenant" },
  { id: "table_workflow",label: "Table/Workflow",desc: "Filter, Bulk Actions, Export" },
  { id: "forms",         label: "Forms",         desc: "Validation, Autosave, Dirty State" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return crypto.randomUUID(); }

function phaseIcon(id: string, status: PipelinePhaseStatus) {
  if (status === "running") return <Loader size={13} className="animate-spin text-accent-blue" />;
  if (status === "done" || status === "pass" || status === "fixed")
    return <CheckCircle size={13} className="text-accent-green" />;
  if (status === "needs_changes") return <AlertTriangle size={13} className="text-accent-yellow" />;
  if (status === "error") return <XCircle size={13} className="text-accent-red" />;
  // pending / skipped
  if (id === "planner") return <Layers size={13} className="text-[var(--text-muted)]" />;
  if (id === "code" || id === "fix") return <Code2 size={13} className="text-[var(--text-muted)]" />;
  return <FlaskConical size={13} className="text-[var(--text-muted)]" />;
}

function statusBadge(s: PipelinePhaseStatus) {
  const map: Record<PipelinePhaseStatus, { label: string; cls: string }> = {
    pending:       { label: "Wartend",         cls: "text-[var(--text-muted)] bg-[var(--surface-3)]" },
    running:       { label: "Läuft…",          cls: "text-accent-blue bg-accent-blue/10" },
    done:          { label: "Fertig",           cls: "text-accent-green bg-accent-green/10" },
    pass:          { label: "Bestanden",        cls: "text-accent-green bg-accent-green/10" },
    fixed:         { label: "Behoben",          cls: "text-accent-blue bg-accent-blue/10" },
    needs_changes: { label: "Änderungen nötig", cls: "text-accent-yellow bg-accent-yellow/10" },
    error:         { label: "Fehler",           cls: "text-accent-red bg-accent-red/10" },
    skipped:       { label: "Übersprungen",     cls: "text-[var(--text-muted)] bg-[var(--surface-3)]" },
  };
  const { label, cls } = map[s] ?? map["pending"];
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${cls}`}>{label}</span>;
}

// ── Phase card ────────────────────────────────────────────────────────────────

function PhaseCard({ phase }: { phase: PipelinePhase }) {
  const [expanded, setExpanded] = useState(false);
  const text = phase.chunks.join("") || phase.text;
  const hasContent = text.trim().length > 0;

  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={() => hasContent && setExpanded(v => !v)}
      >
        {phaseIcon(phase.id, phase.status)}
        <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">{phase.name}</span>
        {statusBadge(phase.status)}
        {hasContent && (
          <span className="text-[var(--text-muted)] ml-1">
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        )}
      </button>

      {expanded && hasContent && (
        <div className="border-t px-4 pb-4 pt-3 max-h-96 overflow-y-auto"
          style={{ borderColor: "var(--border-color)" }}>
          {phase.status === "running"
            ? <pre className="whitespace-pre-wrap font-mono text-xs text-[var(--text-secondary)] leading-relaxed">{text}</pre>
            : <MarkdownMessage content={text} streaming={false} />
          }
        </div>
      )}
    </div>
  );
}

// ── Tool call indicator ───────────────────────────────────────────────────────

interface ToolCallItem { call_id: string; command: string; phase: string; stdout?: string; stderr?: string; exit_code?: number; running: boolean }

function ToolRow({ tc }: { tc: ToolCallItem }) {
  const success = tc.exit_code === 0;
  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs"
      style={{ borderColor: "var(--border-color)", background: "var(--surface-2)" }}>
      {tc.running
        ? <Loader size={10} className="animate-spin text-accent-purple" />
        : success ? <CheckCircle size={10} className="text-accent-green" /> : <XCircle size={10} className="text-accent-red" />
      }
      <Terminal size={10} className="text-[var(--text-muted)]" />
      <code className="flex-1 truncate font-mono text-[10px] text-[var(--text-primary)]">{tc.command}</code>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AgentPipelineView() {
  const { projects, chatModel } = useStore();

  const [task, setTask] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [pipelineMode, setPipelineMode] = useState<PipelineMode>("standard");
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>(["test", "security", "ux"]);
  const [running, setRunning] = useState(false);
  const [phases, setPhases] = useState<PipelinePhase[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallItem[]>([]);
  const [doneStatus, setDoneStatus] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [phases, toolCalls]);

  const selectedProject = projects.find(p => p.id === projectId) ?? null;

  function toggleReviewer(id: string) {
    setSelectedReviewers(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  }

  function reset() {
    setPhases([]);
    setToolCalls([]);
    setDoneStatus(null);
  }

  async function startPipeline() {
    if (!task.trim() || running) return;
    reset();
    setRunning(true);

    const streamId = uid();

    const unlistenPhase = await listen<{ id: string; name: string; status: PipelinePhaseStatus; text: string }>(
      `pipeline-phase-${streamId}`, (ev) => {
        const { id, name, status, text } = ev.payload;
        setPhases(prev => {
          const existing = prev.findIndex(p => p.id === id);
          if (existing >= 0) {
            const updated = [...prev];
            updated[existing] = { ...updated[existing], status, text: text || updated[existing].text };
            return updated;
          }
          return [...prev, { id, name, status, text, chunks: [] }];
        });
      }
    );

    const unlistenChunk = await listen<string>(`pipeline-chunk-${streamId}`, (ev) => {
      setPhases(prev => {
        const runningPhase = [...prev].reverse().find((p: PipelinePhase) => p.status === "running");
        if (!runningPhase) return prev;
        return prev.map(p =>
          p.id === runningPhase.id ? { ...p, chunks: [...p.chunks, ev.payload] } : p
        );
      });
    });

    const unlistenToolCall = await listen<{ call_id: string; command: string; phase: string }>(
      `pipeline-tool-call-${streamId}`, (ev) => {
        setToolCalls(prev => [...prev, { ...ev.payload, running: true }]);
      }
    );

    const unlistenToolResult = await listen<{ call_id: string; stdout: string; stderr: string; exit_code: number }>(
      `pipeline-tool-result-${streamId}`, (ev) => {
        setToolCalls(prev => prev.map(tc =>
          tc.call_id === ev.payload.call_id
            ? { ...tc, ...ev.payload, running: false }
            : tc
        ));
      }
    );

    const unlistenDone = await listen<{ status: string }>(`pipeline-done-${streamId}`, (ev) => {
      setDoneStatus(ev.payload.status);
    });

    try {
      await invoke("run_agent_pipeline", {
        task: task.trim(),
        projectPath: selectedProject?.path ?? null,
        projectId: selectedProject?.id ?? null,
        projectName: selectedProject?.name ?? null,
        model: chatModel,
        pipelineMode,
        reviewers: selectedReviewers,
        streamId,
      });
    } catch (e) {
      useStore.getState().setGlobalError("Pipeline Fehler: " + String(e));
    } finally {
      unlistenPhase(); unlistenChunk(); unlistenToolCall(); unlistenToolResult(); unlistenDone();
      setRunning(false);
    }
  }

  const modeConfig = {
    fast:     { label: "Fast",     desc: "Planer + Code + Test",               color: "text-accent-green  bg-accent-green/10"  },
    standard: { label: "Standard", desc: "Planer + Code + ausgewählte Reviews", color: "text-accent-blue   bg-accent-blue/10"   },
    critical: { label: "Critical", desc: "Planer + Code + ALLE Reviews + Fix",  color: "text-accent-red    bg-accent-red/10"    },
  };

  return (
    <div className="view-enter flex h-full flex-col">
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b px-6 py-4" style={{ borderColor: "var(--border-color)" }}>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent-purple/15 text-accent-purple">
            <Layers size={16} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Agent Pipeline</h2>
            <p className="text-xs text-[var(--text-muted)]">Planer → Code Agent → Reviewer(s) → Fix</p>
          </div>
          {(phases.length > 0 || doneStatus) && (
            <button onClick={reset} className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-2)]">
              <RotateCcw size={11} /> Neu
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-0">
        {/* ── Config sidebar ──────────────────────────────────────────────────── */}
        <div className="w-72 shrink-0 overflow-y-auto border-r p-4 flex flex-col gap-4"
          style={{ borderColor: "var(--border-color)" }}>

          {/* Task */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wide">
              Task / Feature
            </label>
            <textarea
              value={task}
              onChange={e => setTask(e.target.value)}
              placeholder="Beschreibe was gebaut oder überprüft werden soll…"
              rows={4}
              className="w-full rounded-xl border px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent-blue/50 resize-none"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
            />
          </div>

          {/* Project */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wide">
              Projekt
            </label>
            <select
              value={projectId}
              onChange={e => setProjectId(e.target.value)}
              className="w-full rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
            >
              <option value="">Kein Projekt</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Pipeline Mode */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wide">
              Pipeline Mode
            </label>
            <div className="flex flex-col gap-1">
              {(["fast", "standard", "critical"] as PipelineMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setPipelineMode(m)}
                  className={`flex items-start gap-2 rounded-xl border p-2.5 text-left transition ${
                    pipelineMode === m ? "border-accent-blue/40" : ""
                  }`}
                  style={{
                    borderColor: pipelineMode === m ? undefined : "var(--border-color)",
                    background: pipelineMode === m ? "var(--surface-2)" : "var(--surface-1)",
                  }}
                >
                  {m === "fast" && <Zap size={12} className="mt-0.5 shrink-0 text-accent-green" />}
                  {m === "standard" && <Layers size={12} className="mt-0.5 shrink-0 text-accent-blue" />}
                  {m === "critical" && <AlertTriangle size={12} className="mt-0.5 shrink-0 text-accent-red" />}
                  <div>
                    <div className="text-xs font-medium text-[var(--text-primary)]">{modeConfig[m].label}</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{modeConfig[m].desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Reviewer selection (only for standard mode) */}
          {pipelineMode === "standard" && (
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wide">
                Reviewer
              </label>
              <div className="flex flex-col gap-1">
                {ALL_REVIEWERS.map(r => (
                  <label key={r.id} className="flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-[var(--surface-2)]">
                    <input
                      type="checkbox"
                      checked={selectedReviewers.includes(r.id)}
                      onChange={() => toggleReviewer(r.id)}
                      className="accent-accent-blue"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[var(--text-primary)]">{r.label}</div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate">{r.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Start button */}
          <button
            onClick={startPipeline}
            disabled={!task.trim() || running}
            className="flex items-center justify-center gap-2 rounded-xl bg-accent-blue py-2.5 text-sm font-medium text-white hover:bg-accent-blue/80 disabled:opacity-40 transition"
          >
            {running ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
            {running ? "Läuft…" : "Pipeline starten"}
          </button>
        </div>

        {/* ── Pipeline execution area ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
          {phases.length === 0 && !running && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-purple/10 text-accent-purple">
                <Layers size={26} />
              </div>
              <p className="text-sm font-medium text-[var(--text-primary)]">Bereit</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)] max-w-xs">
                Beschreibe deine Task, wähle den Pipeline-Modus und starte. Planer → Code → Review → Fix.
              </p>
            </div>
          )}

          {phases.map(phase => (
            <PhaseCard key={phase.id} phase={phase} />
          ))}

          {toolCalls.length > 0 && (
            <div className="flex flex-col gap-1">
              {toolCalls.map(tc => <ToolRow key={tc.call_id} tc={tc} />)}
            </div>
          )}

          {doneStatus && (
            <div className={`flex items-center gap-3 rounded-xl border p-4 ${
              doneStatus === "done" ? "border-accent-green/30 bg-accent-green/5" :
              doneStatus === "fixed" ? "border-accent-blue/30 bg-accent-blue/5" :
              "border-accent-yellow/30 bg-accent-yellow/5"
            }`}>
              {doneStatus === "done" ? <CheckCircle size={16} className="text-accent-green" /> :
               doneStatus === "fixed" ? <Wrench size={16} className="text-accent-blue" /> :
               <AlertTriangle size={16} className="text-accent-yellow" />}
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {doneStatus === "done" ? "Pipeline erfolgreich abgeschlossen" :
                   doneStatus === "fixed" ? "Pipeline abgeschlossen — Fixes wurden angewendet" :
                   "Pipeline benötigt weitere Aufmerksamkeit"}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {phases.length} Phase(n) abgeschlossen
                </p>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

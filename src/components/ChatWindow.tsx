import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  ArrowRight,
  Camera,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Code2,
  Database,
  Eye,
  FileText,
  FlaskConical,
  GitBranch,
  Globe,
  Image,
  Layers,
  Loader,
  Lock,
  Network,
  Palette,
  Pencil,
  RotateCcw,
  Search,
  Send,
  Server,
  Shield,
  Table2,
  Terminal,
  Trash2,
  TrendingUp,
  Upload,
  Users,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../stores/store";
import type { ChatMessage, ContentBlock, ToolCall, ToolCallEvent, ToolResultEvent } from "../types";
import MarkdownMessage from "./MarkdownMessage";

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() {
  return crypto.randomUUID();
}

function getTextContent(msg: ChatMessage): string {
  if (typeof msg.content === "string") return msg.content;
  return (msg.content as ContentBlock[])
    .filter((b) => b.type === "text")
    .map((b) => (b as any).text as string)
    .join("");
}

function getImageBlocks(msg: ChatMessage): Array<{ data: string; media_type: string }> {
  if (typeof msg.content === "string") return [];
  return (msg.content as ContentBlock[])
    .filter((b) => b.type === "image")
    .map((b) => (b as any).source);
}

interface PendingImage {
  data: string;
  media_type: string;
  preview: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatWindow() {
  const {
    chatMessages,
    chatModel,
    chatModels,
    chatProjectId,
    chatStreaming,
    projects,
    gitStatuses,
    setChatModel,
    setChatProject,
    addChatMessage,
    updateLastAssistantMessage,
    upsertToolCall,
    clearChat,
    loadChatModels,
  } = useStore();

  type AgentMode =
    | "code" | "design" | "test"
    | "planning" | "ux" | "accessibility" | "security"
    | "data" | "api" | "performance" | "content"
    | "devops" | "refactor" | "seo" | "conversion"
    | "rbac" | "table_workflow" | "forms";

  interface AgentDef { id: AgentMode; label: string; icon: React.ReactNode; color: string; group: string; desc: string }

  const AGENTS: AgentDef[] = [
    // Entwicklung
    { id: "code",          label: "Code",          icon: <Code2 size={11} />,        color: "text-accent-blue",   group: "Entwicklung",  desc: "Entwickelt & deployt" },
    { id: "planning",      label: "Planung",        icon: <Layers size={11} />,       color: "text-accent-purple", group: "Entwicklung",  desc: "Architektur & Feature-Plan" },
    { id: "refactor",      label: "Refactor",       icon: <RotateCcw size={11} />,    color: "text-accent-blue",   group: "Entwicklung",  desc: "Duplikate, Dead Code, Naming" },
    // Design & UX
    { id: "design",        label: "Design",         icon: <Palette size={11} />,      color: "text-accent-purple", group: "Design & UX",  desc: "Design-Brief & Styleguide" },
    { id: "ux",            label: "UX/Product",     icon: <Users size={11} />,        color: "text-accent-purple", group: "Design & UX",  desc: "User Flows & Jobs-to-be-done" },
    { id: "content",       label: "Content",        icon: <Pencil size={11} />,       color: "text-accent-yellow", group: "Design & UX",  desc: "Texte, CTAs, Error Messages" },
    // Qualität
    { id: "test",          label: "Test",           icon: <FlaskConical size={11} />, color: "text-accent-green",  group: "Qualität",     desc: "Screenshot-Tests & UI-Checks" },
    { id: "accessibility", label: "Accessibility",  icon: <Eye size={11} />,          color: "text-accent-green",  group: "Qualität",     desc: "WCAG, Keyboard, ARIA" },
    { id: "security",      label: "Security",       icon: <Shield size={11} />,       color: "text-accent-red",    group: "Qualität",     desc: "Auth, XSS, CSRF, SQLi" },
    { id: "performance",   label: "Performance",    icon: <Zap size={11} />,          color: "text-accent-yellow", group: "Qualität",     desc: "Bundle, N+1, Core Web Vitals" },
    // Daten & API
    { id: "data",          label: "Data/DB",        icon: <Database size={11} />,     color: "text-accent-blue",   group: "Daten & API",  desc: "Schema, Migrations, Indizes" },
    { id: "api",           label: "API",            icon: <Network size={11} />,      color: "text-accent-blue",   group: "Daten & API",  desc: "Contracts, Pagination, Errors" },
    // Deployment
    { id: "devops",        label: "DevOps",         icon: <Server size={11} />,       color: "text-accent-purple", group: "Deployment",   desc: "CI/CD, Docker, Monitoring" },
    // Website
    { id: "seo",           label: "SEO",            icon: <Search size={11} />,       color: "text-accent-green",  group: "Website",      desc: "Meta, Schema, Crawlability" },
    { id: "conversion",    label: "Conversion",     icon: <TrendingUp size={11} />,   color: "text-accent-yellow", group: "Website",      desc: "CTA, Funnel, Trust Signals" },
    // Admin Panel
    { id: "rbac",          label: "RBAC",           icon: <Lock size={11} />,         color: "text-accent-red",    group: "Admin Panel",  desc: "Permissions, Multi-Tenant" },
    { id: "table_workflow",label: "Table/Workflow", icon: <Table2 size={11} />,       color: "text-accent-blue",   group: "Admin Panel",  desc: "Filter, Bulk Actions, Export" },
    { id: "forms",         label: "Forms",          icon: <ClipboardList size={11} />,color: "text-accent-purple", group: "Admin Panel",  desc: "Validation, Autosave, Dirty" },
  ];

  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [commitLoading, setCommitLoading] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>("code");
  const [testRunning, setTestRunning] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadChatModels();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  const selectedProject = projects.find((p) => p.id === chatProjectId) ?? null;
  const gitStatus = chatProjectId ? gitStatuses[chatProjectId] : null;

  async function sendMessage() {
    if ((!input.trim() && pendingImages.length === 0) || chatStreaming) return;

    const contentBlocks: ContentBlock[] = [];
    for (const img of pendingImages) {
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: img.media_type, data: img.data },
      });
    }
    if (input.trim()) {
      contentBlocks.push({ type: "text", text: input.trim() });
    }

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: contentBlocks.length === 1 && contentBlocks[0].type === "text"
        ? (contentBlocks[0] as any).text
        : contentBlocks,
    };
    addChatMessage(userMsg);
    setInput("");
    setPendingImages([]);

    const streamId = uid();
    const assistantMsg: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: "",
      streaming: true,
    };
    addChatMessage(assistantMsg);

    const unlistenChunk  = await listen<string>(`claude-chunk-${streamId}`,  (ev) => updateLastAssistantMessage(ev.payload, false));
    const unlistenDone   = await listen(`claude-done-${streamId}`,            ()    => updateLastAssistantMessage("", true));
    const unlistenError  = await listen<string>(`claude-error-${streamId}`,  (ev) => updateLastAssistantMessage(`\n\n⚠ Error: ${ev.payload}`, true));
    const unlistenTool   = await listen<ToolCallEvent>(`claude-tool-call-${streamId}`, (ev) => {
      upsertToolCall(ev.payload.call_id, { command: ev.payload.command, running: true });
    });
    const unlistenResult = await listen<ToolResultEvent>(`claude-tool-result-${streamId}`, (ev) => {
      upsertToolCall(ev.payload.call_id, {
        stdout: ev.payload.stdout,
        stderr: ev.payload.stderr,
        exit_code: ev.payload.exit_code,
        duration_ms: ev.payload.duration_ms,
        running: false,
      });
    });

    const apiMessages = useStore
      .getState()
      .chatMessages.slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      await invoke("claude_send_message", {
        messages: apiMessages,
        model: chatModel,
        projectPath: selectedProject?.path ?? null,
        projectId: selectedProject?.id ?? null,
        projectName: selectedProject?.name ?? null,
        mode: agentMode,
        streamId,
      });
    } catch (e) {
      updateLastAssistantMessage(`\n\n⚠ Error: ${String(e)}`, true);
    } finally {
      unlistenChunk(); unlistenDone(); unlistenError(); unlistenTool(); unlistenResult();
    }
  }

  async function takeScreenshot() {
    try {
      const data = await invoke<string>("take_screenshot");
      setPendingImages((prev) => [...prev, { data, media_type: "image/png", preview: `data:image/png;base64,${data}` }]);
    } catch (e) {
      useStore.getState().setGlobalError("Screenshot failed: " + String(e));
    }
  }

  async function attachImage() {
    const path = await openDialog({ multiple: false, filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }] });
    if (!path || typeof path !== "string") return;
    try {
      const result = await invoke<{ data: string; media_type: string }>("read_image_as_base64", { path });
      setPendingImages((prev) => [...prev, { data: result.data, media_type: result.media_type, preview: `data:${result.media_type};base64,${result.data}` }]);
    } catch (e) {
      useStore.getState().setGlobalError("Failed to load image: " + String(e));
    }
  }

  async function handleCommitAndPush() {
    if (!selectedProject || !commitMsg.trim()) return;
    setCommitLoading(true);
    try {
      await invoke("git_stage_all", { projectPath: selectedProject.path });
      await invoke("git_commit",    { projectPath: selectedProject.path, message: commitMsg.trim() });
      await invoke("git_push",      { projectPath: selectedProject.path });
      setCommitMsg("");
      await useStore.getState().fetchGitStatus(selectedProject.id, selectedProject.path);
    } catch (e) {
      useStore.getState().setGlobalError("Commit/push failed: " + String(e));
    } finally {
      setCommitLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  }

  // Switch to code mode and pre-fill the design brief as context
  function forwardDesignToCode() {
    const lastAssistant = [...chatMessages].reverse().find((m) => m.role === "assistant");
    const brief = lastAssistant ? getTextContent(lastAssistant) : "";
    setAgentMode("code");
    setInput(
      brief
        ? `Basierend auf folgendem Design-Brief, bitte beginne mit der Umsetzung des Projekts:\n\n${brief.slice(0, 1200)}${brief.length > 1200 ? "\n\n[…Design-Brief gekürzt…]" : ""}\n\nStarte mit der Projektstruktur, CSS-Design-System und den Hauptkomponenten.`
        : "Bitte beginne jetzt mit der Umsetzung des Projekts basierend auf dem Design-Brief."
    );
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  // Run the test agent: take screenshot(s) and ask Claude to verify the UI
  async function runTestAgent() {
    if (!selectedProject || testRunning || chatStreaming) return;
    setTestRunning(true);
    try {
      const screenshotData = await invoke<string>("take_screenshot");
      const userMsg: ChatMessage = {
        id: uid(),
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: screenshotData } },
          {
            type: "text",
            text: `Du bist ein Test-Agent für das Projekt "${selectedProject.name}". Analysiere den Screenshot des aktuellen Projekts und prüfe:\n1. Gibt es sichtbare Fehler, Layout-Probleme oder fehlende Elemente?\n2. Sieht die Oberfläche so aus, wie sie sein sollte?\n3. Gibt es Konsistenzprobleme (Farben, Abstände, Typografie)?\n\nFasse deine Befunde strukturiert zusammen. Wenn du Probleme findest, frage kurz nach, ob du sie direkt beheben sollst.`,
          },
        ],
      };
      addChatMessage(userMsg);

      const streamId = uid();
      const assistantMsg: ChatMessage = { id: uid(), role: "assistant", content: "", streaming: true };
      addChatMessage(assistantMsg);

      const unlistenChunk = await listen<string>(`claude-chunk-${streamId}`, (ev) => updateLastAssistantMessage(ev.payload, false));
      const unlistenDone  = await listen(`claude-done-${streamId}`,          ()    => updateLastAssistantMessage("", true));
      const unlistenError = await listen<string>(`claude-error-${streamId}`, (ev) => updateLastAssistantMessage(`\n\n⚠ Error: ${ev.payload}`, true));

      const apiMessages = useStore.getState().chatMessages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));

      await invoke("claude_send_message", {
        messages: apiMessages,
        model: chatModel,
        projectPath: selectedProject.path,
        projectId: selectedProject.id,
        projectName: selectedProject.name,
        mode: "test",
        streamId,
      });

      unlistenChunk(); unlistenDone(); unlistenError();
    } catch (e) {
      useStore.getState().setGlobalError("Test-Agent Fehler: " + String(e));
    } finally {
      setTestRunning(false);
    }
  }

  const currentModel = chatModels.find((m) => m.id === chatModel);

  return (
    <div className="view-enter flex h-full flex-col">
      {/* ── Top bar ───────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-b px-5 py-3"
        style={{ borderColor: "var(--border-color)" }}>

        {/* Model selector */}
        <div className="relative">
          <button
            onClick={() => setShowModelDropdown((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition hover:bg-[var(--surface-2)]"
            style={{ borderColor: "var(--border-color)", color: "var(--text-secondary)" }}
          >
            <span className="font-medium text-[var(--text-primary)]">{currentModel?.name ?? chatModel}</span>
            <ChevronDown size={11} />
          </button>
          {showModelDropdown && (
            <div className="absolute left-0 top-full z-20 mt-1 w-64 rounded-xl border shadow-xl"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-color)" }}>
              {chatModels.map((m) => (
                <button
                  key={m.id}
                  onClick={() => { setChatModel(m.id); setShowModelDropdown(false); }}
                  className={`flex w-full flex-col items-start px-3 py-2.5 text-left text-sm transition first:rounded-t-xl last:rounded-b-xl hover:bg-[var(--surface-2)] ${chatModel === m.id ? "text-accent-blue" : "text-[var(--text-primary)]"}`}
                >
                  <span className="font-medium">{m.name}</span>
                  <span className="text-[11px] text-[var(--text-muted)]">{m.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Project selector */}
        <select
          value={chatProjectId ?? ""}
          onChange={(e) => setChatProject(e.target.value || null)}
          className="rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
          style={{ background: "var(--surface-2)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
        >
          <option value="">Kein Projekt</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {/* Git status pill */}
        {gitStatus && selectedProject && (
          <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
            style={{ background: "var(--surface-2)", color: "var(--text-secondary)" }}>
            <GitBranch size={11} className="text-accent-blue" />
            <span className="font-mono">{gitStatus.branch}</span>
            {gitStatus.behind > 0 && <span className="text-accent-yellow">↓{gitStatus.behind}</span>}
            {gitStatus.ahead  > 0 && <span className="text-accent-blue">↑{gitStatus.ahead}</span>}
          </div>
        )}

        {/* Agent mode dropdown */}
        {(() => {
          const current = AGENTS.find(a => a.id === agentMode) ?? AGENTS[0];
          return (
            <div className="relative">
              <button
                onClick={() => setShowAgentDropdown(v => !v)}
                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition hover:bg-[var(--surface-2)]"
                style={{ borderColor: "var(--border-color)", color: "var(--text-secondary)" }}
              >
                <span className={current.color}>{current.icon}</span>
                <span className="font-medium text-[var(--text-primary)]">{current.label}</span>
                <ChevronDown size={10} />
              </button>
              {showAgentDropdown && (
                <div className="absolute left-0 top-full z-30 mt-1 w-60 rounded-xl border shadow-xl overflow-y-auto max-h-[80vh]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-color)" }}>
                  {Array.from(new Set(AGENTS.map(a => a.group))).map(group => (
                    <div key={group}>
                      <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{group}</div>
                      {AGENTS.filter(a => a.group === group).map(agent => (
                        <button key={agent.id}
                          onClick={() => { setAgentMode(agent.id); setShowAgentDropdown(false); }}
                          className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition hover:bg-[var(--surface-2)] ${agentMode === agent.id ? "bg-[var(--surface-2)]" : ""}`}
                        >
                          <span className={`mt-0.5 shrink-0 ${agent.color}`}>{agent.icon}</span>
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-[var(--text-primary)]">{agent.label}</div>
                            <div className="text-[10px] text-[var(--text-muted)] truncate">{agent.desc}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* bash tool indicator (code mode only) */}
        {selectedProject && agentMode === "code" && (
          <div className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px]"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
            <Terminal size={10} className="text-accent-purple" />
            <span>bash aktiv</span>
          </div>
        )}

        <div className="flex-1" />

        <button
          onClick={clearChat}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-accent-red"
        >
          <Trash2 size={12} /> Clear
        </button>
      </div>

      {/* ── Messages ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {chatMessages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center py-16 text-center">
            {(() => {
              const agentDef = AGENTS.find(a => a.id === agentMode) ?? AGENTS[0];
              return (
                <>
                  <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-2xl ${agentDef.color.replace("text-", "bg-").replace("accent-", "accent-") + "/10"}`}>
                    <span className={`${agentDef.color} text-xl`}>{agentDef.icon}</span>
                  </div>
                  <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">{agentDef.label} Agent</p>
                  <p className="text-xs text-[var(--text-secondary)] max-w-xs">{agentDef.desc}</p>
                  {selectedProject && (
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      Projekt: <span className={`font-mono ${agentDef.color}`}>{selectedProject.name}</span>
                    </p>
                  )}
                  {agentMode === "test" && selectedProject && (
                    <button onClick={runTestAgent} disabled={testRunning || chatStreaming}
                      className="mt-4 flex items-center gap-2 rounded-xl bg-accent-green/15 px-4 py-2 text-sm text-accent-green hover:bg-accent-green/25 disabled:opacity-40">
                      {testRunning ? <Loader size={14} className="animate-spin" /> : <FlaskConical size={14} />}
                      Jetzt testen
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {chatMessages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Design → Code handoff bar ─────────────────────────────────────────── */}
      {agentMode === "design" && chatMessages.some((m) => m.role === "assistant") && !chatStreaming && (
        <div className="shrink-0 border-t px-5 py-2.5 flex items-center gap-3"
          style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
          <Palette size={13} className="text-accent-purple shrink-0" />
          <span className="flex-1 text-xs text-[var(--text-secondary)]">Design-Brief bereit — an Code-Agent übergeben?</span>
          <button
            onClick={forwardDesignToCode}
            className="flex items-center gap-1.5 rounded-lg bg-accent-blue/15 px-3 py-1.5 text-xs text-accent-blue hover:bg-accent-blue/25"
          >
            <ArrowRight size={11} /> Mit Code-Agent umsetzen
          </button>
        </div>
      )}

      {/* ── Test Agent quick-start bar ─────────────────────────────────────────── */}
      {agentMode === "test" && selectedProject && !chatStreaming && !testRunning && chatMessages.length === 0 && (
        <div className="shrink-0 border-t px-5 py-2.5 flex items-center gap-3"
          style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
          <FlaskConical size={13} className="text-accent-green shrink-0" />
          <span className="flex-1 text-xs text-[var(--text-secondary)]">Screenshot aufnehmen und UI auf Fehler prüfen</span>
          <button
            onClick={runTestAgent}
            disabled={testRunning}
            className="flex items-center gap-1.5 rounded-lg bg-accent-green/15 px-3 py-1.5 text-xs text-accent-green hover:bg-accent-green/25 disabled:opacity-40"
          >
            {testRunning ? <Loader size={11} className="animate-spin" /> : <FlaskConical size={11} />}
            Test starten
          </button>
        </div>
      )}

      {/* ── Commit & Push bar ─────────────────────────────────────────────────── */}
      {selectedProject && gitStatus && (gitStatus.modified_files.length > 0 || gitStatus.staged_files.length > 0) && (
        <div className="shrink-0 border-t px-5 py-3"
          style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mb-2">
            <span>{gitStatus.modified_files.length + gitStatus.staged_files.length} geänderte Datei(en)</span>
            {gitStatus.ahead > 0 && <span className="text-accent-blue">· {gitStatus.ahead} nicht gepusht</span>}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Commit-Nachricht…"
              className="flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
              style={{ background: "var(--surface-2)", borderColor: "var(--border-color)", color: "var(--text-primary)" }}
              onKeyDown={(e) => { if (e.key === "Enter" && commitMsg.trim()) handleCommitAndPush(); }}
            />
            <button
              disabled={!commitMsg.trim() || commitLoading}
              onClick={handleCommitAndPush}
              className="flex items-center gap-1.5 rounded-lg bg-accent-blue px-3 py-1.5 text-xs text-white hover:bg-accent-blue/80 disabled:opacity-40"
            >
              {commitLoading ? <Loader size={11} className="animate-spin" /> : <Upload size={11} />}
              Commit & Push
            </button>
          </div>
        </div>
      )}

      {/* ── Input area ────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t p-4" style={{ borderColor: "var(--border-color)" }}>
        {pendingImages.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {pendingImages.map((img, i) => (
              <div key={i} className="relative">
                <img src={img.preview} alt="attachment"
                  className="h-16 w-16 rounded-lg object-cover border"
                  style={{ borderColor: "var(--border-color)" }} />
                <button
                  onClick={() => setPendingImages((p) => p.filter((_, idx) => idx !== i))}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-red text-white text-[9px]"
                >✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-xl border p-2 focus-within:ring-1 focus-within:ring-accent-blue/40"
          style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
          <div className="flex shrink-0 gap-1 pb-0.5">
            <button onClick={attachImage} title="Bild anhängen"
              className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text-secondary)]">
              <Image size={15} />
            </button>
            <button onClick={takeScreenshot} title="Screenshot"
              className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text-secondary)]">
              <Camera size={15} />
            </button>
            {agentMode === "test" && selectedProject && (
              <button
                onClick={runTestAgent}
                disabled={testRunning || chatStreaming}
                title="Test Agent starten"
                className="rounded-lg p-1.5 text-accent-green transition hover:bg-accent-green/10 disabled:opacity-40"
              >
                {testRunning ? <Loader size={15} className="animate-spin" /> : <FlaskConical size={15} />}
              </button>
            )}
          </div>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              agentMode === "design"
                ? "Beschreibe dein Projekt oder den gewünschten Design-Stil… (⌘↵ senden)"
                : agentMode === "test"
                ? "Frage zum Test oder Ergebnis…"
                : "Claude fragen… (⌘↵ senden) — Claude kann Pakete installieren & Befehle ausführen"
            }
            rows={1}
            className="auto-resize flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
          />

          <button
            disabled={(!input.trim() && pendingImages.length === 0) || chatStreaming}
            onClick={sendMessage}
            className="shrink-0 rounded-lg bg-accent-blue p-2 text-white transition hover:bg-accent-blue/80 disabled:opacity-40"
            title="Senden (⌘↵)"
          >
            {chatStreaming ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-[var(--text-muted)]">
          {agentMode === "design"
            ? "⌘↵ senden · 📎 Design-Screenshots anhängen · Design-Brief wird am Ende übergeben"
            : agentMode === "test"
            ? "⌘↵ senden · 🧪 Test Agent macht Screenshot und analysiert die UI automatisch"
            : "⌘↵ senden · 📎 Bild · 📷 Screenshot · Claude kann bash-Befehle ausführen wenn ein Projekt gewählt ist"}
        </p>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  const text   = getTextContent(msg);
  const images = getImageBlocks(msg);

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div className={`shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
        isUser
          ? "bg-accent-blue/15 text-accent-blue"
          : "bg-accent-purple/15 text-accent-purple"
      }`}>
        {isUser ? "U" : "✦"}
      </div>

      {/* Bubble */}
      <div className="group flex max-w-[80%] flex-col gap-2">
        <div className={`relative rounded-2xl px-4 py-2.5 ${isUser ? "rounded-tr-sm" : "rounded-tl-sm"}`}
          style={{
            background: isUser ? "var(--surface-3)" : "var(--surface-1)",
            border: isUser ? "none" : "1px solid var(--border-color)",
          }}>
          {images.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {images.map((img, i) => (
                <img key={i} src={`data:${img.media_type};base64,${img.data}`}
                  alt="attachment" className="max-h-48 max-w-full rounded-lg object-contain" />
              ))}
            </div>
          )}

          {isUser ? (
            <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{text}</p>
          ) : (
            <MarkdownMessage content={text} streaming={msg.streaming} />
          )}

          {msg.error && <p className="mt-1 text-xs text-accent-red">{msg.error}</p>}
        </div>

        {/* Tool call cards (shown below the bubble) */}
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="flex flex-col gap-1.5 pl-1">
            {msg.toolCalls.map((tc) => (
              <ToolCallCard key={tc.call_id} tc={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tool call card ────────────────────────────────────────────────────────────

function ToolCallCard({ tc }: { tc: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = !!(tc.stdout || tc.stderr);
  const success   = tc.exit_code === 0;

  return (
    <div className="rounded-lg border overflow-hidden"
      style={{ borderColor: "var(--border-color)", background: "var(--surface-2)" }}>
      {/* Header row */}
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => hasOutput && setExpanded((v) => !v)}
      >
        {tc.running ? (
          <Loader size={11} className="shrink-0 animate-spin text-accent-purple" />
        ) : success ? (
          <CheckCircle size={11} className="shrink-0 text-accent-green" />
        ) : (
          <XCircle size={11} className="shrink-0 text-accent-red" />
        )}

        <Terminal size={11} className="shrink-0 text-[var(--text-muted)]" />

        <code className="flex-1 truncate font-mono text-[11px] text-[var(--text-primary)]">
          {tc.command}
        </code>

        {tc.duration_ms !== undefined && !tc.running && (
          <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{tc.duration_ms}ms</span>
        )}

        {hasOutput && (
          <span className="shrink-0 text-[var(--text-muted)]">
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
        )}
      </button>

      {/* Expandable output */}
      {expanded && hasOutput && (
        <div className="border-t px-3 pb-3 pt-2" style={{ borderColor: "var(--border-color)" }}>
          {tc.stdout && tc.stdout.trim() && (
            <pre className="mb-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
              {tc.stdout.trim()}
            </pre>
          )}
          {tc.stderr && tc.stderr.trim() && (
            <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-accent-red">
              {tc.stderr.trim()}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

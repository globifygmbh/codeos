import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Camera,
  ChevronDown,
  Image,
  Loader,
  Send,
  Trash2,
  Upload,
  GitBranch,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../stores/store";
import type { ChatMessage, ContentBlock } from "../types";
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

// ── Pending image attachment ──────────────────────────────────────────────────

interface PendingImage {
  data: string;       // base64
  media_type: string;
  preview: string;    // data URL for <img>
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
    clearChat,
    loadChatModels,
  } = useStore();

  const [input, setInput] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [commitLoading, setCommitLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadChatModels();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  const selectedProject = projects.find((p) => p.id === chatProjectId) ?? null;
  const gitStatus = chatProjectId ? gitStatuses[chatProjectId] : null;

  // ── Streaming listener ────────────────────────────────────────────────────────

  async function sendMessage() {
    if ((!input.trim() && pendingImages.length === 0) || chatStreaming) return;

    // Build content blocks
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

    // Placeholder for assistant response
    const streamId = uid();
    const assistantMsg: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: "",
      streaming: true,
    };
    addChatMessage(assistantMsg);

    // Register listeners before invoking
    const unlistenChunk = await listen<string>(`claude-chunk-${streamId}`, (ev) => {
      updateLastAssistantMessage(ev.payload, false);
    });
    const unlistenDone = await listen(`claude-done-${streamId}`, () => {
      updateLastAssistantMessage("", true);
    });
    const unlistenError = await listen<string>(`claude-error-${streamId}`, (ev) => {
      updateLastAssistantMessage(`\n\n⚠ Error: ${ev.payload}`, true);
    });

    // Build messages for API (exclude the placeholder assistant message)
    const apiMessages = useStore
      .getState()
      .chatMessages.slice(0, -1) // exclude the empty placeholder
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      await invoke("claude_send_message", {
        messages: apiMessages,
        model: chatModel,
        projectPath: selectedProject?.path ?? null,
        projectName: selectedProject?.name ?? null,
        streamId,
      });
    } catch (e) {
      updateLastAssistantMessage(`\n\n⚠ Error: ${String(e)}`, true);
    } finally {
      unlistenChunk();
      unlistenDone();
      unlistenError();
    }
  }

  async function takeScreenshot() {
    try {
      const data = await invoke<string>("take_screenshot");
      setPendingImages((prev) => [
        ...prev,
        {
          data,
          media_type: "image/png",
          preview: `data:image/png;base64,${data}`,
        },
      ]);
    } catch (e) {
      useStore.getState().setGlobalError("Screenshot failed: " + String(e));
    }
  }

  async function attachImage() {
    const path = await openDialog({ multiple: false, filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }] });
    if (!path || typeof path !== "string") return;
    try {
      const result = await invoke<{ data: string; media_type: string }>("read_image_as_base64", { path });
      setPendingImages((prev) => [
        ...prev,
        {
          data: result.data,
          media_type: result.media_type,
          preview: `data:${result.media_type};base64,${result.data}`,
        },
      ]);
    } catch (e) {
      useStore.getState().setGlobalError("Failed to load image: " + String(e));
    }
  }

  async function handleCommitAndPush() {
    if (!selectedProject || !commitMsg.trim()) return;
    setCommitLoading(true);
    try {
      await invoke("git_stage_all", { projectPath: selectedProject.path });
      await invoke("git_commit", { projectPath: selectedProject.path, message: commitMsg.trim() });
      await invoke("git_push", { projectPath: selectedProject.path });
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

  const currentModel = chatModels.find((m) => m.id === chatModel);

  return (
    <div className="view-enter flex h-full flex-col">
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
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
          <option value="">No project</option>
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
            {gitStatus.ahead > 0 && <span className="text-accent-blue">↑{gitStatus.ahead}</span>}
          </div>
        )}

        <div className="flex-1" />

        {/* Clear */}
        <button
          onClick={clearChat}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-accent-red"
        >
          <Trash2 size={12} />
          Clear
        </button>
      </div>

      {/* ── Messages ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {chatMessages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-blue/10 text-accent-blue">
              <span className="text-xl">✦</span>
            </div>
            <p className="mb-1 text-sm font-medium text-[var(--text-primary)]">Claude AI</p>
            <p className="text-xs text-[var(--text-secondary)]">
              Select a project above and start coding. Use ⌘↵ to send.
            </p>
            {selectedProject && (
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Context: <span className="text-accent-blue font-mono">{selectedProject.name}</span>
              </p>
            )}
          </div>
        )}

        {chatMessages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Commit & Push bar (shown when project has changes) ────────────────── */}
      {selectedProject && gitStatus && (gitStatus.modified_files.length > 0 || gitStatus.staged_files.length > 0) && (
        <div className="shrink-0 border-t px-5 py-3"
          style={{ borderColor: "var(--border-color)", background: "var(--surface-1)" }}>
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mb-2">
            <span>{gitStatus.modified_files.length + gitStatus.staged_files.length} changed file{(gitStatus.modified_files.length + gitStatus.staged_files.length) > 1 ? "s" : ""}</span>
            {gitStatus.ahead > 0 && <span className="text-accent-blue">· {gitStatus.ahead} unpushed commit{gitStatus.ahead > 1 ? "s" : ""}</span>}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="Commit message…"
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

      {/* ── Input area ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t p-4"
        style={{ borderColor: "var(--border-color)" }}>

        {/* Pending image thumbnails */}
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
          {/* Attachment buttons */}
          <div className="flex shrink-0 gap-1 pb-0.5">
            <button
              onClick={attachImage}
              title="Attach image"
              className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text-secondary)]"
            >
              <Image size={15} />
            </button>
            <button
              onClick={takeScreenshot}
              title="Take screenshot"
              className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text-secondary)]"
            >
              <Camera size={15} />
            </button>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Claude… (⌘↵ to send)"
            rows={1}
            className="auto-resize flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none"
          />

          {/* Send */}
          <button
            disabled={(!input.trim() && pendingImages.length === 0) || chatStreaming}
            onClick={sendMessage}
            className="shrink-0 rounded-lg bg-accent-blue p-2 text-white transition hover:bg-accent-blue/80 disabled:opacity-40"
            title="Send (⌘↵)"
          >
            {chatStreaming ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-[var(--text-muted)]">
          ⌘↵ send · attach images with 📎 or take a screenshot with 📷
        </p>
      </div>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  const text = getTextContent(msg);
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
      <div className={`group relative max-w-[78%] rounded-2xl px-4 py-2.5 ${
        isUser
          ? "rounded-tr-sm"
          : "rounded-tl-sm"
      }`}
        style={{
          background: isUser ? "var(--surface-3)" : "var(--surface-1)",
          border: isUser ? "none" : "1px solid var(--border-color)",
        }}>

        {/* Image attachments */}
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((img, i) => (
              <img
                key={i}
                src={`data:${img.media_type};base64,${img.data}`}
                alt="attachment"
                className="max-h-48 max-w-full rounded-lg object-contain"
              />
            ))}
          </div>
        )}

        {/* Text */}
        {isUser ? (
          <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{text}</p>
        ) : (
          <MarkdownMessage content={text} streaming={msg.streaming} />
        )}

        {msg.error && (
          <p className="mt-1 text-xs text-accent-red">{msg.error}</p>
        )}
      </div>
    </div>
  );
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

import { Check, Copy } from "lucide-react";
import { useState } from "react";

interface Props {
  content: string;
  streaming?: boolean;
}

// ── Code block with copy button ───────────────────────────────────────────────

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="group relative my-2 rounded-xl border overflow-hidden"
      style={{ borderColor: "var(--border-color)", background: "var(--surface-2)" }}>
      {/* Header bar */}
      <div className="flex items-center justify-between border-b px-3 py-1.5"
        style={{ borderColor: "var(--border-color)" }}>
        <span className="text-[10px] font-mono text-[var(--text-muted)]">
          {lang || "code"}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] transition hover:text-[var(--text-secondary)]"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs text-[var(--text-primary)] log-output">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── Inline text parser (bold, italic, inline-code) ────────────────────────────

function parseInline(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i}
          className="rounded px-1 py-0.5 text-accent-blue log-output"
          style={{ background: "var(--surface-2)" }}>
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ── Block-level renderer ──────────────────────────────────────────────────────

function renderBlocks(text: string): React.ReactNode[] {
  // Split on fenced code blocks first.
  const segments = text.split(/(```[\s\S]*?```)/g);
  const nodes: React.ReactNode[] = [];

  segments.forEach((seg, si) => {
    if (seg.startsWith("```")) {
      const firstNewline = seg.indexOf("\n");
      const lang = firstNewline > 3 ? seg.slice(3, firstNewline).trim() : "";
      const code = firstNewline > 0 ? seg.slice(firstNewline + 1).replace(/```$/, "") : seg.slice(3).replace(/```$/, "");
      nodes.push(<CodeBlock key={`code-${si}`} lang={lang} code={code} />);
      return;
    }

    // Process line-by-line for headings, lists, blockquotes, paragraphs.
    const lines = seg.split("\n");
    let i = 0;
    let listBuffer: React.ReactNode[] = [];
    let listType: "ul" | "ol" | null = null;

    function flushList() {
      if (listBuffer.length === 0) return;
      const Tag = listType === "ol" ? "ol" : "ul";
      nodes.push(
        <Tag key={`list-${si}-${i}`}
          className={listType === "ol" ? "list-decimal ml-5 my-1 space-y-0.5" : "list-disc ml-5 my-1 space-y-0.5"}>
          {listBuffer}
        </Tag>
      );
      listBuffer = [];
      listType = null;
    }

    while (i < lines.length) {
      const line = lines[i];

      // Headings
      const h3 = line.match(/^### (.+)/);
      const h2 = line.match(/^## (.+)/);
      const h1 = line.match(/^# (.+)/);
      if (h1 || h2 || h3) {
        flushList();
        const level = h1 ? 1 : h2 ? 2 : 3;
        const text = (h1 ?? h2 ?? h3)![1];
        const cls = level === 1 ? "text-base font-bold mt-3 mb-1" : level === 2 ? "text-sm font-bold mt-2 mb-0.5" : "text-sm font-semibold mt-1.5 mb-0.5";
        nodes.push(<div key={`h-${si}-${i}`} className={cls}>{parseInline(text)}</div>);
        i++;
        continue;
      }

      // Blockquote
      if (line.startsWith("> ")) {
        flushList();
        nodes.push(
          <blockquote key={`bq-${si}-${i}`}
            className="my-1 border-l-2 border-accent-blue/40 pl-3 text-[var(--text-secondary)] italic">
            {parseInline(line.slice(2))}
          </blockquote>
        );
        i++;
        continue;
      }

      // Ordered list item
      const ol = line.match(/^(\d+)\. (.+)/);
      if (ol) {
        if (listType !== "ol") { flushList(); listType = "ol"; }
        listBuffer.push(<li key={`oli-${i}`}>{parseInline(ol[2])}</li>);
        i++;
        continue;
      }

      // Unordered list item
      if (line.match(/^[-*+] /)) {
        if (listType !== "ul") { flushList(); listType = "ul"; }
        listBuffer.push(<li key={`uli-${i}`}>{parseInline(line.slice(2))}</li>);
        i++;
        continue;
      }

      // Horizontal rule
      if (line.match(/^---+$/) || line.match(/^\*\*\*+$/)) {
        flushList();
        nodes.push(<hr key={`hr-${si}-${i}`} className="my-2 border-[var(--border-color)]" />);
        i++;
        continue;
      }

      // Empty line = paragraph break
      if (line.trim() === "") {
        flushList();
        nodes.push(<div key={`br-${si}-${i}`} className="h-2" />);
        i++;
        continue;
      }

      // Plain paragraph line
      flushList();
      nodes.push(
        <p key={`p-${si}-${i}`} className="leading-relaxed">
          {parseInline(line)}
        </p>
      );
      i++;
    }

    flushList();
  });

  return nodes;
}

// ── Public component ──────────────────────────────────────────────────────────

export default function MarkdownMessage({ content, streaming }: Props) {
  const blocks = renderBlocks(content);
  return (
    <div className="chat-prose text-sm text-[var(--text-primary)]">
      {blocks}
      {streaming && (
        <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse rounded-sm bg-accent-blue align-middle" />
      )}
    </div>
  );
}

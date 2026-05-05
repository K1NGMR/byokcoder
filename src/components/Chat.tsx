import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useStore } from "@/lib/store";
import { callAI, type ChatMessage } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

const SYSTEM_PROMPT = `You are an AUTONOMOUS full-stack web coding AGENT inside a browser-based code editor with a virtual file system.
You can build ANYTHING that runs in a browser: HTML, CSS, JavaScript, TypeScript, JSON, SVG, Markdown, multi-file websites, games, dashboards, animations, canvas/WebGL, audio, forms, anything. There are NO limits on file count, file size, languages, libraries (via CDN <script>/<link>), or scope. You can rework, refactor, restructure, rename, split, merge, or completely rebuild the project as the user asks.

Edit blocks you emit are AUTO-EXECUTED and HIDDEN from the user — the user only sees your short prose. So you MUST emit blocks for any change (don't just describe code in prose).

OPERATIONS — pick the smallest that fits the job. You may emit as MANY blocks as needed in one reply (multiple files, multiple edits per file).

1) EDIT an existing file (surgical search/replace — PREFERRED for small/medium changes):
\`\`\`edit path=<filepath>
<<<<<<< SEARCH
(exact existing code — must appear EXACTLY ONCE in the file, copied byte-for-byte from the file context)
=======
(new code that replaces it)
>>>>>>> REPLACE
\`\`\`
Multiple SEARCH/REPLACE pairs allowed in one block. SEARCH must be unique — include surrounding lines if needed.

2) CREATE a new file, OR fully REPLACE an existing file when the rewrite is large/structural (use this for "rework", "redo", "rebuild", "convert", or when >50% of the file changes):
\`\`\`create path=<filepath>
<full file contents>
\`\`\`

3) DELETE a file:
\`\`\`delete path=<filepath>
\`\`\`

HARD RULES:
- You are an AGENT. For ANY change request, emit at least one operation block. Never reply with code in prose.
- Always include \`path=<filepath>\` on the opening fence. Use forward-slash paths exactly as in the file context.
- For "rework"/"rebuild"/major changes: feel free to fully replace files with \`create\`, add new files (extra .html, .css, .js, assets), and delete obsolete ones — all in the same reply.
- For small tweaks: prefer \`edit\` blocks; copy SEARCH text byte-for-byte from the file context.
- External libs are fine via CDN (e.g. <script src="https://cdn.jsdelivr.net/...">).
- Keep prose to 1 short sentence OUTSIDE the blocks (the blocks are hidden).`;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

type Op =
  | { kind: "edit"; path: string; pairs: { search: string; replace: string }[] }
  | { kind: "create"; path: string; content: string }
  | { kind: "delete"; path: string };

function extractEditPairs(body: string) {
  const pairs: { search: string; replace: string }[] = [];
  // Match <<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE with proper markers
  const pairRe = /<{7}\s*SEARCH\s*\n([\s\S]*?)\n={7}\s*\n([\s\S]*?)\n>{7}\s*REPLACE/g;
  let match;
  while ((match = pairRe.exec(body))) {
    const searchText = match[1];
    const replaceText = match[2];
    // Only add if they are different
    if (searchText !== replaceText) {
      pairs.push({ search: searchText, replace: replaceText });
    }
  }
  return pairs;
}

function pairSignature(pair: { search: string; replace: string }) {
  return `${pair.search}\u0000${pair.replace}`;
}

function inferEditPath(files: { path: string; content: string }[], search: string) {
  const matches = files.filter((file) => applyEdit(file.content, search, search).ok);
  return matches.length === 1 ? matches[0].path : null;
}

function parseOps(text: string, files: { path: string; content: string }[]): Op[] {
  const ops: Op[] = [];
  const handledPairs = new Set<string>();
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (!fence) { i++; continue; }
    const indent = fence[1];
    const marker = fence[2];
    const info = fence[3].trim();
    const pathMatch = info.match(/path\s*=\s*["']?([^\s"']+)["']?/);
    if (!pathMatch) { i++; continue; }
    const path = pathMatch[1];
    const kind = /^edit\b/i.test(info)
      ? "edit"
      : /^delete\b/i.test(info)
      ? "delete"
      : /^create\b/i.test(info)
      ? "create"
      : "replace"; // generic ```lang path=... -> full file replace

    // Find matching closing fence: same marker char, length >= opening, with no info
    const closeRe = new RegExp(
      `^${indent}${marker[0]}{${marker.length},}\\s*$`
    );
    let j = i + 1;
    const buf: string[] = [];
    while (j < lines.length && !closeRe.test(lines[j])) {
      buf.push(lines[j]);
      j++;
    }
    const body = buf.join("\n");

    if (kind === "delete") {
      ops.push({ kind: "delete", path });
    } else if (kind === "create" || kind === "replace") {
      ops.push({ kind: "create", path, content: body });
    } else {
      const pairs = extractEditPairs(body);
      pairs.forEach((pair) => handledPairs.add(pairSignature(pair)));
      if (pairs.length) ops.push({ kind: "edit", path, pairs });
    }
    i = j + 1;
  }

  const inferredByPath = new Map<string, { search: string; replace: string }[]>();
  for (const pair of extractEditPairs(text)) {
    if (handledPairs.has(pairSignature(pair))) continue;
    const path = inferEditPath(files, pair.search);
    if (!path) continue;
    const pairs = inferredByPath.get(path) ?? [];
    pairs.push(pair);
    inferredByPath.set(path, pairs);
  }
  inferredByPath.forEach((pairs, path) => ops.push({ kind: "edit", path, pairs }));

  return ops;
}

function applyEdit(content: string, search: string, replace: string): { ok: boolean; result: string } {
  // Normalize both strings for comparison (trim each line)
  const normalize = (s: string) => 
    s.split("\n").map((l) => l.trimEnd()).join("\n");
  
  const normalizedContent = normalize(content);
  const normalizedSearch = normalize(search);
  
  // Try exact match first
  let idx = normalizedContent.indexOf(normalizedSearch);
  if (idx !== -1) {
    // Verify it's unique
    if (normalizedContent.indexOf(normalizedSearch, idx + 1) === -1) {
      // Replace in original content using normalized indices
      const before = content.substring(0, idx);
      const after = content.substring(idx + normalizedSearch.length);
      return { ok: true, result: before + replace + after };
    }
  }
  
  return { ok: false, result: content };
}


export function Chat() {
  const { provider, model, apiKeys, files, upsertFile } = useStore();
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async () => {
    const key = apiKeys[provider];
    if (!key) {
      toast.error(`Add your ${provider} API key in Settings first.`);
      return;
    }
    if (!input.trim() || busy) return;

    const userMsg: ChatTurn = { role: "user", content: input.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setBusy(true);

    const fileContext = files
      .map((f) => `--- ${f.path} ---\n${f.content}`)
      .join("\n\n");

    const aiMessages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: `Current project files:\n\n${fileContext || "(no files yet)"}`,
      },
      ...messages.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
      { role: "user", content: userMsg.content },
    ];

    try {
      const reply = await callAI({ provider, model, apiKey: key, messages: aiMessages });
      const ops = parseOps(reply, useStore.getState().files);
      // Hide raw op blocks from the user — the agent acts; it doesn't paste code at them.
      const visibleReply =
        reply
          .replace(/```(?:edit|create|delete|replace)[^\n]*\n[\s\S]*?```/g, "")
          .replace(/<{5,}[\s\S]*?>{5,}[^\n]*/g, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim() || (ops.length ? "Done." : reply);
      setMessages((m) => [...m, { role: "assistant", content: visibleReply }]);
      const summary: string[] = [];
      const failures: string[] = [];
      const state = useStore.getState();
      for (const op of ops) {
        if (op.kind === "create") {
          state.upsertFile(op.path, op.content);
          summary.push(`+ ${op.path}`);
        } else if (op.kind === "delete") {
          state.deleteFile(op.path);
          summary.push(`− ${op.path}`);
        } else if (op.kind === "edit") {
          const file = useStore.getState().files.find((f) => f.path === op.path);
          if (!file) { failures.push(`edit ${op.path} (file not found)`); continue; }
          let content = file.content;
          let applied = 0;
          for (const pair of op.pairs) {
            const r = applyEdit(content, pair.search, pair.replace);
            if (r.ok) { content = r.result; applied++; }
            else failures.push(`edit ${op.path} (search not found / ambiguous)`);
          }
          if (applied) {
            state.upsertFile(op.path, content);
            summary.push(`~ ${op.path} (${applied} edit${applied > 1 ? "s" : ""})`);
          }
        }
      }
      if (summary.length) toast.success(summary.join("  "));
      if (failures.length) toast.error(failures.join("  "));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "AI request failed";
      toast.error(message);
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <Wand2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs uppercase tracking-wider text-muted-foreground">AI Chat</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Ask me to build, fix, or change anything in your project.</p>
            <ul className="list-disc pl-4 text-xs space-y-1">
              <li>"Add a dark mode toggle"</li>
              <li>"Make the button bigger and blue"</li>
              <li>"Create a counter app in script.js"</li>
            </ul>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] bg-primary text-primary-foreground rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
                  : "max-w-full bg-secondary text-secondary-foreground rounded-lg px-3 py-2 prose-chat"
              }
            >
              {m.role === "assistant" ? (
                <ReactMarkdown>{m.content}</ReactMarkdown>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask the AI to change your code…"
            rows={2}
            className="resize-none text-sm"
          />
          <Button onClick={send} disabled={busy || !input.trim()} size="icon" className="h-9 w-9 shrink-0">
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-[10px] text-muted-foreground mt-2">
          Using <span className="mono">{provider}</span> · <span className="mono">{model}</span>
        </div>
      </div>
    </div>
  );
}

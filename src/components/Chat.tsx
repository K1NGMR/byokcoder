import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useStore } from "@/lib/store";
import { callAI, type ChatMessage } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

const SYSTEM_PROMPT = `You are an AI coding assistant inside a browser-based code editor.
The user has a virtual file system. You can answer questions and AUTOMATICALLY apply edits.

You have THREE edit operations. Use the SMALLEST one that does the job.
NEVER rewrite an entire existing file just to change a few lines — use EDIT blocks.

1) EDIT an existing file — surgical search/replace (PREFERRED for any change to existing files):
\`\`\`edit path=<filepath>
<<<<<<< SEARCH
(exact existing code, including whitespace, must appear EXACTLY ONCE in the file)
=======
(new code that replaces it)
>>>>>>> REPLACE
\`\`\`
You may include multiple SEARCH/REPLACE pairs in one edit block (repeat the markers).
The SEARCH text must be small and unique — copy a few surrounding lines if needed.

2) CREATE a new file (only when the file does not exist yet):
\`\`\`create path=<filepath>
<full file contents>
\`\`\`

3) DELETE a file:
\`\`\`delete path=<filepath>
\`\`\`

Rules:
- Use forward-slash paths.
- Output edit blocks directly — they will be auto-applied. No confirmation needed.
- Always include the SEARCH and REPLACE marker labels and a path. If you forget labels, raw conflict blocks will still be treated as edits when the old code is found uniquely.
- Keep explanations brief and OUTSIDE the code blocks.
- Touch only what the user asked about.`;

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
  const pairRe = /<{5,}[^\n]*\n([\s\S]*?)\n={5,}[^\n]*\n([\s\S]*?)\n>{5,}[^\n]*/g;
  let p;
  while ((p = pairRe.exec(body))) {
    pairs.push({ search: p[1], replace: p[2] });
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
  // 1) exact match
  let idx = content.indexOf(search);
  if (idx !== -1 && content.indexOf(search, idx + 1) === -1) {
    return { ok: true, result: content.slice(0, idx) + replace + content.slice(idx + search.length) };
  }
  // 2) trim trailing whitespace on each line for fuzzy match
  const norm = (s: string) => s.split("\n").map((l) => l.replace(/\s+$/, "")).join("\n");
  const nContent = norm(content);
  const nSearch = norm(search);
  idx = nContent.indexOf(nSearch);
  if (idx !== -1 && nContent.indexOf(nSearch, idx + 1) === -1) {
    return { ok: true, result: nContent.slice(0, idx) + replace + nContent.slice(idx + nSearch.length) };
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
      setMessages((m) => [...m, { role: "assistant", content: reply }]);

      const ops = parseOps(reply, useStore.getState().files);
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
    } catch (e: any) {
      toast.error(e.message || "AI request failed");
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${e.message}` }]);
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

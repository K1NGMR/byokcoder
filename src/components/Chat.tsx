import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useStore } from "@/lib/store";
import { callAI, type ChatMessage } from "@/lib/ai";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

const SYSTEM_PROMPT = `You are an AI coding assistant inside a lightweight browser-based code editor.
The user has a virtual file system (HTML/CSS/JS files). You can answer questions and propose edits.

When you want to CREATE or MODIFY a file, output a fenced code block whose info string is:
\`\`\`<language> path=<filepath>
...full new file contents...
\`\`\`

Always output the FULL file content (no diffs, no ellipsis). Use forward-slash paths.
You may include multiple such blocks. Add brief explanations outside the blocks.
Do not invent files the user did not ask about unless clearly needed.`;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

function extractFileBlocks(text: string): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  const re = /```([^\n`]*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) {
    const info = m[1].trim();
    const body = m[2];
    const pathMatch = info.match(/path\s*=\s*([^\s]+)/);
    if (pathMatch) {
      out.push({ path: pathMatch[1].replace(/^["']|["']$/g, ""), content: body });
    }
  }
  return out;
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

      const blocks = extractFileBlocks(reply);
      if (blocks.length) {
        for (const b of blocks) upsertFile(b.path, b.content);
        toast.success(`Updated ${blocks.length} file${blocks.length > 1 ? "s" : ""}`);
      }
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

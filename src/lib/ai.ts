export type Provider = "groq" | "gemini";

export interface ProviderConfig {
  id: Provider;
  label: string;
  models: { id: string; label: string }[];
  apiKeyHint: string;
  apiKeyUrl: string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "groq",
    label: "Groq",
    apiKeyHint: "gsk_...",
    apiKeyUrl: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
      { id: "llama-3.1-70b-versatile", label: "Llama 3.1 70B Versatile" },
      { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B" },
      { id: "gemma2-9b-it", label: "Gemma2 9B" },
      { id: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Distill 70B" },
      { id: "qwen-2.5-coder-32b", label: "Qwen 2.5 Coder 32B" },
      { id: "qwen-2.5-32b", label: "Qwen 2.5 32B" },
    ],
  },
  {
    id: "gemini",
    label: "Google Gemini",
    apiKeyHint: "AIza...",
    apiKeyUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    ],
  },
];

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function callAI(opts: {
  provider: Provider;
  model: string;
  apiKey: string;
  messages: ChatMessage[];
}): Promise<string> {
  const { provider, model, apiKey, messages } = opts;
  if (!apiKey) throw new Error("API key missing");

  if (provider === "groq") {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.4 }),
    });
    if (!r.ok) throw new Error(`Groq error ${r.status}: ${await r.text()}`);
    const j = await r.json();
    return j.choices?.[0]?.message?.content ?? "";
  }

  // Gemini
  const sys = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;
  const body: any = { contents };
  if (sys) body.systemInstruction = { parts: [{ text: sys }] };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Gemini error ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
}

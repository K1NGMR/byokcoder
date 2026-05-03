import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Provider } from "./ai";

export interface VFile {
  path: string;
  content: string;
}

interface State {
  files: VFile[];
  activePath: string | null;
  provider: Provider;
  model: string;
  apiKeys: Record<Provider, string>;
  setActive: (p: string | null) => void;
  upsertFile: (path: string, content: string) => void;
  deleteFile: (path: string) => void;
  renameFile: (oldP: string, newP: string) => void;
  setProvider: (p: Provider) => void;
  setModel: (m: string) => void;
  setApiKey: (p: Provider, k: string) => void;
  reset: () => void;
}

const DEFAULT_FILES: VFile[] = [
  {
    path: "index.html",
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>My App</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <h1>Hello, world 👋</h1>
  <p>Edit files on the left, ask the AI on the right.</p>
  <button id="btn">Click me</button>
  <script src="script.js"></script>
</body>
</html>
`,
  },
  {
    path: "styles.css",
    content: `body {
  font-family: system-ui, sans-serif;
  max-width: 640px;
  margin: 3rem auto;
  padding: 0 1rem;
  color: #111;
}
button {
  padding: .5rem 1rem;
  border-radius: .5rem;
  border: 1px solid #ddd;
  cursor: pointer;
}
`,
  },
  {
    path: "script.js",
    content: `document.getElementById("btn").addEventListener("click", () => {
  alert("Hi from your BYOK AI Coder!");
});
`,
  },
];

export const useStore = create<State>()(
  persist(
    (set) => ({
      files: DEFAULT_FILES,
      activePath: "index.html",
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      apiKeys: { groq: "", gemini: "" },
      setActive: (activePath) => set({ activePath }),
      upsertFile: (path, content) =>
        set((s) => {
          const exists = s.files.find((f) => f.path === path);
          const files = exists
            ? s.files.map((f) => (f.path === path ? { ...f, content } : f))
            : [...s.files, { path, content }];
          return { files, activePath: s.activePath ?? path };
        }),
      deleteFile: (path) =>
        set((s) => {
          const files = s.files.filter((f) => f.path !== path);
          const activePath = s.activePath === path ? files[0]?.path ?? null : s.activePath;
          return { files, activePath };
        }),
      renameFile: (oldP, newP) =>
        set((s) => ({
          files: s.files.map((f) => (f.path === oldP ? { ...f, path: newP } : f)),
          activePath: s.activePath === oldP ? newP : s.activePath,
        })),
      setProvider: (provider) => set({ provider }),
      setModel: (model) => set({ model }),
      setApiKey: (p, k) =>
        set((s) => ({ apiKeys: { ...s.apiKeys, [p]: k } })),
      reset: () => set({ files: DEFAULT_FILES, activePath: "index.html" }),
    }),
    { name: "byok-coder-store" }
  )
);

import { useStore } from "@/lib/store";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, ExternalLink } from "lucide-react";

function buildPreviewSrc(files: { path: string; content: string }[]): string {
  const html = files.find((f) => f.path === "index.html");
  if (!html) return "";

  // Build virtual file map -> blob URLs
  const blobs = new Map<string, string>();
  for (const f of files) {
    if (f.path === "index.html") continue;
    const ext = f.path.split(".").pop()?.toLowerCase();
    const type =
      ext === "css" ? "text/css" :
      ext === "js" || ext === "mjs" ? "text/javascript" :
      ext === "json" ? "application/json" :
      ext === "svg" ? "image/svg+xml" :
      "text/plain";
    blobs.set(f.path, URL.createObjectURL(new Blob([f.content], { type })));
  }

  let body = html.content;
  // Replace ./path or path references in href/src
  body = body.replace(/(href|src)=["']([^"']+)["']/g, (m, attr, val) => {
    const key = val.replace(/^\.\//, "");
    if (blobs.has(key)) return `${attr}="${blobs.get(key)}"`;
    return m;
  });

  return URL.createObjectURL(new Blob([body], { type: "text/html" }));
}

export function Preview() {
  const files = useStore((s) => s.files);
  const [tick, setTick] = useState(0);
  const lastUrl = useRef<string>("");

  // Create a serialized version of files for dependency tracking
  const filesKey = useMemo(() => {
    return JSON.stringify(files.map(f => ({ path: f.path, content: f.content })));
  }, [files]);

  const src = useMemo(() => {
    if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    const url = buildPreviewSrc(files);
    lastUrl.current = url;
    return url;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filesKey, tick]);

  useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current); }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Preview</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTick((t) => t + 1)} title="Reload">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {src && (
            <Button variant="ghost" size="icon" className="h-7 w-7" asChild title="Open">
              <a href={src} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 bg-white">
        {src ? (
          <iframe
            key={tick}
            src={src}
            title="preview"
            sandbox="allow-scripts allow-modals allow-forms"
            className="w-full h-full border-0"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Add an <span className="mono mx-1">index.html</span> file to preview.
          </div>
        )}
      </div>
    </div>
  );
}

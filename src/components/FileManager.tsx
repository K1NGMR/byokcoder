import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { FilePlus, Trash2, Pencil, FileCode } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function FileManager() {
  const { files, activePath, setActive, upsertFile, deleteFile, renameFile } = useStore();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [tmpName, setTmpName] = useState("");

  const newFile = () => {
    const name = prompt("New file name (e.g. about.html, utils.js, theme.css):", "newfile.html");
    if (!name) return;
    const clean = name.trim().replace(/^\/+/, "");
    if (!clean) return;
    if (files.find((f) => f.path === clean)) {
      setActive(clean);
      return;
    }
    upsertFile(clean, "");
    setActive(clean);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Files</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={newFile} title="New file">
          <FilePlus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {files.map((f) => (
          <div
            key={f.path}
            className={cn(
              "group flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm hover:bg-accent",
              activePath === f.path && "bg-accent"
            )}
            onClick={() => setActive(f.path)}
          >
            <FileCode className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {renaming === f.path ? (
              <input
                autoFocus
                value={tmpName}
                onChange={(e) => setTmpName(e.target.value)}
                onBlur={() => {
                  if (tmpName && tmpName !== f.path) renameFile(f.path, tmpName);
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setRenaming(null);
                }}
                className="flex-1 bg-background border border-border rounded px-1 text-sm outline-none mono"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="flex-1 truncate mono text-xs">{f.path}</span>
            )}
            <button
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setRenaming(f.path);
                setTmpName(f.path);
              }}
              title="Rename"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete ${f.path}?`)) deleteFile(f.path);
              }}
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {files.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground">No files yet.</div>
        )}
      </div>
    </div>
  );
}

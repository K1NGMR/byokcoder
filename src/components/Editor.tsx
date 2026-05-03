import { useStore } from "@/lib/store";
import { Textarea } from "@/components/ui/textarea";

export function Editor() {
  const { files, activePath, upsertFile } = useStore();
  const file = files.find((f) => f.path === activePath);

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Select or create a file to start editing.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border text-xs mono text-muted-foreground">
        {file.path}
      </div>
      <Textarea
        value={file.content}
        onChange={(e) => upsertFile(file.path, e.target.value)}
        spellCheck={false}
        className="flex-1 rounded-none border-0 resize-none mono text-sm focus-visible:ring-0 bg-transparent"
        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
      />
    </div>
  );
}

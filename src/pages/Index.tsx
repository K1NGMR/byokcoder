import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun, Sparkles } from "lucide-react";
import { SettingsDialog } from "@/components/SettingsDialog";
import { FileManager } from "@/components/FileManager";
import { Editor } from "@/components/Editor";
import { Preview } from "@/components/Preview";
import { Chat } from "@/components/Chat";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

const Index = () => {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const isDark = saved ? saved === "dark" : true;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <header className="h-12 border-b border-border flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <h1 className="text-sm font-semibold tracking-tight">BYOK Coder</h1>
          <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 ml-1">
            Bring Your Own Key
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <SettingsDialog />
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={16} minSize={10} maxSize={30}>
          <div className="h-full border-r border-border bg-surface">
            <FileManager />
          </div>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={40} minSize={20}>
          <ResizablePanelGroup direction="vertical">
            <ResizablePanel defaultSize={55}>
              <Editor />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={45}>
              <Preview />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={32} minSize={20}>
          <div className="h-full border-l border-border bg-surface">
            <Chat />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default Index;

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { PROVIDERS, type Provider } from "@/lib/ai";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, ExternalLink, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export function SettingsDialog() {
  const { provider, model, apiKeys, setProvider, setModel, setApiKey } = useStore();
  const [open, setOpen] = useState(false);
  const [localProvider, setLocalProvider] = useState<Provider>(provider);
  const [localModel, setLocalModel] = useState(model);
  const [localKeys, setLocalKeys] = useState(apiKeys);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (open) {
      setLocalProvider(provider);
      setLocalModel(model);
      setLocalKeys(apiKeys);
    }
  }, [open, provider, model, apiKeys]);

  const cfg = PROVIDERS.find((p) => p.id === localProvider)!;

  const onProviderChange = (p: string) => {
    const np = p as Provider;
    setLocalProvider(np);
    const def = PROVIDERS.find((x) => x.id === np)!.models[0].id;
    setLocalModel(def);
  };

  const save = () => {
    setProvider(localProvider);
    setModel(localModel);
    (Object.keys(localKeys) as Provider[]).forEach((p) => setApiKey(p, localKeys[p]));
    toast.success("Settings saved");
    setOpen(false);
  };

  const needsKey = !apiKeys[provider];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={needsKey ? "default" : "outline"} size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          {needsKey ? "Add API key" : "Settings"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Model & API key</DialogTitle>
          <DialogDescription>
            Bring your own key. Stored locally in your browser only.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={localProvider} onValueChange={onProviderChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Model</Label>
            <Select value={localModel} onValueChange={setLocalModel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {cfg.models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{cfg.label} API Key</Label>
              <a
                href={cfg.apiKeyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                Get key <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <div className="relative">
              <Input
                type={showKey ? "text" : "password"}
                value={localKeys[localProvider]}
                onChange={(e) =>
                  setLocalKeys((k) => ({ ...k, [localProvider]: e.target.value }))
                }
                placeholder={cfg.apiKeyHint}
                className="mono pr-9"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowKey((s) => !s)}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              The key is sent directly from your browser to {cfg.label}. It never touches our servers.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

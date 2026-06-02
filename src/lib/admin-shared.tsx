import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const PASSWORD_KEY = "deli-aden-admin-pwd";

export function useAdminAuth() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(PASSWORD_KEY) : null;
    if (saved) { setPassword(saved); setAuthed(true); }
    setReady(true);
  }, []);
  const login = (p: string) => { localStorage.setItem(PASSWORD_KEY, p); setPassword(p); setAuthed(true); };
  const logout = () => { localStorage.removeItem(PASSWORD_KEY); setPassword(""); setAuthed(false); };
  return { password, authed, ready, login, logout };
}

export function AdminLogin({ onSuccess }: { onSuccess: (p: string) => void }) {
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md items-center px-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setLoading(true);
          try {
            const r = await api.adminVerify(pwd);
            if (r.ok) onSuccess(pwd);
            else toast.error("Mot de passe invalide");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Erreur");
          } finally { setLoading(false); }
        }}
        className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <h1 className="font-display text-2xl font-bold">Espace administrateur</h1>
        <p className="mt-1 text-sm text-muted-foreground">Entrez le mot de passe pour accéder à l'administration.</p>
        <div className="mt-5">
          <Label className="mb-1.5 block text-sm">Mot de passe</Label>
          <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required autoFocus />
        </div>
        <Button type="submit" className="mt-5 w-full" disabled={loading}>
          {loading ? "Vérification..." : "Se connecter"}
        </Button>
      </form>
    </div>
  );
}

export function playChime() {
  try {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new AC();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.start(); o.stop(ctx.currentTime + 0.6);
  } catch { /* ignore */ }
}

export const STATUS_LABELS: Record<string, string> = {
  new: "Nouvelle",
  accepted: "Acceptée",
  preparing: "En préparation",
  ready: "Prête",
  dispatched: "Expédiée",
  completed: "Terminée",
  cancelled: "Annulée",
};

export const STATUS_FLOW: Record<string, string> = {
  new: "accepted",
  accepted: "preparing",
  preparing: "ready",
  ready: "dispatched",
  dispatched: "completed",
};

export const STATUS_COLORS: Record<string, string> = {
  new: "bg-primary text-primary-foreground",
  accepted: "bg-blue-600 text-white",
  preparing: "bg-amber-500 text-white",
  ready: "bg-emerald-600 text-white",
  dispatched: "bg-indigo-600 text-white",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive text-destructive-foreground",
};

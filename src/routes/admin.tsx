import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type AdminOrder } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { fmt } from "@/lib/cart-store";
import { RefreshCw, Printer, Search, LogOut, Download } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Les Délices d'Aden" }] }),
  component: AdminPage,
});

const PASSWORD_KEY = "deli-aden-admin-pwd";

const STATUSES = [
  { value: "all", label: "Tous" },
  { value: "new", label: "Nouvelle" },
  { value: "accepted", label: "Acceptée" },
  { value: "preparing", label: "En préparation" },
  { value: "ready", label: "Prête" },
  { value: "dispatched", label: "Expédiée" },
  { value: "completed", label: "Terminée" },
  { value: "cancelled", label: "Annulée" },
];

const STATUS_COLORS: Record<string, string> = {
  new: "bg-primary text-primary-foreground",
  accepted: "bg-blue-600 text-white",
  preparing: "bg-amber-500 text-white",
  ready: "bg-emerald-600 text-white",
  dispatched: "bg-indigo-600 text-white",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive text-destructive-foreground",
};


function AdminPage() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(PASSWORD_KEY) : null;
    if (saved) {
      setPassword(saved);
      setAuthed(true);
    }
  }, []);

  if (!authed) return <Login onSuccess={(p) => { localStorage.setItem(PASSWORD_KEY, p); setPassword(p); setAuthed(true); }} />;
  return <Dashboard password={password} onLogout={() => { localStorage.removeItem(PASSWORD_KEY); setAuthed(false); setPassword(""); }} />;
}

function Login({ onSuccess }: { onSuccess: (p: string) => void }) {
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
          } finally {
            setLoading(false);
          }
        }}
        className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <h1 className="font-display text-2xl font-bold">Espace administrateur</h1>
        <p className="mt-1 text-sm text-muted-foreground">Entrez le mot de passe pour accéder aux commandes.</p>
        <div className="mt-5">
          <Label className="mb-1.5 block text-sm">Mot de passe</Label>
          <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} required />
        </div>
        <Button type="submit" className="mt-5 w-full" disabled={loading}>
          {loading ? "Vérification..." : "Se connecter"}
        </Button>
      </form>
    </div>
  );
}

function Dashboard({ password, onLogout }: { password: string; onLogout: () => void }) {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const lastTopIdRef = (typeof window !== "undefined") ? (window as unknown as { _lastTopId?: { current: number | null } })._lastTopId ??= { current: null } : { current: null };

  const playChime = () => {
    try {
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      const ctx = new AC();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      o.start(); o.stop(ctx.currentTime + 0.6);
    } catch { /* ignore */ }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const r = await api.adminListOrders(password, {
        status, search: search.trim() || undefined, from: from || undefined, to: to || undefined,
      });
      const topId = r.orders[0]?.id ?? null;
      if (lastTopIdRef.current !== null && topId !== null && topId !== lastTopIdRef.current) {
        const isNew = r.orders[0]?.status === "new";
        if (isNew) { playChime(); toast.success(`Nouvelle commande ${r.orders[0]?.order_number}`); }
      }
      lastTopIdRef.current = topId;
      setOrders(r.orders);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const t = setInterval(fetchOrders, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, from, to]);

  const onChangeStatus = async (id: number, newStatus: string) => {
    try {
      await api.adminUpdateStatus(password, id, newStatus);
      setOrders((o) => o.map((or) => (or.id === id ? { ...or, status: newStatus } : or)));
      toast.success("Statut mis à jour");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
  };

  const exportCsv = () => {
    const url = api.adminExportCsvUrl({ status, search: search.trim() || undefined, from: from || undefined, to: to || undefined });
    // Server requires X-Admin-Password header; do an authed fetch then trigger download
    fetch(url, { headers: { "X-Admin-Password": password } })
      .then(async (r) => {
        if (!r.ok) throw new Error("Export refusé");
        const blob = await r.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Erreur export"));
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Commandes</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="N°, nom, téléphone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchOrders()}
              className="w-56 pl-8"
            />
          </div>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" title="Du" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" title="Au" />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={fetchOrders} variant="outline" size="icon" disabled={loading} title="Rafraîchir">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={exportCsv} variant="outline" size="sm" className="gap-1" title="Exporter CSV">
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button onClick={onLogout} variant="ghost" size="sm" className="gap-1">
            <LogOut className="h-4 w-4" /> Déconnexion
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Auto-rafraîchissement toutes les 10 secondes • {orders.length} commande(s)</p>

      <div className="mt-6 space-y-3">
        {orders.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">
            Aucune commande
          </div>
        )}
        {orders.map((o) => (
          <article
            key={o.id}
            className={`rounded-2xl border bg-card p-5 shadow-sm transition ${o.status === "new" ? "border-primary ring-2 ring-primary/20" : "border-border"}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-xl font-bold">{o.order_number}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[o.status] ?? "bg-muted"}`}>
                    {STATUSES.find((s) => s.value === o.status)?.label ?? o.status}
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                    {o.order_type === "pickup" ? "Ramassage" : "Livraison"}
                  </span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {new Date(o.created_at).toLocaleString("fr-CA")} • {o.customer_name} • {o.customer_phone}
                  {o.customer_email && ` • ${o.customer_email}`}
                </div>
                {o.delivery_address && <div className="mt-1 text-sm">📍 {o.delivery_address}</div>}
                <div className="mt-1 text-xs text-muted-foreground">
                  Heure: {o.preferred_time} • Paiement: {o.payment_method}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={o.status} onValueChange={(v) => onChangeStatus(o.id, v)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.filter((s) => s.value !== "all").map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={() => window.print()} title="Imprimer">
                  <Printer className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <ul className="mt-4 divide-y divide-border border-t border-border">
              {o.items.map((it, i) => (
                <li key={i} className="flex justify-between gap-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{it.quantity}× {it.name}</div>
                    {it.options && it.options.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {it.options.map((op) => `${op.groupLabel}: ${op.values.join(", ")}`).join(" • ")}
                      </div>
                    )}
                    {it.notes && <div className="text-xs italic text-muted-foreground">Note: {it.notes}</div>}
                  </div>
                  <div className="font-semibold">{fmt(it.unitPrice * it.quantity)}</div>
                </li>
              ))}
            </ul>
            {o.special_notes && (
              <p className="mt-3 rounded-lg bg-secondary p-2 text-xs"><strong>Instructions:</strong> {o.special_notes}</p>
            )}
            <div className="mt-3 flex justify-end gap-4 text-sm">
              <span className="text-muted-foreground">TPS {fmt(o.gst)} • TVQ {fmt(o.qst)}</span>
              <span className="font-display text-lg font-bold text-primary">Total {fmt(o.total)}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

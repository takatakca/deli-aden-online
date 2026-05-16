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
  { value: "completed", label: "Terminée" },
  { value: "cancelled", label: "Annulée" },
];

const STATUS_COLORS: Record<string, string> = {
  new: "bg-primary text-primary-foreground",
  accepted: "bg-blue-600 text-white",
  preparing: "bg-amber-500 text-white",
  ready: "bg-emerald-600 text-white",
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
  const [loading, setLoading] = useState(false);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const r = await api.adminListOrders(password, status, search.trim() || undefined);
      setOrders(r.orders);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const t = setInterval(fetchOrders, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const onChangeStatus = async (id: number, newStatus: string) => {
    try {
      await api.adminUpdateStatus(password, id, newStatus);
      setOrders((o) => o.map((or) => (or.id === id ? { ...or, status: newStatus } : or)));
      toast.success("Statut mis à jour");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    }
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
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={fetchOrders} variant="outline" size="icon" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={onLogout} variant="ghost" size="sm" className="gap-1">
            <LogOut className="h-4 w-4" /> Déconnexion
          </Button>
        </div>
      </div>

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

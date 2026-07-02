import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, type AdminOrder, type OrderEvent } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { fmt } from "@/lib/cart-store";
import { RefreshCw, Printer, Search, Download, History, StickyNote, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { PASSWORD_KEY, playChime, STATUS_LABELS, STATUS_COLORS } from "@/lib/admin-shared";
import { connectAdminEvents, type RealtimeConnection } from "@/lib/realtime";

export const Route = createFileRoute("/admin/")({
  component: OrdersPage,
});

const STATUSES = [
  { value: "all", label: "Tous" },
  { value: "new", label: STATUS_LABELS.new },
  { value: "accepted", label: STATUS_LABELS.accepted },
  { value: "preparing", label: STATUS_LABELS.preparing },
  { value: "ready", label: STATUS_LABELS.ready },
  { value: "dispatched", label: STATUS_LABELS.dispatched },
  { value: "completed", label: STATUS_LABELS.completed },
  { value: "cancelled", label: STATUS_LABELS.cancelled },
];

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .print-receipt, .print-receipt * { visibility: visible !important; }
  .print-receipt { position: absolute !important; left: 0; top: 0; width: 100%; padding: 12mm; font-family: Arial, sans-serif; color: #000; }
  .no-print { display: none !important; }
}
`;

function todayISO(offsetDays = 0) {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function OrdersPage() {
  const password = typeof window !== "undefined" ? localStorage.getItem(PASSWORD_KEY) || "" : "";
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyOrder, setHistoryOrder] = useState<AdminOrder | null>(null);
  const [historyEvents, setHistoryEvents] = useState<OrderEvent[]>([]);
  const [printOrder, setPrintOrder] = useState<AdminOrder | null>(null);
  const lastTopIdRef = useRef<number | null>(null);

  const counters = useMemo(() => {
    const c = { new: 0, preparing: 0, ready: 0, dispatched: 0 };
    for (const o of orders) {
      if (o.status === "new") c.new++;
      else if (o.status === "preparing") c.preparing++;
      else if (o.status === "ready") c.ready++;
      else if (o.status === "dispatched") c.dispatched++;
    }
    return c;
  }, [orders]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const r = await api.adminListOrders(password, {
        status, search: search.trim() || undefined, from: from || undefined, to: to || undefined,
      });
      const topId = r.orders[0]?.id ?? null;
      if (lastTopIdRef.current !== null && topId !== null && topId !== lastTopIdRef.current) {
        if (r.orders[0]?.status === "new") {
          playChime(); toast.success(`Nouvelle commande ${r.orders[0]?.order_number}`);
        }
      }
      lastTopIdRef.current = topId;
      setOrders(r.orders);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchOrders();
    const t = setInterval(fetchOrders, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, from, to]);

  const onChangeStatus = async (o: AdminOrder, newStatus: string) => {
    let reason: string | undefined;
    if (newStatus === "cancelled") {
      const r = window.prompt("Raison de l'annulation ?", "");
      if (r === null) return;
      reason = r.trim() || "Non spécifiée";
    }
    try {
      await api.adminUpdateStatus(password, o.id, newStatus, { reason });
      setOrders((arr) => arr.map((x) => (x.id === o.id ? {
        ...x, status: newStatus,
        dispatched_at: newStatus === "dispatched" && !x.dispatched_at ? new Date().toISOString() : x.dispatched_at,
        completed_at: newStatus === "completed" && !x.completed_at ? new Date().toISOString() : x.completed_at,
        cancel_reason: reason ?? x.cancel_reason,
      } : x)));
      toast.success("Statut mis à jour");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  const onSaveNote = async (o: AdminOrder, note: string) => {
    try {
      await api.adminUpdateStatus(password, o.id, o.status, { note });
      setOrders((arr) => arr.map((x) => (x.id === o.id ? { ...x, admin_notes: note } : x)));
      toast.success("Note enregistrée");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  const openHistory = async (o: AdminOrder) => {
    setHistoryOrder(o); setHistoryEvents([]);
    try { setHistoryEvents((await api.adminListEvents(password, o.id)).events); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  const onRefund = async (o: AdminOrder) => {
    const max = Number(o.total) - Number(o.discount || 0);
    const input = window.prompt(`Montant à rembourser ($) — max ${max.toFixed(2)}`, max.toFixed(2));
    if (input === null) return;
    const amount = Number(input);
    if (!Number.isFinite(amount) || amount <= 0) { toast.error("Montant invalide"); return; }
    const reason = window.prompt("Raison (optionnel) ?", "") || undefined;
    try {
      const r = await api.adminRefundOrder(password, o.id, { amount, reason });
      setOrders((arr) => arr.map((x) => x.id === o.id ? { ...x, payment_status: r.status as AdminOrder["payment_status"] } : x));
      toast.success(`Remboursement effectué (${(r.amount_cents / 100).toFixed(2)} $)`);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  const openPrint = (o: AdminOrder) => { setPrintOrder(o); setTimeout(() => window.print(), 50); };

  const exportCsv = () => {
    const url = api.adminExportCsvUrl({ status, search: search.trim() || undefined, from: from || undefined, to: to || undefined });
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

  const setPreset = (preset: "today" | "yesterday" | "7d" | "clear") => {
    if (preset === "today") { setFrom(todayISO()); setTo(todayISO()); }
    else if (preset === "yesterday") { setFrom(todayISO(-1)); setTo(todayISO(-1)); }
    else if (preset === "7d") { setFrom(todayISO(-6)); setTo(todayISO()); }
    else { setFrom(""); setTo(""); }
  };

  return (
    <div>
      <style>{PRINT_CSS}</style>

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Commandes</h2>
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
        </div>
      </div>

      <div className="no-print mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Période :</span>
        <Button size="sm" variant="outline" onClick={() => setPreset("today")}>Aujourd'hui</Button>
        <Button size="sm" variant="outline" onClick={() => setPreset("yesterday")}>Hier</Button>
        <Button size="sm" variant="outline" onClick={() => setPreset("7d")}>7 derniers jours</Button>
        <Button size="sm" variant="ghost" onClick={() => setPreset("clear")}>Tout</Button>
      </div>

      <div className="no-print mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CounterCard label="Nouvelles" value={counters.new} accent="bg-primary text-primary-foreground" />
        <CounterCard label="En préparation" value={counters.preparing} accent="bg-amber-500 text-white" />
        <CounterCard label="Prêtes" value={counters.ready} accent="bg-emerald-600 text-white" />
        <CounterCard label="Expédiées" value={counters.dispatched} accent="bg-indigo-600 text-white" />
      </div>

      <p className="no-print mt-3 text-xs text-muted-foreground">
        Auto-rafraîchissement toutes les 10 secondes • {orders.length} commande(s)
      </p>

      <div className="no-print mt-6 space-y-3">
        {orders.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground">Aucune commande</div>
        )}
        {orders.map((o) => (
          <OrderCard
            key={o.id} order={o}
            onStatusChange={(s) => onChangeStatus(o, s)}
            onSaveNote={(n) => onSaveNote(o, n)}
            onShowHistory={() => openHistory(o)}
            onPrint={() => openPrint(o)}
            onRefund={() => onRefund(o)}
          />
        ))}
      </div>

      <Dialog open={!!historyOrder} onOpenChange={(v) => !v && setHistoryOrder(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Historique — {historyOrder?.order_number}</DialogTitle></DialogHeader>
          {historyEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : (
            <ul className="space-y-2">
              {historyEvents.map((e) => {
                let meta: { status?: string; note?: string; reason?: string } | string | null = e.meta;
                try { meta = e.meta ? JSON.parse(e.meta) : null; } catch { /* keep raw */ }
                return (
                  <li key={e.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                    <div className="flex justify-between">
                      <strong>{e.event}</strong>
                      <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("fr-CA")}</span>
                    </div>
                    {meta && typeof meta === "object" && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {meta.status && <>Statut: <strong>{meta.status}</strong></>}
                        {meta.note && <div>Note: {meta.note}</div>}
                        {meta.reason && <div>Raison: {meta.reason}</div>}
                      </div>
                    )}
                    {meta && typeof meta === "string" && (
                      <div className="mt-1 text-xs text-muted-foreground">{meta}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryOrder(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {printOrder && (
        <div className="print-receipt">
          <h1 style={{ margin: 0 }}>Les Délices d'Aden</h1>
          <h2 style={{ marginTop: 4 }}>Reçu cuisine — {printOrder.order_number}</h2>
          <p>{new Date(printOrder.created_at).toLocaleString("fr-CA")}</p>
          <p>
            <strong>Client :</strong> {printOrder.customer_name} — {printOrder.customer_phone}<br />
            <strong>Type :</strong> {printOrder.order_type === "pickup" ? "Ramassage" : "Livraison"}<br />
            {printOrder.delivery_address && <><strong>Adresse :</strong> {printOrder.delivery_address}<br /></>}
            <strong>Heure :</strong> {printOrder.preferred_time}
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
            <tbody>
              {printOrder.items.map((it, i) => (
                <tr key={i}>
                  <td style={{ borderBottom: "1px solid #ccc", padding: 4 }}>
                    <strong>{it.quantity}× {it.name}</strong>
                    {it.options && it.options.length > 0 && (
                      <div style={{ fontSize: 12 }}>
                        {it.options.map((op) => `${op.groupLabel}: ${op.values.join(", ")}`).join(" • ")}
                      </div>
                    )}
                    {it.notes && <div style={{ fontSize: 12 }}><em>Note: {it.notes}</em></div>}
                  </td>
                  <td style={{ borderBottom: "1px solid #ccc", padding: 4, textAlign: "right" }}>{fmt(it.unitPrice * it.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {printOrder.special_notes && <p><strong>Instructions :</strong> {printOrder.special_notes}</p>}
          <p style={{ marginTop: 12, fontSize: 18 }}><strong>Total :</strong> {fmt(printOrder.total)}</p>
        </div>
      )}
    </div>
  );
}

function CounterCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className={`mb-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${accent}`}>{label}</div>
      <div className="font-display text-3xl font-bold">{value}</div>
    </div>
  );
}

const PAYMENT_BADGE: Record<string, { label: string; cls: string }> = {
  unpaid:               { label: "Non payée",       cls: "bg-muted text-muted-foreground" },
  pending:              { label: "Paiement…",       cls: "bg-amber-500 text-white" },
  paid:                 { label: "Payée",           cls: "bg-emerald-600 text-white" },
  failed:               { label: "Paiement échoué", cls: "bg-destructive text-destructive-foreground" },
  refunded:             { label: "Remboursée",      cls: "bg-indigo-600 text-white" },
  partially_refunded:   { label: "Partiel. remb.", cls: "bg-indigo-400 text-white" },
};

function OrderCard({
  order: o, onStatusChange, onSaveNote, onShowHistory, onPrint, onRefund,
}: {
  order: AdminOrder;
  onStatusChange: (s: string) => void;
  onSaveNote: (n: string) => void;
  onShowHistory: () => void;
  onPrint: () => void;
  onRefund: () => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState(o.admin_notes || "");
  const payStatus = o.payment_status || "unpaid";
  const payBadge = PAYMENT_BADGE[payStatus] || PAYMENT_BADGE.unpaid;
  const canRefund = payStatus === "paid" || payStatus === "partially_refunded";
  return (
    <article className={`rounded-2xl border bg-card p-5 shadow-sm transition ${o.status === "new" ? "border-primary ring-2 ring-primary/20" : "border-border"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-xl font-bold">{o.order_number}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[o.status] ?? "bg-muted"}`}>
              {STATUS_LABELS[o.status] ?? o.status}
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 text-xs">
              {o.order_type === "pickup" ? "Ramassage" : "Livraison"}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${payBadge.cls}`}>{payBadge.label}</span>
            {o.coupon_code && (
              <span className="rounded-full border border-primary/40 bg-primary/5 px-2 py-0.5 text-xs text-primary">{o.coupon_code}</span>
            )}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {new Date(o.created_at).toLocaleString("fr-CA")} • {o.customer_name} • {o.customer_phone}
            {o.customer_email && ` • ${o.customer_email}`}
          </div>
          {o.delivery_address && <div className="mt-1 text-sm">📍 {o.delivery_address}</div>}
          <div className="mt-1 text-xs text-muted-foreground">
            Heure: {o.preferred_time} • Paiement: {o.payment_method}
            {o.discount && o.discount > 0 ? ` • Remise: -${o.discount.toFixed(2)}$` : ""}
            {o.dispatched_at && ` • Expédiée: ${new Date(o.dispatched_at).toLocaleTimeString("fr-CA")}`}
            {o.completed_at && ` • Terminée: ${new Date(o.completed_at).toLocaleTimeString("fr-CA")}`}
          </div>
          {o.cancel_reason && (
            <div className="mt-1 text-xs text-destructive">Raison annulation : {o.cancel_reason}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={o.status} onValueChange={onStatusChange}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.filter((s) => s.value !== "all").map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={onShowHistory} title="Historique"><History className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => setNoteOpen((v) => !v)} title="Note admin"><StickyNote className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={onPrint} title="Imprimer reçu"><Printer className="h-4 w-4" /></Button>
          {canRefund && (
            <Button variant="outline" size="icon" onClick={onRefund} title="Rembourser"><RotateCcw className="h-4 w-4" /></Button>
          )}
        </div>
      </div>

      {noteOpen && (
        <div className="mt-3 rounded-lg border border-border p-3">
          <Label className="text-xs">Note admin (interne)</Label>
          <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2} className="mt-1" />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setNoteText(o.admin_notes || ""); setNoteOpen(false); }}>Annuler</Button>
            <Button size="sm" onClick={() => { onSaveNote(noteText); setNoteOpen(false); }}>Enregistrer</Button>
          </div>
        </div>
      )}
      {!noteOpen && o.admin_notes && (
        <p className="mt-3 rounded-lg bg-secondary p-2 text-xs"><strong>Note admin :</strong> {o.admin_notes}</p>
      )}

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
        <p className="mt-3 rounded-lg bg-secondary p-2 text-xs"><strong>Instructions client :</strong> {o.special_notes}</p>
      )}
      <div className="mt-3 flex justify-end gap-4 text-sm">
        <span className="text-muted-foreground">TPS {fmt(o.gst)} • TVQ {fmt(o.qst)}</span>
        <span className="font-display text-lg font-bold text-primary">Total {fmt(o.total)}</span>
      </div>
    </article>
  );
}

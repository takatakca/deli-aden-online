import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api, type AdminOrder } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PASSWORD_KEY, playChime, STATUS_FLOW, STATUS_LABELS, STATUS_COLORS } from "@/lib/admin-shared";
import { connectAdminEvents, type RealtimeConnection } from "@/lib/realtime";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/board")({ component: BoardPage });

const COLUMNS = ["new", "accepted", "preparing", "ready", "dispatched"] as const;

function BoardPage() {
  const password = typeof window !== "undefined" ? localStorage.getItem(PASSWORD_KEY) || "" : "";
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const lastTopRef = useRef<number | null>(null);

  const fetchOrders = async () => {
    try {
      const r = await api.adminListOrders(password, {});
      const active = r.orders.filter((o) => o.status !== "completed" && o.status !== "cancelled");
      const topId = active[0]?.id ?? null;
      if (lastTopRef.current !== null && topId !== null && topId !== lastTopRef.current && active[0]?.status === "new") {
        playChime(); toast.success(`Nouvelle commande ${active[0].order_number}`);
      }
      lastTopRef.current = topId;
      setOrders(active);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  useEffect(() => {
    fetchOrders();
    if (!password) return;
    let rt: RealtimeConnection | null = connectAdminEvents(password, (ev) => {
      if (ev === "order_created" || ev === "order_status_changed" || ev === "order_assigned" || ev === "order_delivered") fetchOrders();
    }, { fallbackPoll: fetchOrders, pollIntervalMs: 5000 });
    const safety = setInterval(fetchOrders, 15000);
    return () => { rt?.close(); clearInterval(safety); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password]);

  const advance = async (o: AdminOrder) => {
    const next = STATUS_FLOW[o.status];
    if (!next) return;
    try {
      await api.adminUpdateStatus(password, o.id, next);
      setOrders((arr) => arr.filter((x) => next === "completed" ? x.id !== o.id : true).map((x) => x.id === o.id ? { ...x, status: next } : x));
      toast.success(`→ ${STATUS_LABELS[next]}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Tableau des commandes</h2>
        <span className="text-xs text-muted-foreground">Auto-rafraîchissement 5s • {orders.length} active(s)</span>
      </div>
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-5">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => o.status === col);
          return (
            <div key={col} className="rounded-2xl border border-border bg-secondary/30 p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[col]}`}>{STATUS_LABELS[col]}</span>
                <span className="text-xs text-muted-foreground">{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.length === 0 && <p className="text-center text-xs text-muted-foreground">—</p>}
                {list.map((o) => (
                  <div key={o.id} className="rounded-lg border border-border bg-card p-2.5 text-sm shadow-sm">
                    <div className="flex justify-between gap-2">
                      <strong className="text-primary">{o.order_number}</strong>
                      <span className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className="text-xs">{o.customer_name} • {o.order_type === "pickup" ? "Rams." : "Liv."}</div>
                    <div className="text-xs text-muted-foreground">{o.items.length} article(s) — {o.total.toFixed(2)}$</div>
                    {STATUS_FLOW[o.status] && (
                      <Button size="sm" className="mt-2 h-7 w-full text-xs" onClick={() => advance(o)}>
                        → {STATUS_LABELS[STATUS_FLOW[o.status]]}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

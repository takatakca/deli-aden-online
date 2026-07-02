import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { api, type AdminOrder } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PASSWORD_KEY, playChime, STATUS_FLOW, STATUS_LABELS, STATUS_COLORS } from "@/lib/admin-shared";
import { connectAdminEvents, type RealtimeConnection } from "@/lib/realtime";
import { toast } from "sonner";
import { X } from "lucide-react";

export const Route = createFileRoute("/admin/kitchen")({ component: KitchenPage });

const ACTIVE = ["new", "accepted", "preparing", "ready"] as const;

function KitchenPage() {
  const password = typeof window !== "undefined" ? localStorage.getItem(PASSWORD_KEY) || "" : "";
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const lastIdsRef = useRef<Set<number>>(new Set());

  const fetchOrders = async () => {
    try {
      const r = await api.adminListOrders(password, {});
      const active = r.orders.filter((o) => (ACTIVE as readonly string[]).includes(o.status));
      const ids = new Set(active.map((o) => o.id));
      const newOnes = active.filter((o) => !lastIdsRef.current.has(o.id) && o.status === "new");
      if (lastIdsRef.current.size > 0 && newOnes.length > 0) {
        playChime(); toast.success(`Nouvelle commande ${newOnes[0].order_number}`);
      }
      lastIdsRef.current = ids;
      setOrders(active);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  useEffect(() => {
    fetchOrders();
    const t = setInterval(fetchOrders, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advance = async (o: AdminOrder) => {
    const next = STATUS_FLOW[o.status]; if (!next) return;
    try { await api.adminUpdateStatus(password, o.id, next); fetchOrders(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  return (
    <div className="min-h-screen bg-black p-4 text-white">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">🍳 Cuisine — {orders.length} commande(s)</h1>
        <Link to="/admin">
          <Button variant="outline" size="sm" className="bg-white text-black"><X className="mr-1 h-4 w-4" /> Quitter</Button>
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {orders.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-white/20 p-16 text-center text-white/60">
            Aucune commande en cours
          </div>
        )}
        {orders.map((o) => (
          <div key={o.id} className={`rounded-2xl border-2 p-4 ${o.status === "new" ? "animate-pulse border-red-500 bg-red-950" : "border-white/20 bg-zinc-900"}`}>
            <div className="flex items-center justify-between">
              <span className="font-display text-2xl font-bold">{o.order_number}</span>
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${STATUS_COLORS[o.status]}`}>{STATUS_LABELS[o.status]}</span>
            </div>
            <div className="mt-1 text-sm text-white/70">
              {new Date(o.created_at).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })} • {o.order_type === "pickup" ? "Ramassage" : "Livraison"} • {o.preferred_time}
            </div>
            <ul className="my-3 space-y-1.5 text-base">
              {o.items.map((it, i) => (
                <li key={i}>
                  <div className="font-bold">{it.quantity}× {it.name}</div>
                  {it.options && it.options.length > 0 && (
                    <div className="pl-4 text-xs text-amber-300">
                      {it.options.map((op) => `${op.groupLabel}: ${op.values.join(", ")}`).join(" • ")}
                    </div>
                  )}
                  {it.notes && <div className="pl-4 text-xs italic text-amber-200">⚠ {it.notes}</div>}
                </li>
              ))}
            </ul>
            {o.special_notes && (
              <div className="mb-3 rounded-md bg-amber-900/40 p-2 text-sm text-amber-100">⚠ {o.special_notes}</div>
            )}
            {STATUS_FLOW[o.status] && (
              <Button size="lg" className="w-full text-base" onClick={() => advance(o)}>
                → {STATUS_LABELS[STATUS_FLOW[o.status]]}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

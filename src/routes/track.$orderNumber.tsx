import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type AdminOrder, type PublicSettings } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/cart-store";
import { Phone, MapPin, CheckCircle2, Clock } from "lucide-react";
import { connectOrderEvents, type RealtimeConnection } from "@/lib/realtime";

export const Route = createFileRoute("/track/$orderNumber")({
  head: ({ params }) => ({
    meta: [
      { title: `Suivi commande ${params.orderNumber} — Les Délices d'Aden` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TrackPage,
});

const STEPS: Array<{ key: string; label: string }> = [
  { key: "new", label: "Commande reçue" },
  { key: "accepted", label: "Acceptée" },
  { key: "preparing", label: "En préparation" },
  { key: "ready", label: "Prête" },
  { key: "assigned", label: "Livreur assigné" },
  { key: "driver_accepted", label: "Livreur a accepté" },
  { key: "picked_up", label: "Ramassée par le livreur" },
  { key: "dispatched", label: "En route" },
  { key: "completed", label: "Livrée" },
];

function TrackPage() {
  const { orderNumber } = Route.useParams();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSettings().then((r) => setSettings(r.settings)).catch(() => {});
    const load = () => api.getOrder(orderNumber)
      .then((r) => setOrder(r.order))
      .catch(() => {})
      .finally(() => setLoading(false));
    load();
    const rt: RealtimeConnection = connectOrderEvents(orderNumber, (ev) => {
      if (
        ev === "order_status_changed" ||
        ev === "driver_assigned" ||
        ev === "driver_unassigned" ||
        ev === "driver_accepted" ||
        ev === "driver_picked_up" ||
        ev === "order_delivered" ||
        ev === "payment_status_changed" ||
        ev === "order_created"
      ) load();
    }, { fallbackPoll: load, pollIntervalMs: 10000 });
    const safety = setInterval(load, 30000);
    return () => { rt.close(); clearInterval(safety); };
  }, [orderNumber]);

  if (loading) return <div className="p-20 text-center text-muted-foreground">Chargement…</div>;
  if (!order) return (
    <div className="p-20 text-center">
      <h1 className="font-display text-2xl">Commande introuvable</h1>
      <Link to="/" className="mt-4 inline-block"><Button>Accueil</Button></Link>
    </div>
  );

  // Compute farthest reached step from status + driver timeline.
  const stepIdx = (k: string) => STEPS.findIndex((s) => s.key === k);
  let currentStep = order.status === "cancelled" ? -1 : stepIdx(order.status);
  if (order.status !== "cancelled") {
    if (order.assigned_at) currentStep = Math.max(currentStep, stepIdx("assigned"));
    if (order.driver_accepted_at || order.driver_status === "accepted") currentStep = Math.max(currentStep, stepIdx("driver_accepted"));
    if (order.picked_up_at || order.driver_status === "picked_up") currentStep = Math.max(currentStep, stepIdx("picked_up"));
    if (order.status === "dispatched") currentStep = Math.max(currentStep, stepIdx("dispatched"));
    if (order.status === "completed" || order.delivered_at) currentStep = stepIdx("completed");
  }
  const eta = order.order_type === "delivery" ? settings?.est_delivery_min : settings?.est_pickup_min;
  const driverStatusLabel = order.driver_status === "accepted" ? "A accepté"
    : order.driver_status === "picked_up" ? "A ramassé la commande"
    : order.driver_status === "delivered" ? "Livrée"
    : order.driver_status === "assigned" ? "Assigné" : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Commande</div>
        <div className="font-display text-3xl font-bold text-primary">{order.order_number}</div>
        <div className="mt-2 text-sm text-muted-foreground">{order.customer_name} • {order.order_type === "pickup" ? "Ramassage" : "Livraison"}</div>
        {order.status === "cancelled" ? (
          <div className="mt-4 rounded-lg bg-destructive/10 p-3 text-destructive">
            <strong>Commande annulée</strong>
            {order.cancel_reason && <div className="text-sm">{order.cancel_reason}</div>}
          </div>
        ) : (
          <>
            {eta && currentStep < 4 && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm">
                <Clock className="h-4 w-4" /> Temps estimé : ~{eta} min
              </div>
            )}
          </>
        )}
      </div>

      {order.status !== "cancelled" && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <ol className="space-y-3">
            {STEPS
              .filter((s) => order.order_type === "delivery" || !["assigned","driver_accepted","picked_up","dispatched"].includes(s.key))
              .map((s) => {
                const idx = STEPS.findIndex((x) => x.key === s.key);
                const done = idx <= currentStep;
                const current = idx === currentStep;
                const ts = s.key === "assigned" ? order.assigned_at
                  : s.key === "driver_accepted" ? order.driver_accepted_at
                  : s.key === "picked_up" ? order.picked_up_at
                  : s.key === "completed" ? order.delivered_at
                  : null;
                return (
                  <li key={s.key} className={`flex items-center gap-3 ${done ? "" : "opacity-40"}`}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${current ? "border-primary bg-primary text-primary-foreground animate-pulse" : done ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-background"}`}>
                      {done ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                    </div>
                    <span className={`font-medium ${current ? "text-primary" : ""}`}>{s.label}</span>
                    {ts && <span className="ml-auto text-xs text-muted-foreground">{new Date(ts).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}</span>}
                  </li>
                );
              })}
          </ol>
        </div>
      )}

      {order.order_type === "delivery" && order.driver_name && (
        <div className="mt-6 rounded-2xl border border-emerald-500/40 bg-emerald-50 p-4 dark:bg-emerald-950/30">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Votre livreur</div>
          <div className="mt-1 font-display text-lg font-semibold">🚚 {order.driver_name}</div>
          {driverStatusLabel && (
            <div className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">Statut : {driverStatusLabel}</div>
          )}
          {order.driver_phone && (
            <a href={`tel:${order.driver_phone}`} className="mt-2 inline-block">
              <Button variant="outline" size="sm"><Phone className="mr-2 h-4 w-4" /> Appeler le livreur — {order.driver_phone}</Button>
            </a>
          )}
        </div>
      )}

      {settings && (settings.restaurant_phone || settings.google_maps_url || settings.restaurant_address) && (
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {settings.restaurant_phone && (
            <a href={`tel:${settings.restaurant_phone}`}>
              <Button variant="outline" className="w-full"><Phone className="mr-2 h-4 w-4" /> Appeler {settings.restaurant_phone}</Button>
            </a>
          )}
          {settings.google_maps_url && (
            <a href={settings.google_maps_url} target="_blank" rel="noreferrer">
              <Button variant="outline" className="w-full"><MapPin className="mr-2 h-4 w-4" /> Itinéraire</Button>
            </a>
          )}
        </div>
      )}

      {settings?.restaurant_address && (
        <p className="mt-4 rounded-lg border border-border bg-card p-3 text-center text-sm text-muted-foreground">
          📍 {settings.restaurant_address}
        </p>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 font-display text-lg font-semibold">Récapitulatif</h2>
        <ul className="divide-y divide-border text-sm">
          {order.items.map((it, i) => (
            <li key={i} className="flex justify-between py-2">
              <span>{it.quantity}× {it.name}</span>
              <span className="font-medium">{fmt(it.unitPrice * it.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-border pt-3 font-bold">
          <span>Total</span><span className="text-primary">{fmt(order.total)}</span>
        </div>
      </div>

      <div className="mt-6 text-center">
        <Link to="/"><Button variant="ghost">Retour à l'accueil</Button></Link>
      </div>
    </div>
  );
}

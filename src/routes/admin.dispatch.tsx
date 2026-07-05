import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type Driver, type Assignment, type AdminOrder } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PASSWORD_KEY } from "@/lib/admin-shared";
import { connectAdminEvents, type RealtimeConnection } from "@/lib/realtime";
import { toast } from "sonner";
import { Trash2, Truck, CheckCircle2, MapPin, Phone } from "lucide-react";

export const Route = createFileRoute("/admin/dispatch")({ component: DispatchPage });

function DispatchPage() {
  const password = typeof window !== "undefined" ? localStorage.getItem(PASSWORD_KEY) || "" : "";
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [readyOrders, setReadyOrders] = useState<AdminOrder[]>([]);
  const [newDriver, setNewDriver] = useState({ name: "", phone: "" });
  const [pick, setPick] = useState<Record<number, number>>({});

  const load = async () => {
    try {
      const [d, a, o] = await Promise.all([
        api.adminListDrivers(password),
        api.adminListAssignments(password, true),
        api.adminListOrders(password, { status: "ready" }),
      ]);
      setDrivers(d.drivers);
      setAssignments(a.assignments);
      setReadyOrders(o.orders.filter((x) => x.order_type === "delivery"));
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  useEffect(() => {
    load();
    if (!password) return;
    const rt: RealtimeConnection = connectAdminEvents(password, (ev) => {
      if (
        ev === "order_created" || ev === "order_status_changed" ||
        ev === "order_assigned" || ev === "order_unassigned" ||
        ev === "order_delivered" || ev === "driver_accepted" ||
        ev === "driver_picked_up" || ev === "driver_online" || ev === "driver_offline"
      ) load();
    }, { fallbackPoll: load, pollIntervalMs: 10000 });
    const safety = setInterval(load, 30000);
    return () => { rt.close(); clearInterval(safety); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password]);

  const createDriver = async () => {
    if (!newDriver.name.trim()) return;
    try {
      await api.adminCreateDriver(password, { name: newDriver.name.trim(), phone: newDriver.phone.trim() });
      setNewDriver({ name: "", phone: "" });
      toast.success("Livreur ajouté"); load();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  const toggleActive = async (d: Driver) => {
    const active = !d.active;
    try { await api.adminUpdateDriver(password, d.id, { active: active as unknown as Driver["active"] }); load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  const removeDriver = async (id: number) => {
    if (!confirm("Supprimer ce livreur ?")) return;
    try { await api.adminDeleteDriver(password, id); load(); } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  const assign = async (orderId: number) => {
    const driverId = pick[orderId];
    if (!driverId) { toast.error("Sélectionnez un livreur"); return; }
    try { await api.adminAssignDriver(password, orderId, driverId); toast.success("Assigné — commande expédiée"); load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  const markDelivered = async (orderId: number) => {
    try { await api.adminMarkDelivered(password, orderId); toast.success("Livraison confirmée"); load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  const unassign = async (orderId: number) => {
    if (!confirm("Retirer ce livreur ? La commande repassera à 'Prête'.")) return;
    try { await api.adminUnassignOrder(password, orderId); toast.success("Livreur retiré"); load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };
  const reassign = async (orderId: number, driverId: number) => {
    if (!driverId) return;
    try { await api.adminReassignOrder(password, orderId, driverId); toast.success("Livreur réassigné"); load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  const statusLabel = (s?: string | null) => s === "accepted" ? "Acceptée" : s === "picked_up" ? "Ramassée" : s === "delivered" ? "Livrée" : "Assignée";
  const statusClass = (s?: string | null) =>
    s === "delivered" ? "bg-emerald-600 text-white"
    : s === "picked_up" ? "bg-amber-500 text-white"
    : s === "accepted" ? "bg-blue-600 text-white"
    : "bg-muted text-foreground";
  const fmtTime = (t?: string | null) => t ? new Date(t).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" }) : "—";

  const activeDrivers = drivers.filter((d) => d.active);

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">Livraison & dispatch</h2>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-3 font-semibold">Livreurs</h3>
        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input placeholder="Nom" value={newDriver.name} onChange={(e) => setNewDriver((p) => ({ ...p, name: e.target.value }))} />
          <Input placeholder="Téléphone" value={newDriver.phone} onChange={(e) => setNewDriver((p) => ({ ...p, phone: e.target.value }))} />
          <Button onClick={createDriver}>Ajouter</Button>
        </div>
        {drivers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun livreur. Ajoutez-en un ci-dessus.</p>
        ) : (
          <ul className="divide-y divide-border">
            {drivers.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">{d.name}</div>
                  {d.phone && <div className="text-xs text-muted-foreground">{d.phone}</div>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Actif</Label>
                    <Switch checked={!!d.active} onCheckedChange={() => toggleActive(d)} />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeDriver(d.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-3 font-semibold">Commandes prêtes à expédier ({readyOrders.length})</h3>
        {readyOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune livraison à expédier.</p>
        ) : (
          <ul className="space-y-2">
            {readyOrders.map((o) => {
              const mapsHref = o.delivery_address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.delivery_address)}` : "";
              return (
                <li key={o.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div><strong>{o.order_number}</strong> — {o.customer_name} • <a href={`tel:${o.customer_phone}`} className="text-primary underline">{o.customer_phone}</a></div>
                      <div className="mt-1 text-xs text-muted-foreground">📍 {o.delivery_address}</div>
                      {(o.delivery_unit || o.delivery_door_code) && (
                        <div className="text-xs text-muted-foreground">
                          {o.delivery_unit && <>App./Unité : <strong>{o.delivery_unit}</strong> </>}
                          {o.delivery_door_code && <>• Code : <strong>{o.delivery_door_code}</strong></>}
                        </div>
                      )}
                      {o.delivery_instructions && (
                        <div className="text-xs italic text-muted-foreground">📝 {o.delivery_instructions}</div>
                      )}
                      <div className="mt-1 text-xs text-muted-foreground">{o.total.toFixed(2)}$ • {o.preferred_time}</div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      {mapsHref && (
                        <a href={mapsHref} target="_blank" rel="noreferrer">
                          <Button variant="outline" size="sm"><MapPin className="mr-1 h-4 w-4" /> Maps</Button>
                        </a>
                      )}
                      <Select value={pick[o.id]?.toString() || ""} onValueChange={(v) => setPick((p) => ({ ...p, [o.id]: Number(v) }))}>
                        <SelectTrigger className="w-44"><SelectValue placeholder="Choisir livreur" /></SelectTrigger>
                        <SelectContent>
                          {activeDrivers.length === 0 && <div className="p-2 text-xs text-muted-foreground">Aucun livreur actif</div>}
                          {activeDrivers.map((d) => <SelectItem key={d.id} value={d.id.toString()}>{d.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button onClick={() => assign(o.id)} disabled={!pick[o.id]}><Truck className="mr-1 h-4 w-4" /> Assigner</Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-3 font-semibold">Livraisons en cours ({assignments.length})</h3>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune livraison en cours.</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => {
              const mapsHref = a.delivery_address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.delivery_address)}` : "";
              return (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <div><strong>{a.order_number}</strong> → 🚚 <strong>{a.driver_name}</strong>{a.driver_phone && <> • <a href={`tel:${a.driver_phone}`} className="text-primary underline"><Phone className="inline h-3 w-3" /> {a.driver_phone}</a></>}</div>
                    <div className="text-xs text-muted-foreground">{a.customer_name} • <a href={`tel:${a.customer_phone}`} className="text-primary underline">{a.customer_phone}</a></div>
                    <div className="text-xs text-muted-foreground">📍 {a.delivery_address}</div>
                    {a.notes && <div className="text-xs italic text-muted-foreground">📝 {a.notes}</div>}
                    <div className="text-xs text-muted-foreground">Assigné à {new Date(a.assigned_at).toLocaleTimeString("fr-CA")}{a.delivered_at && <> • Livrée à {new Date(a.delivered_at).toLocaleTimeString("fr-CA")}</>}</div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {mapsHref && (
                      <a href={mapsHref} target="_blank" rel="noreferrer">
                        <Button variant="outline" size="sm"><MapPin className="mr-1 h-4 w-4" /> Maps</Button>
                      </a>
                    )}
                    {!a.delivered_at && (
                      <Button onClick={() => markDelivered(a.order_id)} className="bg-emerald-600 hover:bg-emerald-700">
                        <CheckCircle2 className="mr-1 h-4 w-4" /> Livrée
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

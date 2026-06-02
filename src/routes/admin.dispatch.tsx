import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type Driver, type Assignment, type AdminOrder } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PASSWORD_KEY } from "@/lib/admin-shared";
import { toast } from "sonner";
import { Trash2, Truck, CheckCircle2 } from "lucide-react";

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
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            {readyOrders.map((o) => (
              <li key={o.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong>{o.order_number}</strong> — {o.customer_name} • {o.customer_phone}
                    <div className="text-xs text-muted-foreground">📍 {o.delivery_address}</div>
                    <div className="text-xs text-muted-foreground">{o.total.toFixed(2)}$ • {o.preferred_time}</div>
                  </div>
                  <div className="flex items-center gap-2">
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
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-3 font-semibold">Livraisons en cours ({assignments.length})</h3>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune livraison en cours.</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                <div>
                  <strong>{a.order_number}</strong> → 🚚 <strong>{a.driver_name}</strong>
                  <div className="text-xs text-muted-foreground">{a.customer_name} • {a.customer_phone}</div>
                  <div className="text-xs text-muted-foreground">📍 {a.delivery_address}</div>
                  <div className="text-xs text-muted-foreground">Assigné à {new Date(a.assigned_at).toLocaleTimeString("fr-CA")}</div>
                </div>
                <Button onClick={() => markDelivered(a.order_id)} variant="default" className="bg-emerald-600 hover:bg-emerald-700">
                  <CheckCircle2 className="mr-1 h-4 w-4" /> Livrée
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

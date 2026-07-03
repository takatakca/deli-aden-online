import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type DriverOrder } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { connectOrderEvents } from "@/lib/realtime";
import { MapPin, Phone, Truck, CheckCircle2, LogOut, Package } from "lucide-react";

export const Route = createFileRoute("/driver")({
  head: () => ({ meta: [{ title: "Portail Livreur — Deli Aden" }, { name: "robots", content: "noindex" }] }),
  component: DriverPortal,
});

const TOKEN_KEY = "deli-aden-driver-token";

function DriverPortal() {
  const [token, setToken] = useState<string>(() => (typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) || "" : ""));
  const [me, setMe] = useState<{ id: number; name: string; phone: string; shift_online: boolean } | null>(null);
  const [orders, setOrders] = useState<DriverOrder[]>([]);
  const [loading, setLoading] = useState(false);

  const logout = () => { localStorage.removeItem(TOKEN_KEY); setToken(""); setMe(null); setOrders([]); };

  const load = async () => {
    if (!token) return;
    try {
      const [m, o] = await Promise.all([api.driverMe(token), api.driverOrders(token)]);
      setMe(m.driver); setOrders(o.orders);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur";
      if (/session/i.test(msg)) logout();
      else toast.error(msg);
    }
  };

  useEffect(() => {
    if (!token) return;
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token || !me) return <DriverLogin onLogin={(t) => { localStorage.setItem(TOKEN_KEY, t); setToken(t); }} />;

  const toggleShift = async () => {
    try { const r = await api.driverShift(token, !me.shift_online); setMe({ ...me, shift_online: r.online }); toast.success(r.online ? "En ligne" : "Hors ligne"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  const doAction = async (id: number, action: "accept" | "picked-up" | "delivered") => {
    setLoading(true);
    try {
      if (action === "accept") await api.driverAccept(token, id);
      else if (action === "picked-up") await api.driverPickedUp(token, id);
      else await api.driverDelivered(token, id);
      toast.success("Mis à jour");
      load();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
    finally { setLoading(false); }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-xl font-bold">Bonjour {me.name}</h1>
          <div className="text-xs text-muted-foreground">{me.phone}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-sm">En ligne</Label>
            <Switch checked={me.shift_online} onCheckedChange={toggleShift} />
          </div>
          <Button variant="ghost" size="sm" onClick={logout}><LogOut className="mr-1 h-4 w-4" /> Sortie</Button>
        </div>
      </header>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
          <Package className="mx-auto mb-2 h-8 w-8" />
          Aucune livraison assignée pour le moment.
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => {
            const maps = o.delivery_address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.delivery_address)}` : "";
            return (
              <li key={o.assignment_id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <strong>{o.order_number}</strong>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${o.driver_status === "delivered" ? "bg-emerald-100 text-emerald-800" : o.driver_status === "picked_up" ? "bg-blue-100 text-blue-800" : o.driver_status === "accepted" ? "bg-amber-100 text-amber-800" : "bg-muted"}`}>{o.driver_status}</span>
                  <span className="ml-auto text-sm text-muted-foreground">{o.total.toFixed(2)}$</span>
                </div>
                <div className="text-sm">
                  <div><strong>{o.customer_name}</strong> — <a href={`tel:${o.customer_phone}`} className="text-primary underline"><Phone className="inline h-3 w-3" /> {o.customer_phone}</a></div>
                  {o.delivery_address && <div className="text-muted-foreground">📍 {o.delivery_address}</div>}
                  {(o.delivery_unit || o.delivery_door_code) && (
                    <div className="text-xs text-muted-foreground">
                      {o.delivery_unit && <>Unité : <strong>{o.delivery_unit}</strong> </>}
                      {o.delivery_door_code && <>• Code : <strong>{o.delivery_door_code}</strong></>}
                    </div>
                  )}
                  {o.delivery_instructions && <div className="text-xs italic text-muted-foreground">📝 {o.delivery_instructions}</div>}
                  {o.special_notes && <div className="text-xs italic text-muted-foreground">Note client : {o.special_notes}</div>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {maps && (
                    <a href={maps} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm"><MapPin className="mr-1 h-4 w-4" /> Maps</Button>
                    </a>
                  )}
                  {o.driver_status === "assigned" && (
                    <Button size="sm" onClick={() => doAction(o.order_id, "accept")} disabled={loading}>Accepter</Button>
                  )}
                  {o.driver_status === "accepted" && (
                    <Button size="sm" onClick={() => doAction(o.order_id, "picked-up")} disabled={loading}>
                      <Truck className="mr-1 h-4 w-4" /> Récupérée
                    </Button>
                  )}
                  {o.driver_status === "picked_up" && (
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => doAction(o.order_id, "delivered")} disabled={loading}>
                      <CheckCircle2 className="mr-1 h-4 w-4" /> Livrée
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DriverLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const requestOtp = async () => {
    if (!phone) { toast.error("Numéro requis"); return; }
    setLoading(true);
    try { await api.driverRequestOtp(phone); setOtpSent(true); toast.success("Code envoyé par SMS"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
    finally { setLoading(false); }
  };

  const login = async () => {
    if (!phone || !code) { toast.error("Numéro et code requis"); return; }
    setLoading(true);
    try { const r = await api.driverLogin(phone, code); onLogin(r.token); toast.success(`Bienvenue ${r.driver.name}`); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
    finally { setLoading(false); }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="mb-1 font-display text-xl font-bold">Portail livreur</h1>
        <p className="mb-4 text-sm text-muted-foreground">Connectez-vous avec votre numéro de téléphone.</p>
        <div className="space-y-3">
          <div>
            <Label>Téléphone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 514 555 0100" />
          </div>
          <div>
            <Label>Code (OTP ou PIN)</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={requestOtp} disabled={loading}>Envoyer OTP par SMS</Button>
            <Button onClick={login} disabled={loading}>Se connecter</Button>
          </div>
          {otpSent && <p className="text-xs text-muted-foreground">Un code a été envoyé par SMS (valide 10 min).</p>}
          <p className="text-xs text-muted-foreground">Si SMS OTP indisponible, utilisez votre PIN administrateur.</p>
        </div>
      </div>
    </div>
  );
}

// Ensure realtime import is used (no-op reference; strict TS)
void connectOrderEvents;

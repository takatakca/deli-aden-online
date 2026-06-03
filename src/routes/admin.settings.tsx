import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type PublicSettings } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PASSWORD_KEY } from "@/lib/admin-shared";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/settings")({ component: SettingsPage });

function SettingsPage() {
  const password = typeof window !== "undefined" ? localStorage.getItem(PASSWORD_KEY) || "" : "";
  const [s, setS] = useState<PublicSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.adminGetSettings(password).then((r) => setS(r.settings)).catch((e) => toast.error(e.message));
  }, [password]);

  const update = <K extends keyof PublicSettings>(k: K, v: PublicSettings[K]) =>
    setS((p) => (p ? { ...p, [k]: v } : p));

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      const r = await api.adminUpdateSettings(password, s);
      setS(r.settings);
      toast.success("Réglages enregistrés");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
    finally { setSaving(false); }
  };

  if (!s) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="max-w-3xl space-y-6">
      <h2 className="font-display text-xl font-bold">Réglages du restaurant</h2>

      <Section title="État du restaurant">
        <Toggle label="Ouvert" v={s.is_open} on={(v) => update("is_open", v)} desc="Désactivez pour fermer complètement les commandes." />
        <Toggle label="Pause des commandes" v={s.orders_paused} on={(v) => update("orders_paused", v)} desc="Suspend temporairement la prise de commande (le restaurant reste affiché ouvert)." />
        <Field label="Message si fermé"><Textarea value={s.closed_message} onChange={(e) => update("closed_message", e.target.value)} rows={2} /></Field>
        <Field label="Message si pause"><Textarea value={s.order_pause_message} onChange={(e) => update("order_pause_message", e.target.value)} rows={2} /></Field>
      </Section>

      <Section title="Modes de récupération">
        <Toggle label="Ramassage activé" v={s.pickup_enabled} on={(v) => update("pickup_enabled", v)} />
        <Toggle label="Livraison activée" v={s.delivery_enabled} on={(v) => update("delivery_enabled", v)} />
        <Grid2>
          <Field label="Temps estimé ramassage (min)"><Input type="number" value={s.est_pickup_min} onChange={(e) => update("est_pickup_min", Number(e.target.value))} /></Field>
          <Field label="Temps estimé livraison (min)"><Input type="number" value={s.est_delivery_min} onChange={(e) => update("est_delivery_min", Number(e.target.value))} /></Field>
        </Grid2>
        <Grid2>
          <Field label="Minimum de commande ($)"><Input type="number" step="0.01" value={s.min_order} onChange={(e) => update("min_order", Number(e.target.value))} /></Field>
          <Field label="Frais de livraison ($)"><Input type="number" step="0.01" value={s.delivery_fee} onChange={(e) => update("delivery_fee", Number(e.target.value))} /></Field>
        </Grid2>
        <Field label="Livraison gratuite à partir de ($, 0 = jamais)">
          <Input type="number" step="0.01" value={s.free_delivery_threshold} onChange={(e) => update("free_delivery_threshold", Number(e.target.value))} />
        </Field>
        <Field label="Zone de livraison (texte affiché aux clients)">
          <Textarea value={s.delivery_zone_text} onChange={(e) => update("delivery_zone_text", e.target.value)} rows={2} placeholder="Livraison disponible dans un rayon de 8 km autour du restaurant." />
        </Field>
      </Section>

      <Section title="Taxes">
        <Grid2>
          <Field label="TPS (ex: 0.05)"><Input type="number" step="0.0001" value={s.gst_rate} onChange={(e) => update("gst_rate", Number(e.target.value))} /></Field>
          <Field label="TVQ (ex: 0.09975)"><Input type="number" step="0.0001" value={s.qst_rate} onChange={(e) => update("qst_rate", Number(e.target.value))} /></Field>
        </Grid2>
      </Section>

      <Section title="Coordonnées">
        <Field label="Nom du restaurant"><Input value={s.restaurant_name} onChange={(e) => update("restaurant_name", e.target.value)} /></Field>
        <Grid2>
          <Field label="Téléphone"><Input value={s.restaurant_phone} onChange={(e) => update("restaurant_phone", e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={s.restaurant_email} onChange={(e) => update("restaurant_email", e.target.value)} /></Field>
        </Grid2>
        <Field label="Adresse"><Textarea value={s.restaurant_address} onChange={(e) => update("restaurant_address", e.target.value)} rows={2} /></Field>
        <Field label="Lien Google Maps"><Input value={s.google_maps_url} onChange={(e) => update("google_maps_url", e.target.value)} placeholder="https://maps.google.com/?q=..." /></Field>
        <Field label="Heures d'ouverture"><Textarea value={s.opening_hours} onChange={(e) => update("opening_hours", e.target.value)} rows={3} placeholder="Lun-Ven : 11h-22h&#10;Sam-Dim : 12h-23h" /></Field>
      </Section>

      <Section title="Menu — Catégories masquées">
        <Field label="IDs de catégories à masquer (séparés par des virgules)">
          <Input value={s.hidden_categories} onChange={(e) => update("hidden_categories", e.target.value)} placeholder="desserts,boissons-chaudes" />
        </Field>
      </Section>

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <Button onClick={save} disabled={saving} size="lg">{saving ? "Enregistrement…" : "Enregistrer tous les réglages"}</Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h3 className="mb-4 font-display text-lg font-semibold">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="mb-1.5 block text-sm">{label}</Label>{children}</div>;
}
function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}
function Toggle({ label, v, on, desc }: { label: string; v: boolean; on: (b: boolean) => void; desc?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background p-3">
      <div>
        <div className="font-medium">{label}</div>
        {desc && <div className="text-xs text-muted-foreground">{desc}</div>}
      </div>
      <Switch checked={v} onCheckedChange={on} />
    </div>
  );
}

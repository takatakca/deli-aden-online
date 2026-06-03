import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type PublicSettings } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Phone, MapPin, Clock, Truck, CheckCircle2, XCircle } from "lucide-react";
import { fmt } from "@/lib/cart-store";

export const Route = createFileRoute("/delivery")({
  head: () => ({
    meta: [
      { title: "Livraison — Les Délices d'Aden" },
      { name: "description", content: "Service de livraison à domicile. Minimum de commande, frais, zones desservies et temps de livraison estimés." },
      { property: "og:title", content: "Livraison — Les Délices d'Aden" },
      { property: "og:description", content: "Faites-vous livrer vos plats algériens préférés à domicile." },
      { property: "og:url", content: "/delivery" },
    ],
    links: [{ rel: "canonical", href: "/delivery" }],
  }),
  component: DeliveryPage,
});

function DeliveryPage() {
  const [s, setS] = useState<PublicSettings | null>(null);
  useEffect(() => { api.getSettings().then((r) => setS(r.settings)).catch(() => setS(null)); }, []);

  const enabled = s ? s.delivery_enabled && s.is_open && !s.orders_paused : true;
  const phone = s?.restaurant_phone || "";
  const mapsUrl = s?.google_maps_url || "";
  const address = s?.restaurant_address || "";

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <header className="mb-8 text-center">
        <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Truck className="h-7 w-7" />
        </div>
        <h1 className="font-display text-3xl font-bold md:text-4xl">Livraison à domicile</h1>
        <p className="mt-2 text-muted-foreground">Nos plats algériens livrés chez vous, chauds et prêts à savourer.</p>
      </header>

      <div className={`mb-8 flex items-center gap-3 rounded-2xl border p-4 ${enabled ? "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30" : "border-destructive bg-destructive/10"}`}>
        {enabled ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-destructive" />}
        <div>
          <div className="font-semibold">{enabled ? "Livraison disponible" : "Livraison indisponible"}</div>
          {!enabled && s && (
            <div className="text-sm text-muted-foreground">
              {!s.is_open ? s.closed_message : s.orders_paused ? s.order_pause_message : "La livraison est temporairement désactivée."}
            </div>
          )}
        </div>
      </div>

      {s?.delivery_zone_text && (
        <div className="mb-6 rounded-2xl border border-border bg-secondary/30 p-4 text-sm">
          <strong>Zone desservie :</strong> {s.delivery_zone_text}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Info icon={<Clock className="h-5 w-5" />} label="Temps de livraison estimé" value={s?.est_delivery_min ? `~${s.est_delivery_min} min` : "—"} />
        <Info icon={<Truck className="h-5 w-5" />} label="Frais de livraison" value={s?.delivery_fee != null ? (s.delivery_fee === 0 ? "Gratuit" : fmt(s.delivery_fee)) : "—"} />
        <Info icon={<CheckCircle2 className="h-5 w-5" />} label="Livraison gratuite dès" value={s && s.free_delivery_threshold > 0 ? fmt(s.free_delivery_threshold) : "—"} />
        <Info icon={<MapPin className="h-5 w-5" />} label="Minimum de commande" value={s && s.min_order > 0 ? fmt(s.min_order) : "Aucun"} />
        {phone && <Info icon={<Phone className="h-5 w-5" />} label="Téléphone restaurant" value={phone} />}
        {address && <Info icon={<MapPin className="h-5 w-5" />} label="Adresse" value={address} />}
      </div>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link to="/menu"><Button size="lg" disabled={!enabled}>Commander pour livraison</Button></Link>
        {phone && <a href={`tel:${phone}`}><Button size="lg" variant="outline"><Phone className="mr-2 h-4 w-4" /> Appeler le restaurant</Button></a>}
        {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer"><Button size="lg" variant="ghost"><MapPin className="mr-2 h-4 w-4" /> Voir sur la carte</Button></a>}
      </div>

      <section className="mt-12 rounded-2xl border border-border bg-card p-6">
        <h2 className="mb-3 font-display text-lg font-semibold">Comment ça marche</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Choisissez vos plats sur la page <Link to="/menu" className="text-primary underline">Menu</Link>.</li>
          <li>Au paiement, sélectionnez <strong>Livraison</strong> et indiquez votre adresse, unité/appartement, code de porte et instructions.</li>
          <li>Nous préparons votre commande et vous l'envoyons avec un livreur.</li>
          <li>Suivez le statut sur la page de suivi avec votre numéro de commande.</li>
        </ol>
      </section>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">{icon}<span>{label}</span></div>
      <div className="font-display text-lg font-semibold">{value}</div>
    </div>
  );
}

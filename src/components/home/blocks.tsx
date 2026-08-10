import { Link } from "@tanstack/react-router";
import { Truck, Phone, MapPin, Clock, Instagram, Facebook, Music2, ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/cart-store";
import { FoodImg } from "@/components/DishImage";
import { etaLabels, isOpenNow } from "@/lib/use-live-menu";
import type { PublicSettings } from "@/lib/api";
import { useCustomer, customerApi, type CustomerOrder } from "@/lib/customer-auth";
import { reorderItems, reorderMessage } from "@/lib/reorder";
import { cartSheet } from "@/lib/ui-store";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const DELIVERY_IMG =
  "https://images.unsplash.com/photo-1526367790999-0150786686a2?auto=format&fit=crop&w=1000&q=70";
const STORY_IMG =
  "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=1100&q=70";

/* ------------------------------- DELIVERY ------------------------------- */
export function DeliveryBlock({ settings }: { settings: PublicSettings | null }) {
  const eta = etaLabels(settings);
  const fee = settings?.delivery_fee;
  const free = settings?.free_delivery_threshold;
  const min = settings?.min_order;
  const rows: [string, string][] = [
    ["Délai estimé", eta.delivery],
    ...(typeof fee === "number" ? ([["Frais de livraison", fee > 0 ? fmt(fee) : "Offerts"]] as [string, string][]) : []),
    ...(typeof free === "number" && free > 0
      ? ([["Livraison offerte dès", fmt(free)]] as [string, string][])
      : []),
    ...(typeof min === "number" && min > 0 ? ([["Commande minimum", fmt(min)]] as [string, string][]) : []),
    ...(settings?.delivery_zone_text ? ([["Zones desservies", settings.delivery_zone_text]] as [string, string][]) : []),
  ];
  return (
    <section className="relative mt-4 overflow-hidden border-y border-border">
      <div className="absolute inset-0">
        <FoodImg src={DELIVERY_IMG} alt="Commande Les Délices d'Aden prête pour la livraison" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/92 to-background/50" />
      <div className="relative mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:py-16 lg:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Livraison</div>
          <h2 className="mt-1 font-display text-3xl sm:text-5xl">On vous livre.</h2>
          <p className="mt-3 max-w-md text-sm text-foreground/80 sm:text-base">
            Commandez directement chez Deli Aden — pas d'intermédiaire, vos plats arrivent chauds et
            préparés à la minute.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/menu">
              <Button size="lg" className="gap-2 font-semibold">
                <Truck className="h-4 w-4" /> Commander en livraison
              </Button>
            </Link>
            <Link to="/delivery">
              <Button size="lg" variant="outline" className="font-semibold">
                Voir les détails
              </Button>
            </Link>
          </div>
        </div>
        <dl className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border/60 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="bg-card p-4">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
              <dd className="mt-1 font-semibold text-primary">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------ BRAND STORY ----------------------------- */
export function BrandStory() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:py-14">
      <div className="grid overflow-hidden rounded-3xl border border-border bg-card lg:grid-cols-2">
        <div className="aspect-[4/3] overflow-hidden lg:aspect-auto">
          <FoodImg src={STORY_IMG} alt="Chorba et pain maison préparés dans la cuisine des Délices d'Aden" />
        </div>
        <div className="flex flex-col justify-center gap-4 p-6 sm:p-10">
          <h2 className="font-display text-3xl leading-tight sm:text-4xl">
            Des saveurs qui nous ramènent à la maison.
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            Nos recettes viennent des cuisines familiales d'Algérie : semoule roulée, sauces mijotées
            longuement, grillades marinées la veille et pâtisseries au miel et à la fleur d'oranger.
            Tout est préparé sur place, chaque jour, avec l'hospitalité qui va avec.
          </p>
          <Link to="/about" className="inline-flex items-center gap-2 font-semibold text-primary hover:underline">
            Découvrir Deli Aden <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* --------------------------- RESTAURANT INFO ---------------------------- */
export function RestaurantInfo({ settings }: { settings: PublicSettings | null }) {
  const open = isOpenNow(settings);
  const eta = etaLabels(settings);
  const phone = settings?.restaurant_phone;
  const address = settings?.restaurant_address;
  const maps =
    settings?.google_maps_url ||
    (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null);
  return (
    <section className="mx-auto max-w-7xl px-4 py-8 sm:py-12">
      <div className="grid gap-3 rounded-3xl border border-border bg-card p-5 sm:p-7 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl">Le restaurant</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <span className={open ? "font-semibold text-primary" : "font-semibold text-destructive"}>
                  {open ? "Ouvert maintenant" : "Fermé"}
                </span>
                {settings?.opening_hours ? ` — ${settings.opening_hours}` : ""}
              </span>
            </li>
            {address && (
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{address}</span>
              </li>
            )}
            {phone && (
              <li className="flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="hover:underline">
                  {phone}
                </a>
              </li>
            )}
            <li className="flex items-start gap-3">
              <Truck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                {eta.pickupEnabled ? `Ramassage ${eta.pickup}` : "Ramassage indisponible"}
                {" • "}
                {eta.deliveryEnabled ? `Livraison ${eta.delivery}` : "Livraison indisponible"}
              </span>
            </li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            {phone && (
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
                <Button variant="outline" className="gap-2 font-semibold">
                  <Phone className="h-4 w-4" /> Appeler
                </Button>
              </a>
            )}
            {maps && (
              <a href={maps} target="_blank" rel="noreferrer">
                <Button variant="outline" className="gap-2 font-semibold">
                  <MapPin className="h-4 w-4" /> Itinéraire
                </Button>
              </a>
            )}
          </div>
        </div>
        <SocialBlock />
      </div>
    </section>
  );
}

/* ------------------------------- SOCIAL --------------------------------- */
const SOCIAL = [
  { name: "Instagram", href: import.meta.env["VITE_SOCIAL_INSTAGRAM"] as string | undefined, Icon: Instagram },
  { name: "Facebook", href: import.meta.env["VITE_SOCIAL_FACEBOOK"] as string | undefined, Icon: Facebook },
  { name: "TikTok", href: import.meta.env["VITE_SOCIAL_TIKTOK"] as string | undefined, Icon: Music2 },
].filter((s) => Boolean(s.href));

export function SocialBlock() {
  if (!SOCIAL.length) return null;
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-5">
      <h3 className="font-display text-xl">Suivez Deli Aden</h3>
      <p className="mt-1 text-sm text-muted-foreground">Nouveautés, plats du jour et coulisses de la cuisine.</p>
      <ul className="mt-4 grid gap-2">
        {SOCIAL.map(({ name, href, Icon }) => (
          <li key={name}>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-4 font-medium transition hover:border-primary/60 hover:text-primary"
            >
              <Icon className="h-4 w-4 text-primary" /> {name}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------- REORDER -------------------------------- */
export function ReorderBlock() {
  const { customer, token } = useCustomer();
  const [last, setLast] = useState<CustomerOrder | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!token) {
      setLast(null);
      return;
    }
    customerApi
      .orders()
      .then((r) => {
        if (alive) setLast(r.orders[0] ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);

  if (!customer || !last || !last.items?.length) return null;

  const onReorder = async () => {
    setBusy(true);
    try {
      const res = await reorderItems(last.items);
      const msg = reorderMessage(res);
      toast.success(msg.title, { description: msg.detail });
      if (res.added > 0) cartSheet.open();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de recommander");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-7xl px-4 pt-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-primary/40 bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            Bon retour, {customer.name.split(" ")[0]}
          </div>
          <h2 className="mt-1 font-display text-xl sm:text-2xl">Recommander votre dernière commande</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {new Date(last.created_at).toLocaleDateString("fr-CA")} • {last.items.length} article
            {last.items.length > 1 ? "s" : ""} • {fmt(last.total)}
          </p>
        </div>
        <Button onClick={onReorder} disabled={busy} size="lg" className="gap-2 font-semibold">
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Commander à nouveau
        </Button>
      </div>
    </section>
  );
}

import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Truck, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { etaLabels, isOpenNow } from "@/lib/use-live-menu";
import type { PublicSettings } from "@/lib/api";

const HERO =
  "https://images.unsplash.com/photo-1541518763669-27fef04b14ea?auto=format&fit=crop&w=1400&q=72";
const HERO_SM =
  "https://images.unsplash.com/photo-1541518763669-27fef04b14ea?auto=format&fit=crop&w=780&q=68";

export function HomeHero({ settings }: { settings: PublicSettings | null }) {
  const open = isOpenNow(settings);
  const eta = etaLabels(settings);
  return (
    <section className="relative isolate overflow-hidden">
      <picture>
        <source media="(max-width: 640px)" srcSet={HERO_SM} />
        <img
          src={HERO}
          alt="Couscous royal et grillades servis chez Les Délices d'Aden"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover hero-zoom"
        />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/35 sm:bg-gradient-to-r sm:from-background sm:via-background/85 sm:to-background/10" />

      <div className="relative mx-auto flex min-h-[78svh] max-w-7xl flex-col justify-end px-4 pb-8 pt-24 sm:min-h-[70svh] sm:justify-center sm:pb-16">
        <div className="max-w-xl">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
              open
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-destructive/50 bg-destructive/10 text-destructive"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${open ? "bg-primary status-pulse" : "bg-destructive"}`} />
            {open ? "Ouvert maintenant" : "Fermé"}
          </span>

          <h1 className="mt-4 font-display text-[2.4rem] leading-[1.02] sm:text-6xl">
            Les Délices <span className="text-gold-gradient">d'Aden</span>
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-foreground/80 sm:text-base">
            Cuisine algérienne authentique — grillades au charbon, couscous, tacos généreux et
            pâtisseries faites maison. Commandez pour ramassage ou livraison.
          </p>

          <div className="mt-5 flex flex-wrap gap-2 text-xs sm:text-sm">
            {eta.pickupEnabled && (
              <span className="inline-flex items-center gap-2 rounded-full bg-card/90 px-3 py-1.5 font-medium ring-1 ring-border">
                <ShoppingBag className="h-3.5 w-3.5 text-primary" /> Ramassage {eta.pickup}
              </span>
            )}
            {eta.deliveryEnabled && (
              <span className="inline-flex items-center gap-2 rounded-full bg-card/90 px-3 py-1.5 font-medium ring-1 ring-border">
                <Truck className="h-3.5 w-3.5 text-primary" /> Livraison {eta.delivery}
              </span>
            )}
            <span className="inline-flex items-center gap-2 rounded-full bg-card/90 px-3 py-1.5 font-medium ring-1 ring-border">
              <Clock className="h-3.5 w-3.5 text-primary" /> {settings?.opening_hours || "11h – 22h"}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2 sm:flex sm:gap-3">
            <Link to="/menu" className="contents">
              <Button size="lg" className="w-full gap-2 font-semibold sm:w-auto">
                Commander <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/menu" className="contents">
              <Button size="lg" variant="outline" className="w-full font-semibold sm:w-auto">
                Voir le menu
              </Button>
            </Link>
            <Link
              to="/delivery"
              className="col-span-2 text-center text-sm font-semibold text-primary underline-offset-4 hover:underline sm:col-span-1 sm:self-center"
            >
              Zones de livraison
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

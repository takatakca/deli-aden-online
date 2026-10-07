import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SmartSearch } from "@/components/SmartSearch";
import { HomeHero } from "@/components/home/HomeHero";
import {
  HomeSection,
  ProductRail,
  MiniProductRail,
  CategoryTiles,
  SignatureBlock,
} from "@/components/home/sections";
import { BrandStory, DeliveryBlock, ReorderBlock, RestaurantInfo, WelcomeBlock } from "@/components/home/blocks";
import { useLiveMenu } from "@/lib/use-live-menu";
import { popularNow, completeYourMeal } from "@/lib/recommend";
import { currentDaypart, daypartPicks } from "@/lib/daypart";
import { useCart } from "@/lib/cart-store";
import { Button } from "@/components/ui/button";
import { MENU } from "@/lib/menu";
import { seoHead } from "@/seo/head";

const SIGNATURE_IDS = ["couscous-royal", "mix-grill", "rechta", "tacos-gratine", "kalb-el-louz"];

const CHIPS: { label: string; hash: string }[] = [
  { label: "Populaires", hash: "plats-algeriens" },
  { label: "Grillades", hash: "grillades" },
  { label: "Tacos", hash: "fast-food" },
  { label: "Plats algériens", hash: "plats-algeriens" },
  { label: "Poissons", hash: "poissons" },
  { label: "Desserts", hash: "desserts" },
  { label: "Cafés & thés", hash: "boissons-chaudes" },
  { label: "Soupes", hash: "soupes" },
];

export const Route = createFileRoute("/")({
  // Restaurant JSON-LD is emitted once by the root route (src/routes/__root.tsx).
  head: () => {
    const seo = seoHead({
      title: "Les Délices d'Aden | Restaurant algérien — Commande en ligne",
      description:
        "Cuisine algérienne, grillades, fast food, desserts. Commandez en ligne pour ramassage ou livraison à Québec.",
      path: "/",
    });
    return {
      meta: [
        ...seo.meta,
        { property: "og:title", content: "Les Délices d'Aden | Restaurant algérien" },
        {
          property: "og:description",
          content: "Grillades, couscous, tacos et pâtisseries maison. Ramassage ou livraison.",
        },
      ],
      links: seo.links,
    };
  },
  component: Home,
});

function Home() {
  const { live, settings } = useLiveMenu();
  const cart = useCart();

  // Client-side only so the time-of-day block never mismatches during hydration.
  const [daypart, setDaypart] = useState<ReturnType<typeof currentDaypart> | null>(null);
  useEffect(() => setDaypart(currentDaypart()), []);
  const nowPicks = useMemo(() => (daypart ? daypartPicks(live, daypart, 8) : []), [live, daypart]);

  const popular = useMemo(() => popularNow(live, 8), [live]);

  const signature = useMemo(
    () =>
      SIGNATURE_IDS.map((id) => live.find((i) => i.id === id && i.available)).filter(
        (x): x is NonNullable<typeof x> => Boolean(x),
      ),
    [live],
  );
  const complements = useMemo(() => completeYourMeal(live, cart, 8), [live, cart]);
  const cats = useMemo(() => {
    const hidden = new Set(live.map((i) => i.categoryId));
    return MENU.filter((c) => hidden.has(c.id)).map((c) => {
      const items = live.filter((i) => i.categoryId === c.id);
      return {
        id: c.id,
        name: c.name,
        image: items[0]?.image ?? c.items[0]?.image ?? "",
        count: items.length,
      };
    });
  }, [live]);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="pb-6">
      <HomeHero settings={settings} />

      {/* Quick order chips — one-thumb entry into the menu */}
      <nav aria-label="Catégories rapides" className="border-b border-border bg-background/95">
        <ul className="no-scrollbar mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3">
          {CHIPS.map((c) => (
            <li key={c.label}>
              <Link
                to="/menu"
                hash={c.hash}
                className="flex min-h-11 items-center whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm font-semibold transition hover:border-primary/60 hover:text-primary"
              >
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Commercial search */}
      <section className="mx-auto max-w-3xl px-4 pt-6">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
          Recherche intelligente
        </div>
        <SmartSearch compact />
      </section>

      <WelcomeBlock />
      <ReorderBlock />

      {daypart && nowPicks.length > 0 && (
        <HomeSection eyebrow={daypart.eyebrow} title={daypart.title} action="Tout le menu" actionTo="/menu">
          <ProductRail items={nowPicks} />
        </HomeSection>
      )}

      <HomeSection eyebrow="Commandé par nos clients" title="Populaire en ce moment" action="Tout le menu" actionTo="/menu">
        <ProductRail items={popular} />
      </HomeSection>


      <HomeSection eyebrow="Le menu" title="Explorer par catégorie">
        <CategoryTiles cats={cats} />
      </HomeSection>

      <HomeSection eyebrow="La maison" title="Les incontournables">
        <SignatureBlock items={signature} />
      </HomeSection>

      <DeliveryBlock settings={settings} />

      {complements.length > 0 && (
        <HomeSection eyebrow="Suggestions" title="Complétez votre repas">
          <MiniProductRail items={complements} />
        </HomeSection>
      )}

      <BrandStory />
      <RestaurantInfo settings={settings} />

      {/* Sticky mobile order bar (empty cart state; the cart CTA takes over once filled) */}
      {cartCount === 0 && (
        <div className="fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md md:hidden">
          <Link to="/menu" className="block">
            <Button size="lg" className="w-full font-semibold shadow-2xl">
              Commander
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

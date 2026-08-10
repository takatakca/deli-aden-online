import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { SmartSearch } from "@/components/SmartSearch";
import { HomeHero } from "@/components/home/HomeHero";
import {
  HomeSection,
  ProductRail,
  MiniProductRail,
  CategoryTiles,
  SignatureBlock,
} from "@/components/home/sections";
import { BrandStory, DeliveryBlock, ReorderBlock, RestaurantInfo } from "@/components/home/blocks";
import { useLiveMenu } from "@/lib/use-live-menu";
import { popularNow, completeYourMeal } from "@/lib/recommend";
import { useCart } from "@/lib/cart-store";
import { Button } from "@/components/ui/button";
import { MENU } from "@/lib/menu";

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
  head: () => ({
    meta: [
      { title: "Les Délices d'Aden | Restaurant algérien — Commande en ligne" },
      {
        name: "description",
        content:
          "Cuisine algérienne, grillades, fast food, desserts. Commandez en ligne pour ramassage ou livraison à Québec.",
      },
      { property: "og:title", content: "Les Délices d'Aden | Restaurant algérien" },
      {
        property: "og:description",
        content: "Grillades, couscous, tacos et pâtisseries maison. Ramassage ou livraison.",
      },
      { property: "og:url", content: "/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Restaurant",
          name: "Les Délices d'Aden",
          servesCuisine: ["Algerian", "Maghrebi", "Mediterranean"],
          priceRange: "$$",
          acceptsReservations: false,
          hasMenu: "https://deli-aden-orders.lovable.app/menu",
          potentialAction: {
            "@type": "OrderAction",
            target: "https://deli-aden-orders.lovable.app/menu",
          },
        }),
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { live, settings } = useLiveMenu();
  const cart = useCart();

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

      <ReorderBlock />

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

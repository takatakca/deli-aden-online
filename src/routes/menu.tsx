import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MENU } from "@/lib/menu";
import { MenuItemCard } from "@/components/MenuItemCard";
import { useCart, fmt, computeTotals } from "@/lib/cart-store";
import { ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Menu — Les Délices d'Aden" },
      { name: "description", content: "Découvrez notre menu : plats algériens, grillades, poissons, fast food et desserts faits maison. Commandez en ligne." },
      { property: "og:title", content: "Menu — Les Délices d'Aden" },
      { property: "og:description", content: "Plats algériens, grillades, poissons, fast food et desserts. Commandez en ligne." },
      { property: "og:url", content: "/menu" },
    ],
    links: [{ rel: "canonical", href: "/menu" }],
  }),
  component: MenuPage,
});

function MenuPage() {
  const [active, setActive] = useState(MENU[0].id);
  const cart = useCart();
  const totals = computeTotals(cart);
  const count = cart.reduce((s, i) => s + i.quantity, 0);

  // Sync active tab from hash
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.slice(1);
    if (MENU.some((c) => c.id === hash)) {
      setActive(hash);
      const el = document.getElementById(hash);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 pb-32">
      <header className="mb-8 text-center">
        <span className="category-bar text-xs">Notre menu</span>
        <h1 className="mt-4 font-display text-4xl font-bold md:text-5xl">Commander en ligne</h1>
        <p className="mt-2 text-muted-foreground">Choisissez vos plats préférés et finalisez votre commande.</p>
      </header>

      {/* Sticky tabs */}
      <nav className="sticky top-16 z-30 -mx-4 mb-6 overflow-x-auto border-y border-border bg-background/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl gap-2">
          {MENU.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              onClick={() => setActive(c.id)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition ${active === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40"}`}
            >
              {c.name}
            </a>
          ))}
        </div>
      </nav>

      {MENU.map((cat) => (
        <section key={cat.id} id={cat.id} className="scroll-mt-32 py-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="category-bar">{cat.name}</div>
              {cat.blurb && <p className="mt-3 text-sm text-muted-foreground">{cat.blurb}</p>}
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cat.items.map((i) => <MenuItemCard key={i.id} item={i} />)}
          </div>
        </section>
      ))}

      {/* Sticky mobile cart */}
      {count > 0 && (
        <Link
          to="/cart"
          className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center justify-between rounded-full bg-primary px-5 py-3 text-primary-foreground shadow-2xl transition hover:opacity-90 md:hidden"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingBag className="h-4 w-4" /> {count} article{count > 1 ? "s" : ""}
          </span>
          <span className="text-sm font-bold">{fmt(totals.total)} → Voir le panier</span>
        </Link>
      )}
    </div>
  );
}

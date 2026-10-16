import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { MENU } from "@/lib/menu";
import { MenuItemCard, type MenuItemOverride } from "@/components/MenuItemCard";
import { SmartSearch } from "@/components/SmartSearch";
import { api, type MenuOverride, type PublicSettings } from "@/lib/api";

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
  const [overrides, setOverrides] = useState<MenuOverride[]>([]);
  const [settings, setSettings] = useState<PublicSettings | null>(null);

  useEffect(() => {
    api.getMenuOverrides().then((r) => setOverrides(r.overrides)).catch(() => {});
    api.getSettings().then((r) => setSettings(r.settings)).catch(() => {});
  }, []);

  const ovMap = useMemo(() => {
    const m = new Map<string, MenuItemOverride>();
    for (const o of overrides) m.set(o.item_id, {
      available: o.available, priceOverride: o.price_override,
      descriptionOverride: o.description_override, imageOverride: o.image_override,
    });
    return m;
  }, [overrides]);

  const hiddenCats = useMemo(() => new Set(
    (settings?.hidden_categories || "").split(",").map((s) => s.trim()).filter(Boolean)
  ), [settings]);
  const visibleMenu = useMemo(() => MENU.filter((c) => !hiddenCats.has(c.id)), [hiddenCats]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.slice(1);
    if (visibleMenu.some((c) => c.id === hash)) {
      setActive(hash);
      const el = document.getElementById(hash);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [visibleMenu]);

  // Follow the section nearest the sticky category bar while the visitor scrolls.
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const nodes = visibleMenu
      .map((category) => document.getElementById(category.id))
      .filter((node): node is HTMLElement => node !== null);
    if (!nodes.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const nearest = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (nearest) setActive(nearest.target.id);
      },
      { rootMargin: "-128px 0px -65% 0px", threshold: 0 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [visibleMenu]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 pb-32">
      <header className="mb-8 text-center">
        <span className="category-bar text-xs">Notre menu</span>
        <h1 className="mt-4 font-display text-4xl font-bold md:text-5xl">Commander en ligne</h1>
        <p className="mt-2 text-muted-foreground">Choisissez vos plats préférés et finalisez votre commande.</p>
      </header>

      <div className="mb-6"><SmartSearch compact /></div>

      {/* Sticky tabs */}
      <nav className="sticky top-16 z-30 -mx-4 mb-6 overflow-x-auto border-y border-border bg-background/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl gap-2">
          {visibleMenu.map((c) => (
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

      {visibleMenu.map((cat) => (
        <section key={cat.id} id={cat.id} className="scroll-mt-32 py-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="category-bar">{cat.name}</h2>
              {cat.blurb && <p className="mt-3 text-sm text-muted-foreground">{cat.blurb}</p>}
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cat.items.map((i) => <MenuItemCard key={i.id} item={i} override={ovMap.get(i.id)} />)}
          </div>
        </section>
      ))}


    </div>
  );
}

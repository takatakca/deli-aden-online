import { Link } from "@tanstack/react-router";
import { DishImage, FoodImg } from "@/components/DishImage";
import { Button } from "@/components/ui/button";
import { fmt } from "@/lib/cart-store";
import type { LiveItem } from "@/lib/menu-search";
import { MenuItemCard } from "@/components/MenuItemCard";
import { ArrowRight } from "lucide-react";

/** Section shell: editorial heading + optional link, consistent rhythm. */
export function HomeSection({
  eyebrow,
  title,
  action,
  actionTo,
  children,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  action?: string;
  actionTo?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mx-auto w-full max-w-7xl px-4 py-8 sm:py-12 ${className}`}>
      <div className="mb-4 flex items-end justify-between gap-3 sm:mb-6">
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">{eyebrow}</div>
          )}
          <h2 className="mt-1 font-display text-2xl leading-tight sm:text-4xl">{title}</h2>
        </div>
        {action && actionTo && (
          <Link
            to={actionTo}
            className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            {action} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Horizontal snap rail of real, orderable products. */
export function ProductRail({ items }: { items: LiveItem[] }) {
  if (!items.length) return null;
  return (
    <ul className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4">
      {items.map((it) => (
        <li key={it.id} className="w-[66vw] max-w-[19rem] shrink-0 snap-start sm:w-auto sm:max-w-none">
          <MenuItemCard
            item={it.item}
            override={{ available: it.available, priceOverride: it.price, imageOverride: it.image }}
          />
        </li>
      ))}
    </ul>
  );
}

/** Compact rail card used for upsells (drink / dessert / side). */
export function MiniProductRail({ items }: { items: LiveItem[] }) {
  if (!items.length) return null;
  return (
    <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      {items.map((it) => (
        <li
          key={it.id}
          className="flex w-[15rem] shrink-0 items-center gap-3 rounded-2xl border border-border bg-card p-2.5"
        >
          <div className="w-16 shrink-0 overflow-hidden rounded-xl">
            <DishImage src={it.image} name={it.name} ratio="aspect-square" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{it.name}</div>
            <div className="text-sm text-primary">{fmt(it.price)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Editorial category tiles — photo led, no icons. */
export function CategoryTiles({
  cats,
}: {
  cats: { id: string; name: string; image: string; count: number }[];
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cats.map((c, i) => (
        <li key={c.id} className={i % 5 === 0 ? "col-span-2 sm:col-span-2" : ""}>
          <Link
            to="/menu"
            hash={c.id}
            className="group relative block h-full overflow-hidden rounded-2xl border border-border bg-card"
          >
            <div className={`overflow-hidden ${i % 5 === 0 ? "aspect-[16/10]" : "aspect-[4/5] sm:aspect-[4/3]"}`}>
              <FoodImg
                src={c.image}
                alt={`${c.name} — Les Délices d'Aden`}
                sizes="(max-width: 640px) 50vw, 25vw"
                className="transition duration-700 group-hover:scale-[1.04]"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
              <div className="min-w-0">
                <div className="truncate font-display text-lg leading-tight sm:text-xl">{c.name}</div>
                <div className="text-[11px] text-foreground/70">{c.count} plats</div>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-primary transition group-hover:translate-x-1" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Signature "advertising" block: one hero product + supporting products. */
export function SignatureBlock({ items }: { items: LiveItem[] }) {
  const [lead, ...rest] = items;
  if (!lead) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Link
        to="/menu"
        hash="plats-algeriens"
        className="group relative overflow-hidden rounded-3xl border border-border bg-card"
      >
        <div className="aspect-[4/3] overflow-hidden lg:aspect-[4/3.4]">
          <FoodImg
            src={lead.image}
            alt={`${lead.name} — plat signature`}
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="transition duration-700 group-hover:scale-[1.04]"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Signature</div>
          <h3 className="mt-1 font-display text-3xl sm:text-4xl">{lead.name}</h3>
          {lead.description && (
            <p className="mt-2 max-w-md text-sm text-foreground/80 line-clamp-2">{lead.description}</p>
          )}
          <div className="mt-4 flex items-center gap-3">
            <Button size="lg" className="font-semibold">
              Commander • {fmt(lead.price)}
            </Button>
          </div>
        </div>
      </Link>

      <ul className="grid grid-cols-2 gap-3">
        {rest.slice(0, 4).map((it) => (
          <li key={it.id}>
            <Link
              to="/menu"
              hash={it.categoryId}
              className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card"
            >
              <div className="aspect-[4/3] overflow-hidden">
                <FoodImg
                  src={it.image}
                  alt={`${it.name} — Les Délices d'Aden`}
                  sizes="(max-width: 640px) 50vw, 25vw"
                  className="transition duration-700 group-hover:scale-[1.04]"
                />
              </div>
              <div className="flex flex-1 flex-col justify-between gap-1 p-3">
                <div className="font-semibold leading-tight">{it.name}</div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-primary">{fmt(it.price)}</span>
                  <span className="text-xs text-muted-foreground">{it.categoryName}</span>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

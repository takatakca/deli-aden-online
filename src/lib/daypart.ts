// Time-of-day merchandising: the homepage shows what people actually order now.
import type { LiveItem } from "@/lib/menu-search";

export type Daypart = {
  key: "morning" | "midday" | "evening" | "late";
  eyebrow: string;
  title: string;
  /** Ordered category preference for this moment of the day. */
  categories: string[];
};

export function currentDaypart(now = new Date()): Daypart {
  const h = now.getHours();
  if (h < 11)
    return {
      key: "morning",
      eyebrow: "Ce matin",
      title: "Café, thé et déjeuner",
      categories: ["boissons-chaudes", "desserts", "fast-food"],
    };
  if (h < 15)
    return {
      key: "midday",
      eyebrow: "Pour le midi",
      title: "Rapide, chaud, prêt vite",
      categories: ["fast-food", "grillades", "soupes"],
    };
  if (h < 22)
    return {
      key: "evening",
      eyebrow: "Ce soir",
      title: "Plats complets à partager",
      categories: ["plats-algeriens", "grillades", "poissons"],
    };
  return {
    key: "late",
    eyebrow: "En fin de soirée",
    title: "Envie d'une douceur",
    categories: ["desserts", "boissons-chaudes", "fast-food"],
  };
}

/** Real, available items ranked by the current moment. Never invents products. */
export function daypartPicks(live: LiveItem[], daypart: Daypart, limit = 8): LiveItem[] {
  const out: LiveItem[] = [];
  for (const cat of daypart.categories) {
    for (const it of live) {
      if (it.available && it.categoryId === cat && !out.includes(it)) out.push(it);
      if (out.length >= limit) return out;
    }
  }
  return out.slice(0, limit);
}

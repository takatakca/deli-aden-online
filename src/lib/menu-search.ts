// Local smart-menu search: exact matches, category matches, then intent matching.
// This engine never invents products — it only ranks real live menu items.
import { MENU, type MenuItem } from "@/lib/menu";
import type { MenuOverride, PublicSettings } from "@/lib/api";

export type LiveItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  image: string;
  categoryId: string;
  categoryName: string;
  available: boolean;
  item: MenuItem;
};

export type SearchHit = LiveItem & { score: number; reason?: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Build the live catalog by applying admin overrides + hidden categories. */
export function buildLiveMenu(
  overrides: MenuOverride[] = [],
  settings?: PublicSettings | null,
): LiveItem[] {
  const ov = new Map(overrides.map((o) => [o.item_id, o]));
  const hidden = new Set(
    (settings?.hidden_categories || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const out: LiveItem[] = [];
  for (const cat of MENU) {
    if (hidden.has(cat.id)) continue;
    for (const item of cat.items) {
      const o = ov.get(item.id);
      out.push({
        id: item.id,
        name: item.name,
        description: o?.description_override ?? item.description,
        price: o?.price_override ?? item.price,
        image: o?.image_override ?? item.image,
        categoryId: cat.id,
        categoryName: cat.name,
        available: o?.available !== false,
        item: {
          ...item,
          price: o?.price_override ?? item.price,
          description: o?.description_override ?? item.description,
          image: o?.image_override ?? item.image,
        },
      });
    }
  }
  return out;
}

type Intent = {
  maxPrice?: number;
  tags: string[];
  categoryIds: string[];
  people?: number;
};

const KEYWORDS: { tags: string[]; words: string[]; categories?: string[] }[] = [
  { tags: ["poulet"], words: ["poulet", "chicken", "pollo"] },
  { tags: ["boeuf"], words: ["viande", "boeuf", "beef", "hachee", "hachée", "carne", "merguez", "veau", "agneau"] },
  { tags: ["poisson"], words: ["poisson", "fish", "pescado", "sardine", "merlan", "dorade", "thon"], categories: ["poissons"] },
  { tags: ["epice"], words: ["epice", "épicé", "epicee", "piquant", "spicy", "picante", "harissa", "fort"] },
  { tags: ["doux"], words: ["pas trop epice", "pas epice", "doux", "mild", "suave", "leger", "léger", "light", "ligero"] },
  { tags: ["vegetarien"], words: ["sans viande", "vegetarien", "végétarien", "vegan", "vegetariano", "legumes", "légumes"] },
  { tags: ["dessert"], words: ["dessert", "sucre", "sucré", "douceur", "postre", "sweet", "gateau", "gâteau"], categories: ["desserts"] },
  { tags: ["cafe"], words: ["cafe", "café", "coffee", "the", "thé", "tea", "boisson", "drink", "bebida"], categories: ["boissons-chaudes"] },
  { tags: ["soupe"], words: ["soupe", "soup", "sopa", "chorba"], categories: ["soupes"] },
  { tags: ["rapide"], words: ["rapide", "vite", "fast", "quick", "rapido", "rápido"], categories: ["fast-food"] },
  { tags: ["algerien"], words: ["algerien", "algérien", "algerienne", "traditionnel", "maghreb", "argelino"], categories: ["plats-algeriens"] },
  { tags: ["grillade"], words: ["grillade", "grille", "grillé", "brochette", "bbq", "grilled", "parrilla"], categories: ["grillades"] },
  { tags: ["enfant"], words: ["enfant", "enfants", "kids", "niños", "ninos"] },
  { tags: ["pas-cher"], words: ["pas cher", "economique", "économique", "budget", "cheap", "barato", "petit prix"] },
];

export function parseIntent(query: string): Intent {
  const q = norm(query);
  const tags: string[] = [];
  const categoryIds: string[] = [];
  for (const k of KEYWORDS) {
    if (k.words.some((w) => q.includes(norm(w)))) {
      tags.push(...k.tags);
      if (k.categories) categoryIds.push(...k.categories);
    }
  }
  let maxPrice: number | undefined;
  const money = q.match(/(\d{1,3})(?:[.,](\d{1,2}))?\s*(\$|dollars?|dolares?|usd|cad)?/);
  if (/moins de|under|menos de|budget|max|jusqu|j'ai |j ai /.test(q) && money) {
    maxPrice = parseFloat(`${money[1]}.${money[2] ?? "0"}`);
  } else if (money && money[3]) {
    maxPrice = parseFloat(`${money[1]}.${money[2] ?? "0"}`);
  }
  if (tags.includes("pas-cher") && !maxPrice) maxPrice = 12;
  let people: number | undefined;
  if (/deux|2 personnes|two|dos personas/.test(q)) people = 2;
  if (/famille|family|familia/.test(q)) people = 4;
  return { maxPrice, tags, categoryIds, people };
}

const SPICY_HINTS = ["merguez", "harissa", "epice", "piment", "hmiss", "kebda", "zfiti", "chakchoukha"];

function itemTags(it: LiveItem): string[] {
  const hay = norm(`${it.name} ${it.description ?? ""} ${it.categoryName}`);
  const t: string[] = [];
  if (/poulet|chich taouk|chicken/.test(hay)) t.push("poulet");
  if (/viande|boeuf|merguez|veau|agneau|kebda|hachee/.test(hay)) t.push("boeuf");
  if (/poisson|sardine|merlan|dorade|thon/.test(hay)) t.push("poisson");
  if (SPICY_HINTS.some((w) => hay.includes(w))) t.push("epice");
  else t.push("doux");
  if (/legume|salade|frites|msemen|macedoine|mhadjeb|omlette/.test(hay) && !/viande|poulet|poisson|thon/.test(hay))
    t.push("vegetarien");
  if (it.categoryId === "desserts") t.push("dessert", "doux");
  if (it.categoryId === "boissons-chaudes") t.push("cafe");
  if (it.categoryId === "soupes") t.push("soupe", "doux");
  if (it.categoryId === "fast-food") t.push("rapide", "enfant");
  if (it.categoryId === "grillades") t.push("grillade");
  if (it.categoryId === "plats-algeriens") t.push("algerien");
  if (it.price <= 12) t.push("pas-cher");
  return t;
}

export function searchMenu(query: string, live: LiveItem[], limit = 8): SearchHit[] {
  const q = norm(query.trim());
  if (!q) return [];
  const intent = parseIntent(query);
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  const hits: SearchHit[] = [];

  for (const it of live) {
    const hayName = norm(it.name);
    const hayAll = norm(`${it.name} ${it.description ?? ""}`);
    const tags = itemTags(it);
    let score = 0;
    const reasons: string[] = [];

    if (hayName === q) score += 120;
    else if (hayName.includes(q)) score += 90;
    else if (hayAll.includes(q)) score += 55;
    for (const w of words) {
      if (hayName.includes(w)) score += 22;
      else if (hayAll.includes(w)) score += 10;
    }
    if (norm(it.categoryName).includes(q) || intent.categoryIds.includes(it.categoryId)) {
      score += 35;
      reasons.push(it.categoryName);
    }
    for (const tag of intent.tags) {
      if (tag === "pas-cher") continue;
      if (tags.includes(tag)) {
        score += 18;
        reasons.push(tag);
      } else if (tag === "doux" && tags.includes("epice")) score -= 25;
      else if (tag === "epice" && !tags.includes("epice")) score -= 12;
      else if (tag === "vegetarien" && !tags.includes("vegetarien")) score -= 40;
    }
    if (intent.maxPrice != null) {
      if (it.price <= intent.maxPrice) {
        score += 14;
        reasons.push(`${it.price.toFixed(2)} $`);
      } else score -= 60;
    }
    if (!it.available) score -= 30;
    if (score > 0) hits.push({ ...it, score, reason: reasons.slice(0, 3).join(" • ") || undefined });
  }

  return hits.sort((a, b) => b.score - a.score || a.price - b.price).slice(0, limit);
}

export const SUGGESTED_QUERIES: Record<string, string[]> = {
  fr: [
    "quelque chose d'épicé avec poulet",
    "repas pour deux",
    "moins de 15 $",
    "je veux manger algérien",
    "un dessert avec mon café",
  ],
  en: ["something spicy with chicken", "meal for two", "under $15", "traditional Algerian food", "a dessert with coffee"],
  es: ["algo picante con pollo", "comida para dos", "menos de 15 $", "comida argelina", "un postre con café"],
};

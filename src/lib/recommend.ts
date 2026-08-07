// Rules-based, honest recommendations. Real menu items only, no fake urgency.
import type { LiveItem } from "@/lib/menu-search";
import type { CartItem } from "@/lib/cart-store";

const pick = (live: LiveItem[], ids: string[]) =>
  ids.map((id) => live.find((i) => i.id === id && i.available)).filter((x): x is LiveItem => Boolean(x));

export const POPULAR_IDS = [
  "tacos-classique",
  "mix-grill",
  "couscous-royal",
  "chawarma-poulet",
  "rechta",
  "cheese-burger",
];

export function popularNow(live: LiveItem[], limit = 6): LiveItem[] {
  const out = pick(live, POPULAR_IDS);
  if (out.length >= limit) return out.slice(0, limit);
  return [...out, ...live.filter((i) => i.available && !out.includes(i))].slice(0, limit);
}

/** "Parfait avec votre commande" — complements based on what is already in the cart. */
export function completeYourMeal(live: LiveItem[], cart: CartItem[], limit = 4): LiveItem[] {
  const inCart = new Set(cart.map((l) => l.itemId));
  const wanted: string[] = [];
  const has = (re: RegExp) => cart.some((l) => re.test(l.itemId));

  if (has(/burger|panini|sandwich|tacos|chawarma|pizza/)) wanted.push("frites", "original-milk", "lait-choco");
  if (has(/espresso|latte|cappuccino|americano|arabica|mochaccino|tea/)) wanted.push("tiramisu", "kalb-el-louz", "flan");
  if (has(/mix-grill|chich|supreme|poulet-roti|mechoui|kebda/)) wanted.push("hmiss", "macedoine", "chorba");
  if (has(/rechta|couscous|tajine|dolma|chakchoukha|mtewem|zfiti/)) wanted.push("chorba", "msemen", "kalb-el-louz");
  if (has(/sardine|merlan|dorade/)) wanted.push("macedoine", "frites");

  const total = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  if (total >= 40) wanted.push("tiramisu", "green-tea");
  if (!wanted.length) wanted.push("frites", "chorba", "tiramisu", "espresso");

  const unique = [...new Set(wanted)].filter((id) => !inCart.has(id));
  return pick(live, unique).slice(0, limit);
}

/** Sweet upsell rail. */
export function addSomethingSweet(live: LiveItem[], limit = 4): LiveItem[] {
  return live.filter((i) => i.categoryId === "desserts" && i.available).slice(0, limit);
}

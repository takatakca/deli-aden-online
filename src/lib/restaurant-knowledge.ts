// Safe, customer-facing restaurant knowledge. Never include admin/private data
// (supplier costs, inventory costs, customer PII, secrets) here.
import { MENU } from "@/lib/menu";
import type { PublicSettings } from "@/lib/api";
import { buildLiveMenu, type LiveItem } from "@/lib/menu-search";
import type { MenuOverride } from "@/lib/api";

export type SafeCatalogItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  categoryId: string;
  categoryName: string;
  available: boolean;
  options?: { label: string; required: boolean; choices: string[] }[];
};

export type RestaurantKnowledge = {
  restaurant: {
    name: string;
    cuisine: string[];
    currency: "CAD";
    isOpen: boolean;
    ordersPaused: boolean;
    pickupEnabled: boolean;
    deliveryEnabled: boolean;
    pickupEtaMinutes: number | null;
    deliveryEtaMinutes: number | null;
    deliveryFee: number | null;
    freeDeliveryThreshold: number | null;
  };
  categories: { id: string; name: string; blurb?: string }[];
  items: SafeCatalogItem[];
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export function toSafeCatalog(live: LiveItem[]): SafeCatalogItem[] {
  return live.map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    price: i.price,
    categoryId: i.categoryId,
    categoryName: i.categoryName,
    available: i.available,
    options: i.item.options?.map((g) => ({
      label: g.label,
      required: Boolean(g.required),
      choices: g.choices.map((c) => c.label),
    })),
  }));
}

export function buildKnowledge(
  overrides: MenuOverride[] = [],
  settings?: PublicSettings | null,
): RestaurantKnowledge {
  const live = buildLiveMenu(overrides, settings);
  const s = (settings ?? {}) as Record<string, unknown>;
  return {
    restaurant: {
      name: "Les Délices d'Aden",
      cuisine: ["Algérienne", "Maghreb", "Grillades", "Fast food"],
      currency: "CAD",
      isOpen: s["is_open"] !== 0 && s["is_open"] !== "0" && s["is_open"] !== false,
      ordersPaused: s["orders_paused"] === 1 || s["orders_paused"] === "1" || s["orders_paused"] === true,
      pickupEnabled: s["pickup_enabled"] !== 0 && s["pickup_enabled"] !== "0" && s["pickup_enabled"] !== false,
      deliveryEnabled: s["delivery_enabled"] !== 0 && s["delivery_enabled"] !== "0" && s["delivery_enabled"] !== false,
      pickupEtaMinutes: num(s["pickup_eta_minutes"]) ?? 25,
      deliveryEtaMinutes: num(s["delivery_eta_minutes"]) ?? 45,
      deliveryFee: num(s["delivery_fee"]),
      freeDeliveryThreshold: num(s["free_delivery_threshold"]),
    },
    categories: MENU.map((c) => ({ id: c.id, name: c.name, blurb: c.blurb })),
    items: toSafeCatalog(live),
  };
}

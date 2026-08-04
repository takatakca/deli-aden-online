// Turn 5 — Reorder helper: validates a past order's items against the live menu
// (availability + current price) before pushing them back into the cart.

import { api } from "@/lib/api";
import { cartStore, fmt } from "@/lib/cart-store";
import { findItem, COMBO_DELTA } from "@/lib/menu";

export type PastItem = {
  itemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  options?: { groupLabel: string; values: string[] }[];
  combo?: boolean;
  notes?: string;
};

export type ReorderResult = {
  added: number;
  skipped: string[];
  repriced: { name: string; from: number; to: number }[];
};

/** Current unit price for a past line, keeping option deltas and combo surcharge. */
function currentUnitPrice(pastItem: PastItem, basePrice: number): number {
  const menuItem = findItem(pastItem.itemId);
  const originalBase = menuItem ? menuItem.price : basePrice;
  // Extras the customer paid on top of the base price (options + combo).
  const extras = Math.max(0, pastItem.unitPrice - originalBase - (pastItem.combo ? COMBO_DELTA : 0));
  return Math.round((basePrice + extras + (pastItem.combo ? COMBO_DELTA : 0)) * 100) / 100;
}

/**
 * Adds the items of a past order/favorite to the cart.
 * Unavailable items are skipped, price changes are reported.
 */
export async function reorderItems(items: PastItem[], opts?: { clear?: boolean }): Promise<ReorderResult> {
  let overrides: Record<string, { available: boolean; price_override: number | null; image_override: string | null }> = {};
  try {
    const r = await api.getMenuOverrides();
    overrides = Object.fromEntries(r.overrides.map((o) => [o.item_id, o]));
  } catch {
    // Menu overrides unavailable — fall back to the static menu.
  }

  const result: ReorderResult = { added: 0, skipped: [], repriced: [] };
  if (opts?.clear) cartStore.clear();

  for (const it of items) {
    const menuItem = findItem(it.itemId);
    const ovr = overrides[it.itemId];
    if (!menuItem || (ovr && ovr.available === false)) {
      result.skipped.push(it.name);
      continue;
    }
    const basePrice = ovr?.price_override != null ? Number(ovr.price_override) : menuItem.price;
    const unitPrice = currentUnitPrice(it, basePrice);
    if (Math.abs(unitPrice - it.unitPrice) > 0.009) {
      result.repriced.push({ name: it.name, from: it.unitPrice, to: unitPrice });
    }
    cartStore.add({
      itemId: it.itemId,
      name: menuItem.name,
      unitPrice,
      quantity: Math.max(1, Number(it.quantity) || 1),
      image: ovr?.image_override || menuItem.image,
      options: it.options || [],
      combo: it.combo,
      notes: it.notes,
    });
    result.added += 1;
  }
  return result;
}

/** Human-readable summary for a toast. */
export function reorderMessage(r: ReorderResult): { title: string; detail?: string } {
  if (r.added === 0) return { title: "Aucun article disponible", detail: r.skipped.join(", ") };
  const parts: string[] = [];
  if (r.skipped.length) parts.push(`Indisponible : ${r.skipped.join(", ")}`);
  if (r.repriced.length) {
    parts.push(
      `Prix mis à jour : ${r.repriced.map((p) => `${p.name} ${fmt(p.from)} → ${fmt(p.to)}`).join(", ")}`
    );
  }
  return {
    title: `${r.added} article${r.added > 1 ? "s" : ""} ajouté${r.added > 1 ? "s" : ""} au panier`,
    detail: parts.length ? parts.join(" • ") : undefined,
  };
}

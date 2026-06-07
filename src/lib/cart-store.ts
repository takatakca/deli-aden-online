import { useEffect, useState, useSyncExternalStore } from "react";

export type CartItemOption = { groupLabel: string; values: string[] };

export type CartItem = {
  uid: string; // unique cart-line id
  itemId: string;
  name: string;
  unitPrice: number; // includes option deltas + combo
  quantity: number;
  image: string;
  options?: CartItemOption[];
  combo?: boolean;
  notes?: string;
};

const STORAGE_KEY = "deli-aden-cart";

let cart: CartItem[] = [];
const emptyCartSnapshot: CartItem[] = [];
const listeners = new Set<() => void>();

function load() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) cart = JSON.parse(raw);
  } catch {}
}
function persist() {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}
function emit() {
  persist();
  listeners.forEach((l) => l());
}

let loaded = false;
function ensureLoaded() {
  if (!loaded && typeof window !== "undefined") {
    load();
    loaded = true;
  }
}

export const cartStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  getSnapshot() {
    ensureLoaded();
    return cart;
  },
  add(item: Omit<CartItem, "uid">) {
    ensureLoaded();
    cart = [...cart, { ...item, uid: crypto.randomUUID() }];
    emit();
  },
  updateQty(uid: string, qty: number) {
    ensureLoaded();
    cart = cart
      .map((c) => (c.uid === uid ? { ...c, quantity: Math.max(1, qty) } : c))
      .filter((c) => c.quantity > 0);
    emit();
  },
  remove(uid: string) {
    ensureLoaded();
    cart = cart.filter((c) => c.uid !== uid);
    emit();
  },
  clear() {
    cart = [];
    emit();
  },
};

export function useCart(): CartItem[] {
  // SSR-safe: server returns empty, client hydrates from localStorage.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const snap = useSyncExternalStore(
    cartStore.subscribe,
    () => cartStore.getSnapshot(),
    () => emptyCartSnapshot
  );
  return hydrated ? snap : [];
}

export const GST_RATE = 0.05;
export const QST_RATE = 0.09975;

export function computeTotals(items: CartItem[]) {
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const gst = +(subtotal * GST_RATE).toFixed(2);
  const qst = +(subtotal * QST_RATE).toFixed(2);
  const total = +(subtotal + gst + qst).toFixed(2);
  return { subtotal: +subtotal.toFixed(2), gst, qst, total };
}

export const fmt = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);

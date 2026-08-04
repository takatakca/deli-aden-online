// Phase 2 — Customer auth client + API helpers.
// Token persisted in localStorage; lightweight pub/sub for component subscribers.

import { useSyncExternalStore } from "react";

export type Customer = {
  id: number;
  email: string;
  name: string;
  phone: string;
  created_at: string;
};

export type SavedAddress = {
  id: number;
  label: string;
  address: string;
  unit: string | null;
  door_code: string | null;
  instructions: string | null;
  is_default: boolean;
};

export type FavoriteOrder = {
  id: number;
  label: string;
  items: Array<{
    itemId: string;
    name: string;
    unitPrice: number;
    quantity: number;
    options?: { groupLabel: string; values: string[] }[];
    combo?: boolean;
    notes?: string;
  }>;
  created_at: string;
};

export type CustomerOrder = {
  id: number;
  order_number: string;
  status: string;
  order_type: string;
  total: number;
  created_at: string;
  items: FavoriteOrder["items"];
};

const TOKEN_KEY = "deli-aden-customer-token";
const CUSTOMER_KEY = "deli-aden-customer";

type State = { token: string | null; customer: Customer | null };

function readState(): State {
  if (typeof window === "undefined") return { token: null, customer: null };
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const raw = localStorage.getItem(CUSTOMER_KEY);
    return { token, customer: raw ? (JSON.parse(raw) as Customer) : null };
  } catch {
    return { token: null, customer: null };
  }
}

let state: State = readState();
const listeners = new Set<() => void>();
function notify() { for (const l of listeners) l(); }

export function getToken(): string | null { return state.token; }
export function getCustomer(): Customer | null { return state.customer; }

function setSession(token: string | null, customer: Customer | null) {
  state = { token, customer };
  if (typeof window !== "undefined") {
    if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY);
    if (customer) localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer)); else localStorage.removeItem(CUSTOMER_KEY);
  }
  notify();
}

const emptySnapshot: State = { token: null, customer: null };
export function useCustomer(): State {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => state,
    () => emptySnapshot
  );
}

async function request<T>(url: string, init?: RequestInit, withAuth = false): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) headers.set("Content-Type", "application/json");
  if (withAuth && state.token) headers.set("Authorization", `Bearer ${state.token}`);
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    if (res.status === 401 && withAuth) signOut();
    const msg = (body && typeof body === "object" && "error" in body && (body as { error: string }).error) ||
      (typeof body === "string" ? body : `HTTP ${res.status}`);
    throw new Error(String(msg));
  }
  return body as T;
}

export const customerApi = {
  async signup(data: { email: string; password: string; name: string; phone?: string }) {
    const r = await request<{ token: string; customer: Customer }>("/api/customers/signup", {
      method: "POST", body: JSON.stringify(data),
    });
    setSession(r.token, r.customer);
    return r.customer;
  },
  async login(email: string, password: string) {
    const r = await request<{ token: string; customer: Customer }>("/api/customers/login", {
      method: "POST", body: JSON.stringify({ email, password }),
    });
    setSession(r.token, r.customer);
    return r.customer;
  },
  forgot: (email: string) =>
    request<{ ok: true }>("/api/customers/forgot", { method: "POST", body: JSON.stringify({ email }) }),
  reset: (token: string, password: string) =>
    request<{ ok: true }>("/api/customers/reset", { method: "POST", body: JSON.stringify({ token, password }) }),
  async me() {
    const r = await request<{ customer: Customer }>("/api/customers/me", {}, true);
    setSession(state.token, r.customer);
    return r.customer;
  },
  async updateProfile(patch: { name?: string; phone?: string; password?: string }) {
    const r = await request<{ customer: Customer }>("/api/customers/me", {
      method: "PATCH", body: JSON.stringify(patch),
    }, true);
    setSession(state.token, r.customer);
    return r.customer;
  },
  orders: () => request<{ orders: CustomerOrder[] }>("/api/customers/me/orders", {}, true),
  addresses: () => request<{ addresses: SavedAddress[] }>("/api/customers/me/addresses", {}, true),
  createAddress: (a: Omit<SavedAddress, "id">) =>
    request<{ ok: true; id: number }>("/api/customers/me/addresses", {
      method: "POST", body: JSON.stringify(a),
    }, true),
  deleteAddress: (id: number) =>
    request<{ ok: true }>(`/api/customers/me/addresses/${id}`, { method: "DELETE" }, true),
  favorites: () => request<{ favorites: FavoriteOrder[] }>("/api/customers/me/favorites", {}, true),
  createFavorite: (label: string, items: FavoriteOrder["items"]) =>
    request<{ ok: true; id: number }>("/api/customers/me/favorites", {
      method: "POST", body: JSON.stringify({ label, items }),
    }, true),
  deleteFavorite: (id: number) =>
    request<{ ok: true }>(`/api/customers/me/favorites/${id}`, { method: "DELETE" }, true),
};

/** Clears the local session only. */
export function signOut() { setSession(null, null); }

/** Revokes the session server-side (hashed session row), then clears it locally. */
export async function signOutRemote() {
  const token = state.token;
  setSession(null, null);
  if (!token) return;
  try {
    await fetch("/api/customers/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Best-effort: local session is already cleared.
  }
}


/** Attach Bearer token to outgoing /api/orders create so the order links to the customer. */
export function getAuthHeader(): Record<string, string> {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

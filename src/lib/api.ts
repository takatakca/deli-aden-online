// MochaHost backend API client. All calls go to the Express server in server.cjs.
// In dev/preview, /api/* will fail (no Express running) — this is expected.
// In production on MochaHost, server.cjs handles every /api/* route below.

export type CartItemPayload = {
  itemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  options?: { groupLabel: string; values: string[] }[];
  combo?: boolean;
  notes?: string;
};

export type CreateOrderPayload = {
  customer: { name: string; phone: string; email?: string };
  orderType: "pickup" | "delivery";
  deliveryAddress?: string;
  preferredTime: string;
  paymentMethod: "pay_at_restaurant" | "cash" | "card_on_arrival";
  specialNotes?: string;
  items: CartItemPayload[];
  subtotal: number;
  gst: number;
  qst: number;
  total: number;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg =
      (body && typeof body === "object" && "error" in body && (body as { error: string }).error) ||
      (typeof body === "string" ? body : `HTTP ${res.status}`);
    throw new Error(String(msg));
  }
  return body as T;
}

export const api = {
  health: () => request<{ ok: boolean; message: string }>("/api/health"),

  createOrder: (payload: CreateOrderPayload) =>
    request<{ orderNumber: string; id: number }>("/api/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getOrder: (orderNumber: string) =>
    request<{ order: AdminOrder | null }>(
      `/api/orders/${encodeURIComponent(orderNumber)}`
    ),

  adminVerify: (password: string) =>
    request<{ ok: boolean }>("/api/admin/verify", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  adminListOrders: (
    password: string,
    opts: { status?: string; search?: string; from?: string; to?: string } = {}
  ) => {
    const qs = new URLSearchParams();
    if (opts.status) qs.set("status", opts.status);
    if (opts.search) qs.set("search", opts.search);
    if (opts.from) qs.set("from", opts.from);
    if (opts.to) qs.set("to", opts.to);
    return request<{ orders: AdminOrder[] }>(
      `/api/orders?${qs.toString()}`,
      { headers: { "X-Admin-Password": password } }
    );
  },

  adminExportCsvUrl: (opts: { status?: string; search?: string; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (opts.status) qs.set("status", opts.status);
    if (opts.search) qs.set("search", opts.search);
    if (opts.from) qs.set("from", opts.from);
    if (opts.to) qs.set("to", opts.to);
    return `/api/orders.csv?${qs.toString()}`;
  },

  adminUpdateStatus: (password: string, id: string | number, status: string) =>
    request<{ ok: true }>(`/api/orders/${id}/status`, {
      method: "PATCH",
      headers: { "X-Admin-Password": password },
      body: JSON.stringify({ status }),
    }),

  submitContact: (data: { name: string; phone?: string; email: string; message: string }) =>
    request<{ ok: true }>("/api/contact", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

export type AdminOrder = {
  id: number;
  order_number: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  order_type: string;
  delivery_address: string | null;
  preferred_time: string;
  payment_method: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    options?: { groupLabel: string; values: string[] }[];
    notes?: string;
  }>;
  subtotal: number;
  gst: number;
  qst: number;
  total: number;
  special_notes: string | null;
  created_at: string;
};

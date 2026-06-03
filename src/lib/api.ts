// MochaHost backend API client. All calls go to the Express server in server.cjs.
// In dev/preview, /api/* will fail (no Express running) — this is expected.

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
  deliveryUnit?: string;
  deliveryDoorCode?: string;
  deliveryInstructions?: string;
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
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg =
      (body && typeof body === "object" && "error" in body && (body as { error: string }).error) ||
      (typeof body === "string" ? body : `HTTP ${res.status}`);
    throw new Error(String(msg));
  }
  return body as T;
}

const adminHeaders = (password: string) => ({ "X-Admin-Password": password });

export const api = {
  health: () => request<{ ok: boolean; message: string }>("/api/health"),

  getSettings: () => request<{ settings: PublicSettings }>("/api/settings"),
  getMenuOverrides: () => request<{ overrides: MenuOverride[] }>("/api/menu/overrides"),

  adminGetSettings: (password: string) =>
    request<{ settings: PublicSettings }>("/api/admin/settings", { headers: adminHeaders(password) }),
  adminUpdateSettings: (password: string, patch: Partial<PublicSettings>) =>
    request<{ ok: true; settings: PublicSettings }>("/api/admin/settings", {
      method: "PATCH", headers: adminHeaders(password), body: JSON.stringify(patch),
    }),

  adminGetMenu: (password: string) =>
    request<{ overrides: MenuOverride[] }>("/api/admin/menu", { headers: adminHeaders(password) }),
  adminUpsertMenuOverride: (password: string, itemId: string, o: Partial<MenuOverride>) =>
    request<{ ok: true }>(`/api/admin/menu/${encodeURIComponent(itemId)}`, {
      method: "PUT", headers: adminHeaders(password), body: JSON.stringify(o),
    }),
  adminBulkMenu: (password: string, items: string[], available: boolean) =>
    request<{ ok: true }>("/api/admin/menu/bulk", {
      method: "POST", headers: adminHeaders(password), body: JSON.stringify({ items, available }),
    }),

  createOrder: (payload: CreateOrderPayload) =>
    request<{ orderNumber: string; id: number }>("/api/orders", {
      method: "POST", body: JSON.stringify(payload),
    }),

  getOrder: (orderNumber: string) =>
    request<{ order: AdminOrder | null }>(`/api/orders/${encodeURIComponent(orderNumber)}`),

  adminVerify: (password: string) =>
    request<{ ok: boolean }>("/api/admin/verify", {
      method: "POST", body: JSON.stringify({ password }),
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
    return request<{ orders: AdminOrder[] }>(`/api/orders?${qs.toString()}`, { headers: adminHeaders(password) });
  },

  adminExportCsvUrl: (opts: { status?: string; search?: string; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (opts.status) qs.set("status", opts.status);
    if (opts.search) qs.set("search", opts.search);
    if (opts.from) qs.set("from", opts.from);
    if (opts.to) qs.set("to", opts.to);
    return `/api/orders.csv?${qs.toString()}`;
  },

  adminUpdateStatus: (
    password: string, id: string | number, status: string,
    extras: { note?: string; reason?: string } = {}
  ) =>
    request<{ ok: true }>(`/api/orders/${id}/status`, {
      method: "PATCH", headers: adminHeaders(password),
      body: JSON.stringify({ status, ...extras }),
    }),

  adminListEvents: (password: string, id: number) =>
    request<{ events: OrderEvent[] }>(`/api/orders/${id}/events`, { headers: adminHeaders(password) }),

  submitContact: (data: { name: string; phone?: string; email: string; message: string }) =>
    request<{ ok: true }>("/api/contact", { method: "POST", body: JSON.stringify(data) }),

  // Drivers
  adminListDrivers: (password: string, activeOnly = false) =>
    request<{ drivers: Driver[] }>(`/api/admin/drivers${activeOnly ? "?active=1" : ""}`, { headers: adminHeaders(password) }),
  adminCreateDriver: (password: string, d: { name: string; phone?: string; active?: boolean }) =>
    request<{ ok: true; id: number }>("/api/admin/drivers", {
      method: "POST", headers: adminHeaders(password), body: JSON.stringify(d),
    }),
  adminUpdateDriver: (password: string, id: number, d: Partial<Driver>) =>
    request<{ ok: true }>(`/api/admin/drivers/${id}`, {
      method: "PATCH", headers: adminHeaders(password), body: JSON.stringify(d),
    }),
  adminDeleteDriver: (password: string, id: number) =>
    request<{ ok: true }>(`/api/admin/drivers/${id}`, { method: "DELETE", headers: adminHeaders(password) }),

  // Assignments
  adminListAssignments: (password: string, activeOnly = false) =>
    request<{ assignments: Assignment[] }>(`/api/admin/assignments${activeOnly ? "?active=1" : ""}`, { headers: adminHeaders(password) }),
  adminAssignDriver: (password: string, orderId: number, driverId: number, notes?: string) =>
    request<{ ok: true }>(`/api/admin/orders/${orderId}/assign`, {
      method: "POST", headers: adminHeaders(password), body: JSON.stringify({ driver_id: driverId, notes }),
    }),
  adminMarkDelivered: (password: string, orderId: number) =>
    request<{ ok: true }>(`/api/admin/orders/${orderId}/delivered`, {
      method: "POST", headers: adminHeaders(password),
    }),

  // Metrics
  adminMetrics: (password: string) =>
    request<Metrics>("/api/admin/metrics", { headers: adminHeaders(password) }),
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
  delivery_unit?: string | null;
  delivery_door_code?: string | null;
  delivery_instructions?: string | null;
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
  delivery_fee?: number;
  special_notes: string | null;
  admin_notes: string | null;
  cancel_reason: string | null;
  dispatched_at: string | null;
  completed_at: string | null;
  estimated_ready_time?: string | null;
  estimated_delivery_time?: string | null;
  created_at: string;
  // Public delivery tracking enrichments (returned by GET /api/orders/:orderNumber for delivery orders)
  driver_name?: string | null;
  driver_phone?: string | null;
  assigned_at?: string | null;
  delivered_at?: string | null;
};

export type OrderEvent = {
  id: number;
  event: string;
  meta: string | null;
  created_at: string;
};

export type PublicSettings = {
  is_open: boolean;
  orders_paused: boolean;
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  est_pickup_min: number;
  est_delivery_min: number;
  min_order: number;
  delivery_fee: number;
  free_delivery_threshold: number;
  gst_rate: number;
  qst_rate: number;
  restaurant_name: string;
  restaurant_phone: string;
  restaurant_address: string;
  restaurant_email: string;
  google_maps_url: string;
  opening_hours: string;
  order_pause_message: string;
  closed_message: string;
  hidden_categories: string;
};

export type MenuOverride = {
  item_id: string;
  available: boolean;
  price_override: number | null;
  description_override: string | null;
  image_override: string | null;
};

export type Driver = {
  id: number;
  name: string;
  phone: string | null;
  active: number | boolean;
  created_at: string;
};

export type Assignment = {
  id: number;
  order_id: number;
  driver_id: number;
  notes: string | null;
  assigned_at: string;
  delivered_at: string | null;
  driver_name: string;
  driver_phone: string | null;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string | null;
  total: number;
};

export type Metrics = {
  by_status: Record<string, number>;
  today: { orders: number; revenue: number };
  week_revenue: number;
  month_revenue: number;
  series: Array<{ date: string; orders: number; revenue: number }>;
};

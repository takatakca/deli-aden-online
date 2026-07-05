// Real-time helper for Deli Aden (Phase 1 — SSE).
// Falls back to polling automatically if the SSE stream cannot be opened,
// disconnects, or errors repeatedly.
//
// Usage:
//   const c = connectAdminEvents(password, (ev, data) => { ... });
//   c.close();
//
//   const c = connectOrderEvents(orderNumber, (ev, data) => { ... });
//   c.close();

type Handler = (event: string, data: unknown) => void;
type Options = {
  onError?: (err: unknown) => void;
  onOpen?: () => void;
  fallbackPoll?: () => void; // called periodically when SSE is dead
  pollIntervalMs?: number;
};

export type RealtimeConnection = {
  close: () => void;
  isOpen: () => boolean;
  mode: () => "sse" | "polling" | "closed";
};

function log(...args: unknown[]) {
  if (import.meta.env.DEV) console.info("[realtime]", ...args);
}

function connectSSE(
  url: string,
  onEvent: Handler,
  opts: Options,
  knownEvents: string[]
): RealtimeConnection {
  let es: EventSource | null = null;
  let closed = false;
  let mode: "sse" | "polling" | "closed" = "sse";
  let retry = 0;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const startPolling = () => {
    if (closed || pollTimer || !opts.fallbackPoll) return;
    mode = "polling";
    const iv = Math.max(3000, opts.pollIntervalMs ?? 10000);
    log("fallback polling every", iv, "ms");
    pollTimer = setInterval(() => {
      try { opts.fallbackPoll?.(); } catch (e) { log("poll err", e); }
    }, iv);
    // fire once immediately
    try { opts.fallbackPoll?.(); } catch (e) { log("poll err", e); }
  };

  const stopPolling = () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  };

  const open = () => {
    if (closed) return;
    try {
      es = new EventSource(url);
    } catch (e) {
      log("EventSource unsupported", e);
      opts.onError?.(e);
      startPolling();
      return;
    }
    es.onopen = () => {
      retry = 0;
      mode = "sse";
      stopPolling();
      log("SSE open", url);
      opts.onOpen?.();
    };
    es.onerror = (e) => {
      log("SSE error", e);
      opts.onError?.(e);
      try { es?.close(); } catch (_) {}
      es = null;
      if (closed) return;
      // start polling immediately as safety net
      startPolling();
      // exponential backoff reconnect
      retry = Math.min(retry + 1, 6);
      const wait = Math.min(30000, 1000 * Math.pow(2, retry));
      reconnectTimer = setTimeout(open, wait);
    };
    // Generic message (no event: header)
    es.onmessage = (ev) => {
      let data: unknown = ev.data;
      try { data = JSON.parse(ev.data); } catch (_) {}
      onEvent("message", data);
    };
    for (const name of knownEvents) {
      es.addEventListener(name, (ev: MessageEvent) => {
        let data: unknown = ev.data;
        try { data = JSON.parse(ev.data); } catch (_) {}
        log(name, data);
        onEvent(name, data);
      });
    }
  };

  open();

  return {
    close: () => {
      closed = true;
      mode = "closed";
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      stopPolling();
      try { es?.close(); } catch (_) {}
      es = null;
    },
    isOpen: () => es?.readyState === 1,
    mode: () => mode,
  };
}

const ADMIN_EVENTS = [
  "hello",
  "order_created",
  "order_status_changed",
  "order_assigned",
  "order_delivered",
  "payment_succeeded",
  "payment_failed",
  "refund_created",
  "settings_updated",
  "menu_updated",
  "coupon_updated",
];

const ORDER_EVENTS = [
  "hello",
  "order_created",
  "order_status_changed",
  "driver_assigned",
  "driver_unassigned",
  "driver_accepted",
  "driver_picked_up",
  "order_delivered",
  "payment_status_changed",
];

// Try Option B (short-lived token) first, fall back to Option A (raw password).
async function fetchAdminToken(password: string): Promise<string> {
  try {
    const r = await fetch("/api/admin/realtime-token", {
      method: "POST",
      headers: { "X-Admin-Password": password, "Content-Type": "application/json" },
      body: "{}",
    });
    if (r.ok) {
      const j = (await r.json()) as { token?: string };
      if (j?.token) return j.token;
    }
  } catch (_) { /* ignore */ }
  return password; // fallback
}

export function connectAdminEvents(
  password: string,
  onEvent: Handler,
  opts: Options = {}
): RealtimeConnection {
  let inner: RealtimeConnection | null = null;
  let closed = false;
  const wrapper: RealtimeConnection = {
    close: () => { closed = true; inner?.close(); },
    isOpen: () => !!inner?.isOpen(),
    mode: () => inner?.mode() ?? "closed",
  };
  fetchAdminToken(password).then((token) => {
    if (closed) return;
    const url = `/api/events/admin?token=${encodeURIComponent(token)}`;
    inner = connectSSE(url, onEvent, opts, ADMIN_EVENTS);
  });
  return wrapper;
}

export function connectOrderEvents(
  orderNumber: string,
  onEvent: Handler,
  opts: Options = {}
): RealtimeConnection {
  const url = `/api/events/order/${encodeURIComponent(orderNumber)}`;
  return connectSSE(url, onEvent, opts, ORDER_EVENTS);
}

// First-party analytics adapter. Buffers events locally and can later be
// consumed by TAKATAK analytics — no payment data, no PII beyond order number.
export type AnalyticsEvent =
  | "home_view"
  | "search"
  | "voice_search"
  | "ai_search"
  | "product_view"
  | "add_to_cart"
  | "cart_view"
  | "checkout_started"
  | "checkout_step"
  | "coupon_applied"
  | "payment_started"
  | "order_completed"
  | "reorder";

export type AnalyticsRecord = {
  event: AnalyticsEvent;
  props?: Record<string, string | number | boolean | null>;
  ts: number;
  sessionId: string;
};

type Sink = (r: AnalyticsRecord) => void;

const KEY = "deliaden_analytics";
const SESSION_KEY = "deliaden_session";
const MAX = 200;
const sinks: Sink[] = [];

function sessionId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = window.sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    window.sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export const analytics = {
  /** Register an external sink (e.g. a future TAKATAK analytics adapter). */
  addSink(sink: Sink) {
    sinks.push(sink);
    return () => {
      const i = sinks.indexOf(sink);
      if (i >= 0) sinks.splice(i, 1);
    };
  },
  track(event: AnalyticsEvent, props?: AnalyticsRecord["props"]) {
    if (typeof window === "undefined") return;
    const record: AnalyticsRecord = { event, props, ts: Date.now(), sessionId: sessionId() };
    try {
      const buf: AnalyticsRecord[] = JSON.parse(window.localStorage.getItem(KEY) || "[]");
      buf.push(record);
      window.localStorage.setItem(KEY, JSON.stringify(buf.slice(-MAX)));
    } catch {
      /* storage full or blocked — analytics must never break the UI */
    }
    for (const s of sinks) {
      try {
        s(record);
      } catch {
        /* ignore sink failures */
      }
    }
  },
  drain(): AnalyticsRecord[] {
    if (typeof window === "undefined") return [];
    try {
      const buf: AnalyticsRecord[] = JSON.parse(window.localStorage.getItem(KEY) || "[]");
      window.localStorage.removeItem(KEY);
      return buf;
    } catch {
      return [];
    }
  },
};

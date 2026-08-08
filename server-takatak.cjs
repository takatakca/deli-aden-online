"use strict";
/* eslint-disable */
// =====================================================================
// server-takatak.cjs — TAKATAK merchant integration foundation (Turn 7)
//
// Outbound-only event relay. Deli Aden works fully with the integration
// disabled: enqueue() never throws and never blocks restaurant operations.
//
// Env:
//   TAKATAK_INTEGRATION_ENABLED=false
//   TAKATAK_API_BASE_URL=
//   TAKATAK_API_KEY=
//   TAKATAK_MERCHANT_ID=
//   TAKATAK_MAX_ATTEMPTS=6            (optional)
//   TAKATAK_WORKER_INTERVAL_MS=15000  (optional)
//
// Admin diagnostics: GET /api/admin/integrations/takatak (never returns the key)
// =====================================================================

const PROVIDER = "takatak";
const ENABLED = String(process.env.TAKATAK_INTEGRATION_ENABLED || "").toLowerCase() === "true";
const BASE_URL = (process.env.TAKATAK_API_BASE_URL || "").replace(/\/+$/, "");
const API_KEY = process.env.TAKATAK_API_KEY || "";
const MERCHANT_ID = process.env.TAKATAK_MERCHANT_ID || "";
const MAX_ATTEMPTS = Math.max(1, parseInt(process.env.TAKATAK_MAX_ATTEMPTS || "6", 10) || 6);
const WORKER_MS = Math.max(5000, parseInt(process.env.TAKATAK_WORKER_INTERVAL_MS || "15000", 10) || 15000);
const SEND_TIMEOUT_MS = 10000;

const EVENT_TYPES = [
  "merchant.order.created",
  "merchant.order.accepted",
  "merchant.order.preparing",
  "merchant.order.ready",
  "merchant.order.dispatched",
  "merchant.order.completed",
  "merchant.order.cancelled",
  "merchant.payment.succeeded",
  "merchant.refund.created",
  "merchant.inventory.low",
  "merchant.driver.assigned",
];

const ORDER_STATUS_EVENTS = {
  new: "merchant.order.created",
  accepted: "merchant.order.accepted",
  preparing: "merchant.order.preparing",
  ready: "merchant.order.ready",
  dispatched: "merchant.order.dispatched",
  completed: "merchant.order.completed",
  cancelled: "merchant.order.cancelled",
};

const configured = () => Boolean(BASE_URL && API_KEY && MERCHANT_ID);

// Exponential backoff with jitter: 30s, 1m, 4m, 16m, 64m … capped at 6h
function backoffMs(attempts) {
  const base = 30 * 1000 * Math.pow(4, Math.max(0, attempts - 1));
  const capped = Math.min(base, 6 * 60 * 60 * 1000);
  return capped + Math.floor(Math.random() * 5000);
}

const nowSqlite = () => new Date().toISOString().slice(0, 19).replace("T", " ");
const toSqlite = (d) => new Date(d).toISOString().slice(0, 19).replace("T", " ");

// Whitelist: only non-sensitive merchant fields leave the building.
// Never: payment intents/secrets, card data, tokens, customer email/address,
// admin data, inventory costs.
function safePayload(event_type, data) {
  const d = data || {};
  const money = (v) => (v == null || v === "" ? null : Number(v));
  const out = {
    merchant_id: MERCHANT_ID,
    event_type,
    occurred_at: new Date().toISOString(),
    order: d.order
      ? {
          order_number: d.order.order_number || null,
          status: d.order.status || null,
          order_type: d.order.order_type || null,
          preferred_time: d.order.preferred_time || null,
          currency: "CAD",
          subtotal: money(d.order.subtotal),
          delivery_fee: money(d.order.delivery_fee),
          gst: money(d.order.gst),
          qst: money(d.order.qst),
          total: money(d.order.total),
          payment_method: d.order.payment_method || null,
          payment_status: d.order.payment_status || null,
          items: Array.isArray(d.order.items)
            ? d.order.items.slice(0, 60).map((i) => ({
                item_id: i.itemId || i.item_id || null,
                name: i.name || null,
                quantity: Number(i.quantity) || 0,
                unit_price: money(i.unitPrice != null ? i.unitPrice : i.unit_price),
              }))
            : [],
          customer_ref: d.order.id != null ? `order:${d.order.id}` : null,
        }
      : undefined,
    driver: d.driver ? { driver_ref: d.driver.id != null ? `driver:${d.driver.id}` : null, name: d.driver.name || null } : undefined,
    payment: d.payment
      ? { amount: money(d.payment.amount), currency: d.payment.currency || "CAD", status: d.payment.status || null }
      : undefined,
    refund: d.refund ? { amount: money(d.refund.amount), currency: d.refund.currency || "CAD", reason: d.refund.reason || null } : undefined,
    inventory: d.inventory
      ? { ingredient: d.inventory.name || null, unit: d.inventory.unit || null, on_hand: money(d.inventory.on_hand), threshold: money(d.inventory.threshold) }
      : undefined,
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

function createTakatak({ dbApi }) {
  const pool = () => (dbApi.kind === "mysql" ? dbApi._pool : null);
  const sqlite = () => (dbApi.kind === "sqlite" ? dbApi._db : null);
  let lastSuccessAt = null;
  let workerTimer = null;

  async function init() {
    if (dbApi.kind === "mysql" && pool()) {
      await pool().query(`CREATE TABLE IF NOT EXISTS integration_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        provider VARCHAR(40) NOT NULL,
        event_type VARCHAR(60) NOT NULL,
        external_id VARCHAR(80) NULL,
        payload_json LONGTEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        attempts INT NOT NULL DEFAULT 0,
        last_error TEXT NULL,
        next_retry_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sent_at DATETIME NULL,
        INDEX idx_int_status (provider, status),
        INDEX idx_int_retry (next_retry_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    } else if (dbApi.kind === "sqlite" && sqlite()) {
      sqlite().exec(`CREATE TABLE IF NOT EXISTS integration_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        event_type TEXT NOT NULL,
        external_id TEXT,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        next_retry_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        sent_at TEXT
      )`);
      sqlite().exec("CREATE INDEX IF NOT EXISTS idx_int_status ON integration_events(provider, status)");
    }
    startWorker();
  }

  // Fire-and-forget. Always safe: swallows every error.
  async function enqueue(event_type, data, external_id) {
    try {
      if (!EVENT_TYPES.includes(event_type)) return;
      const payload = JSON.stringify(safePayload(event_type, data));
      const ext = external_id ? String(external_id).slice(0, 80) : null;
      if (dbApi.kind === "mysql" && pool()) {
        await pool().query(
          "INSERT INTO integration_events (provider, event_type, external_id, payload_json, status, next_retry_at) VALUES (?,?,?,?,?,NOW())",
          [PROVIDER, event_type, ext, payload, ENABLED && configured() ? "pending" : "skipped"],
        );
      } else if (dbApi.kind === "sqlite" && sqlite()) {
        sqlite()
          .prepare(
            "INSERT INTO integration_events (provider, event_type, external_id, payload_json, status, next_retry_at) VALUES (?,?,?,?,?,?)",
          )
          .run(PROVIDER, event_type, ext, payload, ENABLED && configured() ? "pending" : "skipped", nowSqlite());
      }
      if (ENABLED && configured()) setTimeout(() => { flush().catch(() => {}); }, 50);
    } catch (e) {
      console.warn("[takatak] enqueue failed (ignored):", e.message);
    }
  }

  function orderStatusEvent(status) {
    return ORDER_STATUS_EVENTS[String(status || "").toLowerCase()] || null;
  }
  async function emitOrderStatus(order, status) {
    const type = orderStatusEvent(status || (order && order.status));
    if (!type) return;
    await enqueue(type, { order }, order && order.order_number);
  }

  async function pending(limit) {
    if (dbApi.kind === "mysql" && pool()) {
      const [rows] = await pool().query(
        `SELECT * FROM integration_events
         WHERE provider=? AND status IN ('pending','retrying') AND attempts < ?
           AND (next_retry_at IS NULL OR next_retry_at <= NOW())
         ORDER BY id ASC LIMIT ?`,
        [PROVIDER, MAX_ATTEMPTS, limit],
      );
      return rows;
    }
    if (dbApi.kind === "sqlite" && sqlite()) {
      return sqlite()
        .prepare(
          `SELECT * FROM integration_events
           WHERE provider=? AND status IN ('pending','retrying') AND attempts < ?
             AND (next_retry_at IS NULL OR next_retry_at <= ?)
           ORDER BY id ASC LIMIT ?`,
        )
        .all(PROVIDER, MAX_ATTEMPTS, nowSqlite(), limit);
    }
    return [];
  }

  async function markSent(id) {
    lastSuccessAt = new Date().toISOString();
    if (dbApi.kind === "mysql" && pool()) {
      await pool().query("UPDATE integration_events SET status='sent', sent_at=NOW(), last_error=NULL WHERE id=?", [id]);
    } else if (sqlite()) {
      sqlite().prepare("UPDATE integration_events SET status='sent', sent_at=?, last_error=NULL WHERE id=?").run(nowSqlite(), id);
    }
  }

  async function markFailure(row, message) {
    const attempts = Number(row.attempts || 0) + 1;
    const exhausted = attempts >= MAX_ATTEMPTS;
    const status = exhausted ? "failed" : "retrying";
    const err = String(message || "").slice(0, 500);
    const retryAt = new Date(Date.now() + backoffMs(attempts));
    console.warn(`[takatak] event ${row.id} ${row.event_type} attempt ${attempts}/${MAX_ATTEMPTS}: ${err}`);
    if (dbApi.kind === "mysql" && pool()) {
      await pool().query("UPDATE integration_events SET attempts=?, status=?, last_error=?, next_retry_at=? WHERE id=?", [
        attempts, status, err, exhausted ? null : retryAt, row.id,
      ]);
    } else if (sqlite()) {
      sqlite()
        .prepare("UPDATE integration_events SET attempts=?, status=?, last_error=?, next_retry_at=? WHERE id=?")
        .run(attempts, status, err, exhausted ? null : toSqlite(retryAt), row.id);
    }
  }

  async function deliver(row) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE_URL}/merchant/events`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
          "X-Merchant-Id": MERCHANT_ID,
          "X-Idempotency-Key": `deliaden-${row.id}`,
        },
        body: row.payload_json,
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 200);
        throw new Error(`HTTP ${res.status} ${body}`);
      }
      await markSent(row.id);
    } finally {
      clearTimeout(timer);
    }
  }

  let flushing = false;
  async function flush() {
    if (!ENABLED || !configured() || flushing) return;
    flushing = true;
    try {
      const rows = await pending(20);
      for (const row of rows) {
        try {
          await deliver(row);
        } catch (e) {
          await markFailure(row, e.message);
        }
      }
    } catch (e) {
      console.warn("[takatak] flush error:", e.message);
    } finally {
      flushing = false;
    }
  }

  function startWorker() {
    if (workerTimer || !ENABLED || !configured()) return;
    workerTimer = setInterval(() => { flush().catch(() => {}); }, WORKER_MS);
    workerTimer.unref();
  }
  function stop() {
    if (workerTimer) clearInterval(workerTimer);
    workerTimer = null;
  }

  async function diagnostics() {
    const counts = { pending_events: 0, failed_events: 0, sent_events: 0, skipped_events: 0 };
    try {
      if (dbApi.kind === "mysql" && pool()) {
        const [rows] = await pool().query("SELECT status, COUNT(*) c FROM integration_events WHERE provider=? GROUP BY status", [PROVIDER]);
        for (const r of rows) applyCount(counts, r.status, Number(r.c));
        const [ls] = await pool().query("SELECT MAX(sent_at) s FROM integration_events WHERE provider=? AND status='sent'", [PROVIDER]);
        if (ls[0] && ls[0].s) lastSuccessAt = new Date(ls[0].s).toISOString();
      } else if (sqlite()) {
        for (const r of sqlite().prepare("SELECT status, COUNT(*) c FROM integration_events WHERE provider=? GROUP BY status").all(PROVIDER)) {
          applyCount(counts, r.status, Number(r.c));
        }
        const s = sqlite().prepare("SELECT MAX(sent_at) s FROM integration_events WHERE provider=? AND status='sent'").get(PROVIDER);
        if (s && s.s) lastSuccessAt = s.s;
      }
    } catch (e) {
      console.warn("[takatak] diagnostics:", e.message);
    }
    return {
      provider: PROVIDER,
      enabled: ENABLED,
      configured: configured(),
      base_url_set: Boolean(BASE_URL),
      merchant_id_set: Boolean(MERCHANT_ID),
      api_key_set: Boolean(API_KEY), // never the value
      max_attempts: MAX_ATTEMPTS,
      supported_events: EVENT_TYPES,
      ...counts,
      last_success_at: lastSuccessAt,
    };
  }

  function applyCount(counts, status, c) {
    if (status === "pending" || status === "retrying") counts.pending_events += c;
    else if (status === "failed") counts.failed_events += c;
    else if (status === "sent") counts.sent_events += c;
    else if (status === "skipped") counts.skipped_events += c;
  }

  async function recent(limit) {
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    try {
      if (dbApi.kind === "mysql" && pool()) {
        const [rows] = await pool().query(
          "SELECT id, event_type, external_id, status, attempts, last_error, created_at, sent_at FROM integration_events WHERE provider=? ORDER BY id DESC LIMIT ?",
          [PROVIDER, lim],
        );
        return rows;
      }
      if (sqlite()) {
        return sqlite()
          .prepare(
            "SELECT id, event_type, external_id, status, attempts, last_error, created_at, sent_at FROM integration_events WHERE provider=? ORDER BY id DESC LIMIT ?",
          )
          .all(PROVIDER, lim);
      }
    } catch (e) {
      console.warn("[takatak] recent:", e.message);
    }
    return [];
  }

  function mount(app, { requireAdmin }) {
    app.get("/api/admin/integrations/takatak", requireAdmin, async (_req, res) => {
      try {
        res.json({ ...(await diagnostics()), recent: await recent(25) });
      } catch (err) {
        console.error("[takatak] diagnostics route", err);
        res.status(500).json({ error: "Erreur" });
      }
    });
    app.post("/api/admin/integrations/takatak/retry", requireAdmin, async (_req, res) => {
      try {
        if (dbApi.kind === "mysql" && pool()) {
          await pool().query("UPDATE integration_events SET status='pending', attempts=0, next_retry_at=NOW() WHERE provider=? AND status='failed'", [PROVIDER]);
        } else if (sqlite()) {
          sqlite().prepare("UPDATE integration_events SET status='pending', attempts=0, next_retry_at=? WHERE provider=? AND status='failed'").run(nowSqlite(), PROVIDER);
        }
        flush().catch(() => {});
        res.json({ ok: true });
      } catch (err) {
        console.error("[takatak] retry", err);
        res.status(500).json({ error: "Erreur" });
      }
    });
  }

  return { init, mount, enqueue, emitOrderStatus, flush, stop, diagnostics, EVENT_TYPES };
}

module.exports = { createTakatak, EVENT_TYPES };

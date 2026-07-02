"use strict";
// Phase 1 Real-Time — SSE (Server-Sent Events) manager for admin + per-order channels.
// MochaHost-safe: pure Node/Express, no websockets. Heartbeats every 25s.
const crypto = require("crypto");

const HEARTBEAT_MS = 25000;
const TOKEN_TTL_MS = 15 * 60 * 1000;

function safeStringify(obj) {
  try { return JSON.stringify(obj); } catch (_) { return "{}"; }
}

function createRealtime({ requireAdmin, adminPassword }) {
  // clientId -> { res, channel, key }
  const admins = new Set();          // Set<res>
  const orderChannels = new Map();   // orderNumber -> Set<res>
  const tokens = new Map();          // token -> expiresAt

  function writeEvent(res, event, data) {
    if (res.writableEnded) return;
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${safeStringify(data)}\n\n`);
      // flush for compression middleware
      if (typeof res.flush === "function") res.flush();
    } catch (_) { /* ignore */ }
  }

  function setupSSE(req, res) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders && res.flushHeaders();
    // initial comment to open the stream
    res.write(": ok\n\n");
  }

  function heartbeatFor(res) {
    const t = setInterval(() => {
      if (res.writableEnded) { clearInterval(t); return; }
      try { res.write(`: hb ${Date.now()}\n\n`); if (typeof res.flush === "function") res.flush(); }
      catch (_) { clearInterval(t); }
    }, HEARTBEAT_MS);
    return t;
  }

  // ---- Admin short-lived token ----
  function issueAdminToken() {
    // purge expired
    const now = Date.now();
    for (const [k, v] of tokens) if (v < now) tokens.delete(k);
    const token = crypto.randomBytes(24).toString("hex");
    tokens.set(token, now + TOKEN_TTL_MS);
    return { token, expiresIn: Math.floor(TOKEN_TTL_MS / 1000) };
  }
  function verifyAdminToken(token) {
    if (!token) return false;
    // Also accept the admin password directly as fallback (Option A).
    if (token === adminPassword()) return true;
    const exp = tokens.get(token);
    if (!exp) return false;
    if (exp < Date.now()) { tokens.delete(token); return false; }
    return true;
  }

  function mount(app) {
    // Issue token (requires header auth)
    app.post("/api/admin/realtime-token", requireAdmin, (_req, res) => {
      res.json(issueAdminToken());
    });

    // Admin event stream
    app.get("/api/events/admin", (req, res) => {
      const token = String(req.query.token || req.header("x-realtime-token") || "");
      if (!verifyAdminToken(token)) return res.status(401).end();
      setupSSE(req, res);
      admins.add(res);
      const hb = heartbeatFor(res);
      writeEvent(res, "hello", { ts: Date.now(), channel: "admin" });
      req.on("close", () => { clearInterval(hb); admins.delete(res); });
    });

    // Public per-order stream
    app.get("/api/events/order/:orderNumber", (req, res) => {
      const orderNumber = String(req.params.orderNumber || "").slice(0, 32);
      if (!orderNumber) return res.status(400).end();
      setupSSE(req, res);
      let set = orderChannels.get(orderNumber);
      if (!set) { set = new Set(); orderChannels.set(orderNumber, set); }
      set.add(res);
      const hb = heartbeatFor(res);
      writeEvent(res, "hello", { ts: Date.now(), channel: "order", orderNumber });
      req.on("close", () => {
        clearInterval(hb);
        set.delete(res);
        if (set.size === 0) orderChannels.delete(orderNumber);
      });
    });
  }

  function emitAdmin(event, data) {
    const payload = { ...data, ts: Date.now() };
    for (const res of admins) writeEvent(res, event, payload);
  }
  function emitOrder(orderNumber, event, data) {
    if (!orderNumber) return;
    const set = orderChannels.get(orderNumber);
    if (!set || set.size === 0) return;
    const payload = { ...data, ts: Date.now() };
    for (const res of set) writeEvent(res, event, payload);
  }

  function stats() {
    return {
      admin_clients: admins.size,
      order_channels: orderChannels.size,
      order_clients: Array.from(orderChannels.values()).reduce((n, s) => n + s.size, 0),
      tokens: tokens.size,
    };
  }

  function shutdown() {
    for (const res of admins) { try { res.end(); } catch (_) {} }
    admins.clear();
    for (const set of orderChannels.values()) for (const res of set) { try { res.end(); } catch (_) {} }
    orderChannels.clear();
  }

  return { mount, emitAdmin, emitOrder, issueAdminToken, verifyAdminToken, stats, shutdown };
}

module.exports = { createRealtime };

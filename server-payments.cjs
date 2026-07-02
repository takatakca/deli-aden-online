// ============================================================
// Phase 3 — Stripe payments + refunds + coupon codes
// Self-contained module. Mount after the main app routes.
// ============================================================
"use strict";

let stripeInstance = null;
function getStripe() {
  if (stripeInstance) return stripeInstance;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const Stripe = require("stripe");
  stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });
  return stripeInstance;
}

// deps populated by mountPayments(); webhookHandler() reads them lazily at request time.
let DEPS = null;

// ---------- Schema ----------
async function initSchema({ kind, mysqlPool, sqliteDb }) {
  if (kind === "mysql") {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.query(`CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        stripe_payment_intent_id VARCHAR(120) NOT NULL,
        stripe_charge_id VARCHAR(120) NULL,
        amount_cents INT NOT NULL,
        currency VARCHAR(8) NOT NULL DEFAULT 'cad',
        status VARCHAR(40) NOT NULL DEFAULT 'pending',
        raw_event_json LONGTEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_pi (stripe_payment_intent_id),
        INDEX idx_pay_order (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await conn.query(`CREATE TABLE IF NOT EXISTS refunds (
        id INT AUTO_INCREMENT PRIMARY KEY,
        payment_id INT NULL,
        order_id INT NOT NULL,
        stripe_refund_id VARCHAR(120) NOT NULL,
        amount_cents INT NOT NULL,
        reason VARCHAR(255),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_refund (stripe_refund_id),
        INDEX idx_refund_order (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await conn.query(`CREATE TABLE IF NOT EXISTS coupons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(40) NOT NULL UNIQUE,
        kind VARCHAR(20) NOT NULL DEFAULT 'percent',
        value DECIMAL(10,2) NOT NULL DEFAULT 0,
        min_subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
        expires_at DATETIME NULL,
        max_uses INT NULL,
        used_count INT NOT NULL DEFAULT 0,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      for (const sql of [
        "ALTER TABLE orders ADD COLUMN payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid'",
        "ALTER TABLE orders ADD COLUMN stripe_payment_intent_id VARCHAR(120) NULL",
        "ALTER TABLE orders ADD COLUMN coupon_code VARCHAR(40) NULL",
        "ALTER TABLE orders ADD COLUMN discount DECIMAL(10,2) NOT NULL DEFAULT 0",
      ]) { try { await conn.query(sql); } catch (_) {} }
    } finally { conn.release(); }
  } else {
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        stripe_payment_intent_id TEXT NOT NULL UNIQUE,
        stripe_charge_id TEXT,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'cad',
        status TEXT NOT NULL DEFAULT 'pending',
        raw_event_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_pay_order ON payments(order_id);
      CREATE TABLE IF NOT EXISTS refunds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_id INTEGER,
        order_id INTEGER NOT NULL,
        stripe_refund_id TEXT NOT NULL UNIQUE,
        amount_cents INTEGER NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_refund_order ON refunds(order_id);
      CREATE TABLE IF NOT EXISTS coupons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL DEFAULT 'percent',
        value REAL NOT NULL DEFAULT 0,
        min_subtotal REAL NOT NULL DEFAULT 0,
        expires_at TEXT,
        max_uses INTEGER,
        used_count INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    for (const sql of [
      "ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid'",
      "ALTER TABLE orders ADD COLUMN stripe_payment_intent_id TEXT",
      "ALTER TABLE orders ADD COLUMN coupon_code TEXT",
      "ALTER TABLE orders ADD COLUMN discount REAL NOT NULL DEFAULT 0",
    ]) { try { sqliteDb.exec(sql); } catch (_) {} }
  }
}

// ---------- DB helpers (kind-agnostic via raw queries on DEPS) ----------
async function dbGet(sql, params = []) {
  const { kind, mysqlPool, sqliteDb } = DEPS;
  if (kind === "mysql") { const [r] = await mysqlPool.query(sql, params); return r[0] || null; }
  return sqliteDb.prepare(sql).get(...params) || null;
}
async function dbAll(sql, params = []) {
  const { kind, mysqlPool, sqliteDb } = DEPS;
  if (kind === "mysql") { const [r] = await mysqlPool.query(sql, params); return r; }
  return sqliteDb.prepare(sql).all(...params);
}
async function dbRun(sql, params = []) {
  const { kind, mysqlPool, sqliteDb } = DEPS;
  if (kind === "mysql") { const [r] = await mysqlPool.query(sql, params); return { lastID: r.insertId, changes: r.affectedRows }; }
  const r = sqliteDb.prepare(sql).run(...params);
  return { lastID: r.lastInsertRowid, changes: r.changes };
}

// ---------- Coupon validation ----------
async function findCoupon(code) {
  if (!code) return null;
  const c = await dbGet("SELECT * FROM coupons WHERE code = ? AND active = 1", [String(code).trim().toUpperCase()]);
  if (!c) return null;
  if (c.expires_at) {
    const exp = new Date(c.expires_at).getTime();
    if (!isNaN(exp) && Date.now() > exp) return null;
  }
  if (c.max_uses != null && Number(c.used_count) >= Number(c.max_uses)) return null;
  return c;
}
function applyCoupon(coupon, subtotal, deliveryFee) {
  let discount = 0;
  let freeDelivery = false;
  if (!coupon) return { discount, deliveryFee, freeDelivery };
  if (Number(subtotal) < Number(coupon.min_subtotal || 0)) {
    const err = new Error(`Sous-total minimum pour ce code : ${Number(coupon.min_subtotal).toFixed(2)} $`);
    err.statusCode = 400; throw err;
  }
  const v = Number(coupon.value) || 0;
  if (coupon.kind === "percent") discount = +(subtotal * (v / 100)).toFixed(2);
  else if (coupon.kind === "amount") discount = +Math.min(v, subtotal).toFixed(2);
  else if (coupon.kind === "free_delivery") { freeDelivery = true; }
  return {
    discount,
    deliveryFee: freeDelivery ? 0 : deliveryFee,
    freeDelivery,
  };
}

// ---------- Quote: recompute everything server-side ----------
async function computeQuote(body) {
  // Re-use the main server's validator/computer
  const prepared = await DEPS.buildOrderPayload(body);
  const coupon = body.couponCode ? await findCoupon(body.couponCode) : null;
  if (body.couponCode && !coupon) {
    const err = new Error("Code promo invalide ou expiré"); err.statusCode = 400; throw err;
  }
  const applied = applyCoupon(coupon, prepared.subtotal, prepared.delivery_fee);
  const newDeliveryFee = applied.deliveryFee;
  const discount = applied.discount;
  const taxableSubtotal = Math.max(0, prepared.subtotal - discount);
  const SETTINGS = DEPS.getSettings();
  const gst = +(taxableSubtotal * (Number(SETTINGS.gst_rate) || 0)).toFixed(2);
  const qst = +(taxableSubtotal * (Number(SETTINGS.qst_rate) || 0)).toFixed(2);
  const total = +(taxableSubtotal + gst + qst + newDeliveryFee).toFixed(2);
  return {
    items: prepared.items,
    subtotal: prepared.subtotal,
    discount,
    delivery_fee: newDeliveryFee,
    gst, qst, total,
    coupon: coupon ? { code: coupon.code, kind: coupon.kind, value: Number(coupon.value), free_delivery: !!applied.freeDelivery } : null,
    prepared, // pass-through for create-intent
  };
}

// ---------- Webhook handler (mounted with raw body in server.cjs) ----------
function webhookHandler() {
  return async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).send("Stripe not configured");
    const sig = req.header("stripe-signature");
    const whSec = process.env.STRIPE_WEBHOOK_SECRET;
    let event;
    try {
      if (whSec && sig) {
        event = stripe.webhooks.constructEvent(req.body, sig, whSec);
      } else {
        // Dev fallback when no webhook secret is configured
        event = typeof req.body === "object" && !Buffer.isBuffer(req.body)
          ? req.body
          : JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body));
        console.warn("[stripe-webhook] no STRIPE_WEBHOOK_SECRET — signature NOT verified (dev only)");
      }
    } catch (err) {
      console.error("[stripe-webhook] signature verification failed", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    try {
      await handleStripeEvent(event);
    } catch (err) {
      console.error("[stripe-webhook] handler error", err);
    }
    res.json({ received: true });
  };
}

async function handleStripeEvent(event) {
  const t = event.type;
  if (t === "payment_intent.succeeded") {
    const pi = event.data.object;
    const orderId = pi.metadata && pi.metadata.order_id ? parseInt(pi.metadata.order_id, 10) : null;
    if (!orderId) return;
    const chargeId = pi.latest_charge || (pi.charges && pi.charges.data && pi.charges.data[0] && pi.charges.data[0].id) || null;
    // Upsert payments row
    const existing = await dbGet("SELECT id FROM payments WHERE stripe_payment_intent_id = ?", [pi.id]);
    if (existing) {
      await dbRun("UPDATE payments SET status = ?, stripe_charge_id = ?, raw_event_json = ? WHERE id = ?",
        ["succeeded", chargeId, JSON.stringify(event).slice(0, 60000), existing.id]);
    } else {
      await dbRun(
        "INSERT INTO payments (order_id, stripe_payment_intent_id, stripe_charge_id, amount_cents, currency, status, raw_event_json) VALUES (?,?,?,?,?,?,?)",
        [orderId, pi.id, chargeId, pi.amount, pi.currency || "cad", "succeeded", JSON.stringify(event).slice(0, 60000)]
      );
    }
    await dbRun("UPDATE orders SET payment_status = 'paid', stripe_payment_intent_id = ? WHERE id = ?", [pi.id, orderId]);
    DEPS.logOrderEvent && DEPS.logOrderEvent(orderId, "payment_succeeded", JSON.stringify({ pi: pi.id, amount: pi.amount }));
    DEPS.emitOrderById && DEPS.emitOrderById(orderId, "payment_succeeded", { amount_cents: pi.amount });
  } else if (t === "payment_intent.payment_failed") {
    const pi = event.data.object;
    const orderId = pi.metadata && pi.metadata.order_id ? parseInt(pi.metadata.order_id, 10) : null;
    if (!orderId) return;
    await dbRun("UPDATE orders SET payment_status = 'failed' WHERE id = ?", [orderId]);
    DEPS.logOrderEvent && DEPS.logOrderEvent(orderId, "payment_failed", pi.last_payment_error ? JSON.stringify(pi.last_payment_error).slice(0, 1000) : null);
    DEPS.emitOrderById && DEPS.emitOrderById(orderId, "payment_failed", {});
  } else if (t === "charge.refunded") {
    const ch = event.data.object;
    const piId = ch.payment_intent;
    const payment = await dbGet("SELECT * FROM payments WHERE stripe_payment_intent_id = ?", [piId]);
    if (!payment) return;
    // Iterate refunds list, insert any not yet stored
    const list = (ch.refunds && ch.refunds.data) || [];
    for (const r of list) {
      const exists = await dbGet("SELECT id FROM refunds WHERE stripe_refund_id = ?", [r.id]);
      if (exists) continue;
      await dbRun("INSERT INTO refunds (payment_id, order_id, stripe_refund_id, amount_cents, reason) VALUES (?,?,?,?,?)",
        [payment.id, payment.order_id, r.id, r.amount, r.reason || null]);
    }
    // Compute total refunded; update order payment_status
    const totals = await dbGet("SELECT COALESCE(SUM(amount_cents),0) s FROM refunds WHERE order_id = ?", [payment.order_id]);
    const refundedCents = Number(totals.s);
    const newStatus = refundedCents >= Number(payment.amount_cents) ? "refunded" : "partially_refunded";
    await dbRun("UPDATE orders SET payment_status = ? WHERE id = ?", [newStatus, payment.order_id]);
    DEPS.logOrderEvent && DEPS.logOrderEvent(payment.order_id, "refunded", JSON.stringify({ cents: refundedCents }));
    DEPS.emitOrderById && DEPS.emitOrderById(payment.order_id, "refund_created", { refunded_cents: refundedCents, status: newStatus });
  }
}

// ---------- Routes ----------
async function mountPayments(app, deps) {
  DEPS = deps;
  await initSchema(deps);

  const { requireAdmin, rateLimit } = deps;
  const paymentLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, keyPrefix: "pay" });

  app.get("/api/payments/config", (_req, res) => {
    res.json({
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
      enabled: Boolean(process.env.STRIPE_PUBLISHABLE_KEY && process.env.STRIPE_SECRET_KEY),
    });
  });

  app.post("/api/payments/quote", paymentLimiter, async (req, res) => {
    try {
      const q = await computeQuote(req.body || {});
      const { prepared, ...pub } = q;
      void prepared;
      res.json(pub);
    } catch (e) {
      const code = e.statusCode || 500;
      res.status(code).json({ error: code === 500 ? "Erreur" : e.message });
      if (code === 500) console.error("[pay] quote", e);
    }
  });

  app.post("/api/payments/create-intent", paymentLimiter, async (req, res) => {
    try {
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: "Paiements en ligne non configurés" });
      const q = await computeQuote(req.body || {});
      // Build the insert payload using the prepared object — already validated server-side
      const b = req.body || {};
      const prepared = q.prepared;
      const orderNumber = await deps.dbApi.nextOrderNumber();
      const id = await deps.dbApi.insertOrder({
        order_number: orderNumber,
        customer_name: prepared.customer_name,
        customer_phone: prepared.customer_phone,
        customer_email: prepared.customer_email,
        order_type: prepared.order_type,
        delivery_address: prepared.delivery_address,
        delivery_unit: prepared.delivery_unit,
        delivery_door_code: prepared.delivery_door_code,
        delivery_instructions: prepared.delivery_instructions,
        preferred_time: prepared.preferred_time,
        payment_method: "card_online",
        items_json: JSON.stringify(prepared.items),
        subtotal: prepared.subtotal,
        gst: q.gst,
        qst: q.qst,
        total: q.total,
        delivery_fee: q.delivery_fee,
        special_notes: prepared.special_notes,
        estimated_ready_time: prepared.estimated_ready_time,
        estimated_delivery_time: prepared.estimated_delivery_time,
      });
      // Attach coupon/discount + initial pending state + attach customer if token
      const updates = ["payment_status = 'pending'"];
      const params = [];
      if (q.discount > 0) { updates.push("discount = ?"); params.push(q.discount); }
      if (q.coupon) { updates.push("coupon_code = ?"); params.push(q.coupon.code); }
      params.push(id);
      await dbRun(`UPDATE orders SET ${updates.join(", ")} WHERE id = ?`, params);
      try {
        const h = req.header("authorization") || "";
        const m = h.match(/^Bearer\s+(.+)$/i);
        if (m && typeof deps.attachCustomerByToken === "function") {
          await deps.attachCustomerByToken(m[1], id);
        }
      } catch (_) {}

      const pi = await stripe.paymentIntents.create({
        amount: Math.round(q.total * 100),
        currency: "cad",
        automatic_payment_methods: { enabled: true },
        metadata: { order_id: String(id), order_number: orderNumber },
        receipt_email: prepared.customer_email || undefined,
        description: `Commande ${orderNumber}`,
      });
      await dbRun(
        "INSERT INTO payments (order_id, stripe_payment_intent_id, amount_cents, currency, status) VALUES (?,?,?,?,?)",
        [id, pi.id, pi.amount, pi.currency, "pending"]
      );
      await dbRun("UPDATE orders SET stripe_payment_intent_id = ? WHERE id = ?", [pi.id, id]);
      res.json({
        clientSecret: pi.client_secret,
        orderNumber,
        orderId: id,
        total: q.total,
      });
    } catch (e) {
      const code = e.statusCode || 500;
      if (code === 500) console.error("[pay] create-intent", e);
      res.status(code).json({ error: code === 500 ? "Erreur paiement" : e.message });
    }
  });

  // Admin refund
  app.post("/api/admin/orders/:id/refund", requireAdmin, async (req, res) => {
    try {
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: "Stripe non configuré" });
      const orderId = parseInt(req.params.id, 10);
      const payment = await dbGet("SELECT * FROM payments WHERE order_id = ? AND status = 'succeeded' ORDER BY id DESC LIMIT 1", [orderId]);
      if (!payment) return res.status(404).json({ error: "Aucun paiement remboursable trouvé" });
      const refundedRow = await dbGet("SELECT COALESCE(SUM(amount_cents),0) s FROM refunds WHERE order_id = ?", [orderId]);
      const already = Number(refundedRow.s);
      const max = Number(payment.amount_cents) - already;
      const askedAmount = req.body && req.body.amount != null ? Math.round(Number(req.body.amount) * 100) : max;
      if (!askedAmount || askedAmount <= 0) return res.status(400).json({ error: "Montant invalide" });
      if (askedAmount > max) return res.status(400).json({ error: `Montant maximum remboursable : ${(max / 100).toFixed(2)} $` });
      const refund = await stripe.refunds.create({
        payment_intent: payment.stripe_payment_intent_id,
        amount: askedAmount,
        reason: req.body && req.body.reason ? "requested_by_customer" : undefined,
        metadata: { admin_reason: (req.body && req.body.reason) ? String(req.body.reason).slice(0, 200) : "" },
      });
      await dbRun("INSERT INTO refunds (payment_id, order_id, stripe_refund_id, amount_cents, reason) VALUES (?,?,?,?,?)",
        [payment.id, orderId, refund.id, refund.amount, req.body && req.body.reason ? String(req.body.reason).slice(0, 200) : null]);
      const totalAfter = already + askedAmount;
      const newStatus = totalAfter >= Number(payment.amount_cents) ? "refunded" : "partially_refunded";
      await dbRun("UPDATE orders SET payment_status = ? WHERE id = ?", [newStatus, orderId]);
      DEPS.logOrderEvent && DEPS.logOrderEvent(orderId, "refunded", JSON.stringify({ cents: askedAmount, by: "admin" }));
      DEPS.emitOrderById && DEPS.emitOrderById(orderId, "refund_created", { refunded_cents: askedAmount, status: newStatus });
      res.json({ ok: true, refund_id: refund.id, amount_cents: askedAmount, status: newStatus });
    } catch (e) {
      console.error("[pay] refund", e);
      res.status(500).json({ error: e.message || "Erreur remboursement" });
    }
  });

  // List refunds for an order (admin)
  app.get("/api/admin/orders/:id/payments", requireAdmin, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);
      const payments = await dbAll("SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC", [orderId]);
      const refunds = await dbAll("SELECT * FROM refunds WHERE order_id = ? ORDER BY id DESC", [orderId]);
      res.json({ payments, refunds });
    } catch (e) { console.error(e); res.status(500).json({ error: "Erreur" }); }
  });

  // ---------- Coupons CRUD (admin) ----------
  app.get("/api/admin/coupons", requireAdmin, async (_req, res) => {
    try { res.json({ coupons: await dbAll("SELECT * FROM coupons ORDER BY id DESC") }); }
    catch (e) { console.error(e); res.status(500).json({ error: "Erreur" }); }
  });
  app.post("/api/admin/coupons", requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const code = String(b.code || "").trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return res.status(400).json({ error: "Code invalide (3-40 caractères A-Z 0-9 _-)" });
      const kind = ["percent", "amount", "free_delivery"].includes(b.kind) ? b.kind : "percent";
      const value = Math.max(0, Number(b.value) || 0);
      const min_subtotal = Math.max(0, Number(b.min_subtotal) || 0);
      const expires_at = b.expires_at ? String(b.expires_at).slice(0, 30) : null;
      const max_uses = b.max_uses == null || b.max_uses === "" ? null : Math.max(1, parseInt(b.max_uses, 10));
      const active = b.active === false ? 0 : 1;
      const r = await dbRun(
        "INSERT INTO coupons (code, kind, value, min_subtotal, expires_at, max_uses, active) VALUES (?,?,?,?,?,?,?)",
        [code, kind, value, min_subtotal, expires_at, max_uses, active]
      );
      res.json({ ok: true, id: r.lastID });
    } catch (e) {
      if (String(e.message || "").match(/UNIQUE|Duplicate/i)) return res.status(409).json({ error: "Ce code existe déjà" });
      console.error(e); res.status(500).json({ error: "Erreur" });
    }
  });
  app.delete("/api/admin/coupons/:id", requireAdmin, async (req, res) => {
    try { await dbRun("DELETE FROM coupons WHERE id = ?", [parseInt(req.params.id, 10)]); res.json({ ok: true }); }
    catch (e) { console.error(e); res.status(500).json({ error: "Erreur" }); }
  });
  app.patch("/api/admin/coupons/:id", requireAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const sets = []; const params = [];
      if (b.active != null) { sets.push("active = ?"); params.push(b.active ? 1 : 0); }
      if (b.value != null) { sets.push("value = ?"); params.push(Math.max(0, Number(b.value) || 0)); }
      if (b.min_subtotal != null) { sets.push("min_subtotal = ?"); params.push(Math.max(0, Number(b.min_subtotal) || 0)); }
      if (b.max_uses !== undefined) { sets.push("max_uses = ?"); params.push(b.max_uses == null || b.max_uses === "" ? null : Math.max(1, parseInt(b.max_uses, 10))); }
      if (b.expires_at !== undefined) { sets.push("expires_at = ?"); params.push(b.expires_at || null); }
      if (sets.length === 0) return res.json({ ok: true });
      params.push(parseInt(req.params.id, 10));
      await dbRun(`UPDATE coupons SET ${sets.join(", ")} WHERE id = ?`, params);
      res.json({ ok: true });
    } catch (e) { console.error(e); res.status(500).json({ error: "Erreur" }); }
  });

  console.log("[payments] Stripe routes mounted (configured:", Boolean(process.env.STRIPE_SECRET_KEY), ")");
}

module.exports = { mountPayments, webhookHandler };

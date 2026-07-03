"use strict";
// Phase 6 — Driver Portal: auth (PIN or SMS OTP), sessions, delivery workflow.

const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const SESSION_TTL_HOURS = 12;
const OTP_TTL_MS = 10 * 60 * 1000;

function sha256(v) { return crypto.createHash("sha256").update(String(v)).digest("hex"); }
function randToken(len = 32) { return crypto.randomBytes(len).toString("hex"); }
function randPin(n = 6) { return String(Math.floor(Math.random() * 10 ** n)).padStart(n, "0"); }

// Simple in-memory rate limiter for driver login/OTP
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const cur = hits.get(key);
    if (!cur || now - cur.start > windowMs) { hits.set(key, { start: now, count: 1 }); return true; }
    cur.count += 1;
    return cur.count <= max;
  };
}
const otpLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

function createDrivers({ dbApi, sms, realtime, emitOrderStatus }) {
  const isMysql = dbApi.kind === "mysql";

  async function q(sql, params = []) {
    if (isMysql) { const [r] = await dbApi._pool.query(sql, params); return r; }
    // sqlite: SELECT vs write
    const s = dbApi._db.prepare(sql);
    if (/^\s*select/i.test(sql)) return s.all(...params);
    return s.run(...params);
  }
  async function qOne(sql, params = []) {
    if (isMysql) { const [r] = await dbApi._pool.query(sql, params); return r[0] || null; }
    return dbApi._db.prepare(sql).get(...params) || null;
  }

  async function init() {
    if (isMysql) {
      await dbApi._pool.query(`CREATE TABLE IF NOT EXISTS driver_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        driver_id INT NOT NULL UNIQUE,
        phone VARCHAR(40) NOT NULL,
        pin_hash VARCHAR(120) NULL,
        otp_hash VARCHAR(120) NULL,
        otp_expires_at DATETIME NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        last_login_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_du_phone (phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await dbApi._pool.query(`CREATE TABLE IF NOT EXISTS driver_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        driver_id INT NOT NULL,
        token_hash VARCHAR(120) NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ds_token (token_hash),
        INDEX idx_ds_driver (driver_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await dbApi._pool.query(`CREATE TABLE IF NOT EXISTS driver_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        driver_id INT NOT NULL,
        order_id INT NULL,
        event_type VARCHAR(40) NOT NULL,
        meta_json TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_de_driver (driver_id),
        INDEX idx_de_order (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      for (const col of [
        "ADD COLUMN driver_status VARCHAR(20) NOT NULL DEFAULT 'assigned'",
        "ADD COLUMN driver_accepted_at DATETIME NULL",
        "ADD COLUMN picked_up_at DATETIME NULL",
      ]) { try { await dbApi._pool.query(`ALTER TABLE driver_assignments ${col}`); } catch (_) {} }
      try { await dbApi._pool.query("ALTER TABLE drivers ADD COLUMN shift_online TINYINT(1) NOT NULL DEFAULT 0"); } catch (_) {}
    } else {
      const db = dbApi._db;
      db.exec(`CREATE TABLE IF NOT EXISTS driver_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        driver_id INTEGER NOT NULL UNIQUE,
        phone TEXT NOT NULL,
        pin_hash TEXT,
        otp_hash TEXT,
        otp_expires_at TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        last_login_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_du_phone ON driver_users(phone)");
      db.exec(`CREATE TABLE IF NOT EXISTS driver_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        driver_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_ds_token ON driver_sessions(token_hash)");
      db.exec(`CREATE TABLE IF NOT EXISTS driver_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        driver_id INTEGER NOT NULL,
        order_id INTEGER,
        event_type TEXT NOT NULL,
        meta_json TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      for (const c of [
        "ALTER TABLE driver_assignments ADD COLUMN driver_status TEXT NOT NULL DEFAULT 'assigned'",
        "ALTER TABLE driver_assignments ADD COLUMN driver_accepted_at TEXT",
        "ALTER TABLE driver_assignments ADD COLUMN picked_up_at TEXT",
        "ALTER TABLE drivers ADD COLUMN shift_online INTEGER NOT NULL DEFAULT 0",
      ]) { try { db.exec(c); } catch (_) {} }
    }
  }

  async function upsertUserFromDriver(driver) {
    if (!driver || !driver.phone) return null;
    const norm = sms.normalizePhone(driver.phone) || driver.phone;
    const existing = await qOne("SELECT * FROM driver_users WHERE driver_id=?", [driver.id]);
    if (existing) {
      await q("UPDATE driver_users SET phone=?, active=? WHERE driver_id=?", [norm, driver.active ? 1 : 0, driver.id]);
      return { ...existing, phone: norm };
    }
    if (isMysql) {
      const [r] = await dbApi._pool.query("INSERT INTO driver_users (driver_id, phone, active) VALUES (?,?,?)", [driver.id, norm, driver.active ? 1 : 0]);
      return { id: r.insertId, driver_id: driver.id, phone: norm, active: 1, pin_hash: null, otp_hash: null, otp_expires_at: null };
    }
    const r = dbApi._db.prepare("INSERT INTO driver_users (driver_id, phone, active) VALUES (?,?,?)").run(driver.id, norm, driver.active ? 1 : 0);
    return { id: r.lastInsertRowid, driver_id: driver.id, phone: norm, active: 1, pin_hash: null, otp_hash: null, otp_expires_at: null };
  }

  async function findUserByPhone(phone) {
    const norm = sms.normalizePhone(phone);
    if (!norm) return null;
    // Ensure a driver_users row exists for any driver matching this phone
    const drivers = await q("SELECT * FROM drivers WHERE active=1", []);
    for (const d of drivers) {
      if (sms.normalizePhone(d.phone) === norm) {
        const u = await upsertUserFromDriver(d);
        if (u) return { user: u, driver: d };
      }
    }
    return null;
  }

  async function createSession(driverId) {
    const token = randToken(24);
    const tokenHash = sha256(token);
    const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
    const expStr = isMysql ? expires.toISOString().slice(0, 19).replace("T", " ") : expires.toISOString();
    await q("INSERT INTO driver_sessions (driver_id, token_hash, expires_at) VALUES (?,?,?)", [driverId, tokenHash, expStr]);
    await q("UPDATE driver_users SET last_login_at=" + (isMysql ? "CURRENT_TIMESTAMP" : "datetime('now')") + " WHERE driver_id=?", [driverId]);
    return { token, expires_at: expires.toISOString() };
  }

  async function verifySessionToken(token) {
    if (!token) return null;
    const th = sha256(token);
    const row = await qOne("SELECT * FROM driver_sessions WHERE token_hash=?", [th]);
    if (!row) return null;
    const exp = row.expires_at instanceof Date ? row.expires_at.getTime() : Date.parse(row.expires_at);
    if (!exp || exp < Date.now()) return null;
    const driver = await qOne("SELECT * FROM drivers WHERE id=?", [row.driver_id]);
    if (!driver || !driver.active) return null;
    return { driver, sessionId: row.id };
  }

  function driverAuth(req, res, next) {
    const h = req.header("authorization") || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    const token = m ? m[1] : (req.query.token || "");
    verifySessionToken(token).then((ctx) => {
      if (!ctx) return res.status(401).json({ error: "Session invalide" });
      req.driver = ctx.driver;
      req.driverSessionId = ctx.sessionId;
      next();
    }).catch((e) => { console.error(e); res.status(500).json({ error: "Erreur session" }); });
  }

  async function logDriverEvent(driverId, orderId, type, meta) {
    try { await q("INSERT INTO driver_events (driver_id, order_id, event_type, meta_json) VALUES (?,?,?,?)", [driverId, orderId || null, type, meta ? JSON.stringify(meta) : null]); }
    catch (e) { console.error("[driver_event]", e.message); }
  }

  async function listDriverOrders(driverId) {
    const rows = await q(
      `SELECT a.id AS assignment_id, a.order_id, a.driver_status, a.assigned_at, a.driver_accepted_at, a.picked_up_at, a.delivered_at, a.notes,
              o.order_number, o.customer_name, o.customer_phone, o.delivery_address, o.delivery_unit, o.delivery_door_code, o.delivery_instructions,
              o.total, o.status, o.preferred_time, o.special_notes, o.items_json
       FROM driver_assignments a
       JOIN orders o ON o.id = a.order_id
       WHERE a.driver_id = ? AND a.delivered_at IS NULL
       ORDER BY a.assigned_at DESC LIMIT 50`, [driverId]
    );
    return rows.map((r) => ({
      ...r,
      assigned_at: r.assigned_at instanceof Date ? r.assigned_at.toISOString() : r.assigned_at,
      driver_accepted_at: r.driver_accepted_at instanceof Date ? r.driver_accepted_at.toISOString() : r.driver_accepted_at,
      picked_up_at: r.picked_up_at instanceof Date ? r.picked_up_at.toISOString() : r.picked_up_at,
      delivered_at: r.delivered_at instanceof Date ? r.delivered_at.toISOString() : r.delivered_at,
    }));
  }

  async function updateAssignmentStatus(orderId, driverId, newStatus, extraCol) {
    const nowSql = isMysql ? "CURRENT_TIMESTAMP" : "datetime('now')";
    const sets = ["driver_status = ?"];
    const params = [newStatus];
    if (extraCol) { sets.push(`${extraCol} = ${nowSql}`); }
    params.push(orderId, driverId);
    await q(`UPDATE driver_assignments SET ${sets.join(", ")} WHERE order_id=? AND driver_id=? AND delivered_at IS NULL`, params);
  }

  function mount(app, { requireAdmin }) {
    // === Public/driver endpoints ===

    // Request an OTP
    app.post("/api/driver/request-otp", async (req, res) => {
      try {
        const phone = String(req.body?.phone || "").trim();
        const norm = sms.normalizePhone(phone);
        if (!norm) return res.status(400).json({ error: "Numéro invalide" });
        if (!otpLimit(norm)) return res.status(429).json({ error: "Trop de tentatives. Réessayez plus tard." });
        const found = await findUserByPhone(phone);
        if (!found) return res.status(404).json({ error: "Aucun livreur trouvé avec ce numéro" });
        const cfg = sms.config();
        if (!cfg.enabled || !cfg.configured) {
          return res.status(400).json({ error: "SMS OTP non disponible. Utilisez votre PIN administrateur." });
        }
        const code = randPin(6);
        const hash = await bcrypt.hash(code, 8);
        const exp = new Date(Date.now() + OTP_TTL_MS);
        const expStr = isMysql ? exp.toISOString().slice(0, 19).replace("T", " ") : exp.toISOString();
        await q("UPDATE driver_users SET otp_hash=?, otp_expires_at=? WHERE driver_id=?", [hash, expStr, found.driver.id]);
        sms.send({ to: norm, type: "driver_otp", body: `Deli Aden — Code livreur: ${code} (valide 10 min)`, force: true })
          .catch((e) => console.error("[sms] otp", e.message));
        res.json({ ok: true, method: "sms" });
      } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
    });

    // Login (PIN or OTP)
    app.post("/api/driver/login", async (req, res) => {
      try {
        const phone = String(req.body?.phone || "").trim();
        const code = String(req.body?.code || "").trim();
        if (!phone || !code) return res.status(400).json({ error: "Numéro et code requis" });
        const rlKey = (sms.normalizePhone(phone) || phone) + "|login";
        if (!loginLimit(rlKey)) return res.status(429).json({ error: "Trop de tentatives" });
        const found = await findUserByPhone(phone);
        if (!found) return res.status(404).json({ error: "Livreur introuvable" });
        const u = await qOne("SELECT * FROM driver_users WHERE driver_id=?", [found.driver.id]);
        if (!u || !u.active) return res.status(403).json({ error: "Compte livreur inactif" });

        let ok = false;
        // Try OTP first
        if (u.otp_hash && u.otp_expires_at) {
          const exp = u.otp_expires_at instanceof Date ? u.otp_expires_at.getTime() : Date.parse(u.otp_expires_at);
          if (exp && exp > Date.now() && await bcrypt.compare(code, u.otp_hash)) {
            ok = true;
            await q("UPDATE driver_users SET otp_hash=NULL, otp_expires_at=NULL WHERE driver_id=?", [found.driver.id]);
          }
        }
        // Try PIN
        if (!ok && u.pin_hash) ok = await bcrypt.compare(code, u.pin_hash);
        if (!ok) return res.status(401).json({ error: "Code invalide" });

        const sess = await createSession(found.driver.id);
        res.json({ ok: true, token: sess.token, expires_at: sess.expires_at, driver: { id: found.driver.id, name: found.driver.name, phone: found.driver.phone } });
      } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
    });

    app.get("/api/driver/me", driverAuth, async (req, res) => {
      res.json({ driver: { id: req.driver.id, name: req.driver.name, phone: req.driver.phone, shift_online: !!req.driver.shift_online } });
    });

    app.get("/api/driver/orders", driverAuth, async (req, res) => {
      try { res.json({ orders: await listDriverOrders(req.driver.id) }); }
      catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
    });

    app.post("/api/driver/orders/:id/accept", driverAuth, async (req, res) => {
      try {
        const orderId = parseInt(req.params.id, 10);
        await updateAssignmentStatus(orderId, req.driver.id, "accepted", "driver_accepted_at");
        await logDriverEvent(req.driver.id, orderId, "driver_accepted");
        try {
          const row = await dbApi.getOrderById(orderId);
          if (row) realtime.emitOrder(row.order_number, "driver_accepted", { order_number: row.order_number, driver_name: req.driver.name });
          realtime.emitAdmin("driver_accepted", { order_id: orderId, driver_id: req.driver.id });
        } catch (_) {}
        res.json({ ok: true });
      } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
    });

    app.post("/api/driver/orders/:id/picked-up", driverAuth, async (req, res) => {
      try {
        const orderId = parseInt(req.params.id, 10);
        await updateAssignmentStatus(orderId, req.driver.id, "picked_up", "picked_up_at");
        await logDriverEvent(req.driver.id, orderId, "driver_picked_up");
        try {
          const row = await dbApi.getOrderById(orderId);
          if (row) {
            realtime.emitOrder(row.order_number, "driver_picked_up", { order_number: row.order_number, driver_name: req.driver.name });
            realtime.emitAdmin("driver_picked_up", { order_id: orderId, driver_id: req.driver.id, order_number: row.order_number });
            sms.notifyCustomer(row, "order_dispatched");
          }
        } catch (_) {}
        res.json({ ok: true });
      } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
    });

    app.post("/api/driver/orders/:id/delivered", driverAuth, async (req, res) => {
      try {
        const orderId = parseInt(req.params.id, 10);
        await updateAssignmentStatus(orderId, req.driver.id, "delivered");
        await dbApi.markAssignmentDelivered(orderId);
        await dbApi.updateOrder(orderId, "completed", { note: `Livraison confirmée par ${req.driver.name}` });
        await logDriverEvent(req.driver.id, orderId, "driver_delivered");
        try {
          const row = await dbApi.getOrderById(orderId);
          if (row) {
            realtime.emitOrder(row.order_number, "order_delivered", { order_number: row.order_number });
            realtime.emitAdmin("order_delivered", { order_id: orderId, order_number: row.order_number });
            sms.notifyCustomer(row, "order_completed");
          }
        } catch (_) {}
        if (emitOrderStatus) await emitOrderStatus(orderId);
        res.json({ ok: true });
      } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
    });

    app.post("/api/driver/shift", driverAuth, async (req, res) => {
      try {
        const online = req.body?.online ? 1 : 0;
        await q("UPDATE drivers SET shift_online=? WHERE id=?", [online, req.driver.id]);
        await logDriverEvent(req.driver.id, null, online ? "shift_online" : "shift_offline");
        realtime.emitAdmin(online ? "driver_online" : "driver_offline", { driver_id: req.driver.id, name: req.driver.name });
        res.json({ ok: true, online: !!online });
      } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
    });

    // === Admin endpoints ===

    // Set/reset driver PIN
    app.post("/api/admin/drivers/:id/pin", requireAdmin, async (req, res) => {
      try {
        const driverId = parseInt(req.params.id, 10);
        const pin = String(req.body?.pin || "").trim();
        if (!/^\d{4,8}$/.test(pin)) return res.status(400).json({ error: "PIN 4-8 chiffres requis" });
        const driver = await qOne("SELECT * FROM drivers WHERE id=?", [driverId]);
        if (!driver) return res.status(404).json({ error: "Livreur introuvable" });
        await upsertUserFromDriver(driver);
        const hash = await bcrypt.hash(pin, 8);
        await q("UPDATE driver_users SET pin_hash=? WHERE driver_id=?", [hash, driverId]);
        res.json({ ok: true });
      } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
    });

    // Unassign
    app.post("/api/admin/orders/:id/unassign", requireAdmin, async (req, res) => {
      try {
        const orderId = parseInt(req.params.id, 10);
        // "Delete" active assignments to unassign
        if (isMysql) await dbApi._pool.query("DELETE FROM driver_assignments WHERE order_id=? AND delivered_at IS NULL", [orderId]);
        else dbApi._db.prepare("DELETE FROM driver_assignments WHERE order_id=? AND delivered_at IS NULL").run(orderId);
        await dbApi.updateOrder(orderId, "ready", { note: "Livreur retiré" });
        try {
          const row = await dbApi.getOrderById(orderId);
          if (row) {
            realtime.emitAdmin("order_unassigned", { order_id: orderId, order_number: row.order_number });
            realtime.emitOrder(row.order_number, "driver_unassigned", { order_number: row.order_number });
          }
        } catch (_) {}
        if (emitOrderStatus) await emitOrderStatus(orderId);
        res.json({ ok: true });
      } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
    });

    // Reassign
    app.post("/api/admin/orders/:id/reassign", requireAdmin, async (req, res) => {
      try {
        const orderId = parseInt(req.params.id, 10);
        const driverId = parseInt(req.body?.driver_id, 10);
        if (!driverId) return res.status(400).json({ error: "driver_id requis" });
        if (isMysql) await dbApi._pool.query("DELETE FROM driver_assignments WHERE order_id=? AND delivered_at IS NULL", [orderId]);
        else dbApi._db.prepare("DELETE FROM driver_assignments WHERE order_id=? AND delivered_at IS NULL").run(orderId);
        await dbApi.assignDriver(orderId, driverId, "réassigné");
        await dbApi.updateOrder(orderId, "dispatched", { note: `Réassigné au livreur #${driverId}` });
        try {
          const row = await dbApi.getOrderById(orderId);
          realtime.emitAdmin("order_assigned", { order_id: orderId, driver_id: driverId, order_number: row && row.order_number });
          if (row) realtime.emitOrder(row.order_number, "driver_assigned", { order_number: row.order_number });
        } catch (_) {}
        if (emitOrderStatus) await emitOrderStatus(orderId);
        res.json({ ok: true });
      } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
    });
  }

  return { init, mount, driverAuth, verifySessionToken };
}

module.exports = { createDrivers };

/* eslint-disable */
// MochaHost Node.js entry point — Deli Aden ordering system.
// Run with: node server.cjs
// Requires: npm install && npm run build (produces ./dist)
//
// Database priority:
//   1. MySQL/MariaDB if DB_HOST is set (recommended for production)
//   2. SQLite (better-sqlite3) fallback for local/dev

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const compression = require("compression");
const helmet = require("helmet");
const nodemailer = require("nodemailer");
const { verifyToken: verifyCustomerToken } = require("./server-customers.cjs");
const { mountPayments, webhookHandler: stripeWebhookHandler } = require("./server-payments.cjs");
const { createRealtime } = require("./server-realtime.cjs");

const PORT = parseInt(process.env.PORT || "3000", 10);
const DIST_DIR = path.join(__dirname, "dist");
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PROD = NODE_ENV === "production";

// ---- Admin password (required in production) ----
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (IS_PROD && (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8)) {
  console.error("[FATAL] ADMIN_PASSWORD env var is required in production (min 8 chars).");
  process.exit(1);
}
const EFFECTIVE_ADMIN_PASSWORD = ADMIN_PASSWORD || "deli-aden-admin";

const RESTAURANT_EMAIL = process.env.RESTAURANT_EMAIL || "orders@deliaden.ca";
const FROM_EMAIL = process.env.FROM_EMAIL || "notify@deliaden.ca";
const RESTAURANT_PHONE = process.env.RESTAURANT_PHONE || "";
const USE_MYSQL = Boolean(process.env.DB_HOST);
const STARTED_AT = Date.now();

// Default restaurant operations settings (overridable via DB)
const DEFAULT_SETTINGS = {
  is_open: true,
  orders_paused: false,
  pickup_enabled: true,
  delivery_enabled: true,
  est_pickup_min: 20,
  est_delivery_min: 45,
  min_order: 0,
  delivery_fee: 5,
  free_delivery_threshold: 0,
  gst_rate: 0.05,
  qst_rate: 0.09975,
  restaurant_name: "Les Délices d'Aden",
  restaurant_phone: RESTAURANT_PHONE,
  restaurant_address: "",
  restaurant_email: RESTAURANT_EMAIL,
  google_maps_url: "",
  opening_hours: "Lun-Dim : 11h00 – 22h00",
  order_pause_message: "Les commandes sont temporairement suspendues. Merci de réessayer dans quelques minutes.",
  closed_message: "Le restaurant est actuellement fermé. Merci de revenir pendant les heures d'ouverture.",
  hidden_categories: "",
  delivery_zone_text: "Livraison disponible dans un rayon de 8 km autour du restaurant.",
};

// =====================================================================
// Helpers — sanitization, escaping, CSV injection guard
// =====================================================================
function escapeHtml(v) {
  if (v == null) return "";
  return String(v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function clean(v, max = 500) {
  if (v == null) return "";
  // strip control chars (keep newline + tab), trim, cap length
  return String(v).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim().slice(0, max);
}
function csvCell(v) {
  if (v == null) return "";
  let s = String(v);
  // CSV injection guard: prefix dangerous leading chars
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  s = s.replace(/"/g, '""');
  return /[",\n\r]/.test(s) ? `"${s}"` : s;
}

// =====================================================================
// Rate limiter — simple in-memory token bucket, per-IP per-route
// =====================================================================
function rateLimit({ windowMs, max, keyPrefix }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const ip = (req.headers["x-forwarded-for"] || req.ip || req.socket.remoteAddress || "?")
      .toString().split(",")[0].trim();
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const cur = hits.get(key);
    if (!cur || now - cur.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }
    cur.count += 1;
    if (cur.count > max) {
      const retry = Math.ceil((windowMs - (now - cur.start)) / 1000);
      res.setHeader("Retry-After", String(retry));
      return res.status(429).json({ error: "Trop de requêtes. Réessayez dans quelques instants." });
    }
    next();
  };
}
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyPrefix: "login" });
const orderLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, keyPrefix: "order" });
const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, keyPrefix: "contact" });

// =====================================================================
// Database abstraction — MySQL (prod) and SQLite (fallback)
// =====================================================================
let dbApi;
let dbConnected = false;
let mysqlPool = null;
let sqliteDb = null;

if (USE_MYSQL) {
  const mysql = require("mysql2/promise");
  mysqlPool = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    charset: "utf8mb4",
  });
  mysqlPool.on("error", (e) => console.error("[mysql] pool error", e.code, e.message));

  async function init() {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.query(`CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_number VARCHAR(32) NOT NULL UNIQUE,
        status VARCHAR(32) NOT NULL DEFAULT 'new',
        customer_name VARCHAR(160) NOT NULL,
        customer_phone VARCHAR(40) NOT NULL,
        customer_email VARCHAR(200),
        order_type VARCHAR(20) NOT NULL,
        delivery_address TEXT,
        preferred_time VARCHAR(60) NOT NULL DEFAULT 'ASAP',
        payment_method VARCHAR(40) NOT NULL,
        items_json LONGTEXT NOT NULL,
        subtotal DECIMAL(10,2) NOT NULL,
        gst DECIMAL(10,2) NOT NULL,
        qst DECIMAL(10,2) NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        special_notes TEXT,
        admin_notes TEXT,
        cancel_reason TEXT,
        dispatched_at DATETIME NULL,
        completed_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_orders_status (status),
        INDEX idx_orders_created_at (created_at),
        INDEX idx_orders_customer_phone (customer_phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

      // Best-effort: add new columns if upgrading from older schema
      for (const col of [
        "ADD COLUMN admin_notes TEXT",
        "ADD COLUMN cancel_reason TEXT",
        "ADD COLUMN dispatched_at DATETIME NULL",
        "ADD COLUMN completed_at DATETIME NULL",
        "ADD COLUMN delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0",
        "ADD COLUMN delivery_unit VARCHAR(80) NULL",
        "ADD COLUMN delivery_door_code VARCHAR(40) NULL",
        "ADD COLUMN delivery_instructions TEXT NULL",
        "ADD COLUMN estimated_ready_time DATETIME NULL",
        "ADD COLUMN estimated_delivery_time DATETIME NULL",
      ]) {
        try { await conn.query(`ALTER TABLE orders ${col}`); } catch (_) { /* exists */ }
      }

      await conn.query(`CREATE TABLE IF NOT EXISTS order_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        event VARCHAR(40) NOT NULL,
        meta TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_event_order (order_id),
        INDEX idx_event_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

      await conn.query(`CREATE TABLE IF NOT EXISTS contact_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(160) NOT NULL, phone VARCHAR(40), email VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

      await conn.query(`CREATE TABLE IF NOT EXISTS email_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        recipient VARCHAR(200) NOT NULL, subject VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL, error TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email_status (status), INDEX idx_email_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

      await conn.query(`CREATE TABLE IF NOT EXISTS settings (
        k VARCHAR(64) PRIMARY KEY,
        v LONGTEXT NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

      await conn.query(`CREATE TABLE IF NOT EXISTS menu_overrides (
        item_id VARCHAR(64) PRIMARY KEY,
        available TINYINT(1) NOT NULL DEFAULT 1,
        price_override DECIMAL(10,2) NULL,
        description_override TEXT NULL,
        image_override TEXT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

      await conn.query(`CREATE TABLE IF NOT EXISTS counters (
        name VARCHAR(40) PRIMARY KEY, value INT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await conn.query("INSERT IGNORE INTO counters (name, value) VALUES ('order_number', 1000)");

      await conn.query(`CREATE TABLE IF NOT EXISTS drivers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(160) NOT NULL,
        phone VARCHAR(40),
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

      await conn.query(`CREATE TABLE IF NOT EXISTS driver_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        driver_id INT NOT NULL,
        notes TEXT,
        assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        delivered_at DATETIME NULL,
        INDEX idx_assign_order (order_id),
        INDEX idx_assign_driver (driver_id),
        INDEX idx_assign_delivered (delivered_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      dbConnected = true;
    } finally {
      conn.release();
    }
  }

  dbApi = {
    kind: "mysql",
    _pool: mysqlPool,
    init,
    async ping() { try { await mysqlPool.query("SELECT 1"); dbConnected = true; return true; } catch (e) { dbConnected = false; return false; } },
    async close() { try { await mysqlPool.end(); } catch (_) {} },
    async nextOrderNumber() {
      const conn = await mysqlPool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query("UPDATE counters SET value = value + 1 WHERE name = 'order_number'");
        const [rows] = await conn.query("SELECT value FROM counters WHERE name = 'order_number'");
        await conn.commit();
        return `DA-${rows[0].value}`;
      } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    },
    async insertOrder(o) {
      const [r] = await mysqlPool.query(
        `INSERT INTO orders (order_number, customer_name, customer_phone, customer_email, order_type,
          delivery_address, preferred_time, payment_method, items_json, subtotal, gst, qst, total, special_notes, delivery_fee,
          delivery_unit, delivery_door_code, delivery_instructions, estimated_ready_time, estimated_delivery_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [o.order_number, o.customer_name, o.customer_phone, o.customer_email, o.order_type,
         o.delivery_address, o.preferred_time, o.payment_method, o.items_json,
         o.subtotal, o.gst, o.qst, o.total, o.special_notes, o.delivery_fee || 0,
         o.delivery_unit || null, o.delivery_door_code || null, o.delivery_instructions || null,
         o.estimated_ready_time || null, o.estimated_delivery_time || null]
      );
      await mysqlPool.query("INSERT INTO order_events (order_id, event, meta) VALUES (?, ?, ?)",
        [r.insertId, "created", "new"]);
      return r.insertId;
    },
    async getOrderById(id) { const [r] = await mysqlPool.query("SELECT * FROM orders WHERE id = ?", [id]); return r[0] || null; },
    async getOrderByNumber(n) { const [r] = await mysqlPool.query("SELECT * FROM orders WHERE order_number = ?", [n]); return r[0] || null; },
    async listOrders({ status, search, from, to, limit = 500 }) {
      let sql = "SELECT * FROM orders"; const where = []; const params = [];
      if (status && status !== "all") { where.push("status = ?"); params.push(status); }
      if (search) { where.push("(order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)");
        const s = `%${search}%`; params.push(s, s, s); }
      if (from) { where.push("created_at >= ?"); params.push(from); }
      if (to) { where.push("created_at <= ?"); params.push(to); }
      if (where.length) sql += " WHERE " + where.join(" AND ");
      sql += " ORDER BY created_at DESC LIMIT ?"; params.push(parseInt(limit, 10));
      const [rows] = await mysqlPool.query(sql, params); return rows;
    },
    async listEvents(orderId) {
      const [r] = await mysqlPool.query("SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at ASC", [orderId]);
      return r;
    },
    async updateOrder(id, status, { note, reason } = {}) {
      const fields = ["status = ?"]; const params = [status];
      if (status === "dispatched") { fields.push("dispatched_at = COALESCE(dispatched_at, CURRENT_TIMESTAMP)"); }
      if (status === "completed") { fields.push("completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)"); }
      if (note) { fields.push("admin_notes = ?"); params.push(note); }
      if (reason) { fields.push("cancel_reason = ?"); params.push(reason); }
      params.push(id);
      await mysqlPool.query(`UPDATE orders SET ${fields.join(", ")} WHERE id = ?`, params);
      await mysqlPool.query("INSERT INTO order_events (order_id, event, meta) VALUES (?, ?, ?)",
        [id, "status_change", JSON.stringify({ status, note: note || null, reason: reason || null })]);
    },
    async insertContact(m) {
      await mysqlPool.query("INSERT INTO contact_messages (name, phone, email, message) VALUES (?,?,?,?)",
        [m.name, m.phone, m.email, m.message]);
    },
    async logEmail(recipient, subject, status, error) {
      try { await mysqlPool.query("INSERT INTO email_logs (recipient, subject, status, error) VALUES (?,?,?,?)",
        [recipient, subject, status, error || null]); }
      catch (e) { console.error("[email_log] insert failed", e.message); }
    },
    async getSettings() {
      const [rows] = await mysqlPool.query("SELECT k, v FROM settings");
      const out = {};
      for (const r of rows) { try { out[r.k] = JSON.parse(r.v); } catch { out[r.k] = r.v; } }
      return out;
    },
    async setSettings(obj) {
      for (const [k, v] of Object.entries(obj)) {
        await mysqlPool.query(
          "INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)",
          [k, JSON.stringify(v)]
        );
      }
    },
    async getMenuOverrides() {
      const [rows] = await mysqlPool.query("SELECT * FROM menu_overrides");
      return rows.map((r) => ({
        item_id: r.item_id,
        available: r.available === 1 || r.available === true,
        price_override: r.price_override != null ? Number(r.price_override) : null,
        description_override: r.description_override,
        image_override: r.image_override,
      }));
    },
    async upsertMenuOverride(itemId, o) {
      await mysqlPool.query(
        `INSERT INTO menu_overrides (item_id, available, price_override, description_override, image_override)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE available = VALUES(available),
           price_override = VALUES(price_override),
           description_override = VALUES(description_override),
           image_override = VALUES(image_override)`,
        [itemId, o.available ? 1 : 0,
         o.price_override == null ? null : Number(o.price_override),
         o.description_override || null,
         o.image_override || null]
      );
    },
    async listDrivers({ activeOnly = false } = {}) {
      const sql = activeOnly ? "SELECT * FROM drivers WHERE active=1 ORDER BY name" : "SELECT * FROM drivers ORDER BY name";
      const [r] = await mysqlPool.query(sql); return r;
    },
    async createDriver({ name, phone, active = true }) {
      const [r] = await mysqlPool.query("INSERT INTO drivers (name, phone, active) VALUES (?,?,?)", [name, phone || null, active ? 1 : 0]);
      return r.insertId;
    },
    async updateDriver(id, { name, phone, active }) {
      const sets = []; const params = [];
      if (name != null) { sets.push("name=?"); params.push(name); }
      if (phone != null) { sets.push("phone=?"); params.push(phone); }
      if (active != null) { sets.push("active=?"); params.push(active ? 1 : 0); }
      if (!sets.length) return;
      params.push(id);
      await mysqlPool.query(`UPDATE drivers SET ${sets.join(",")} WHERE id=?`, params);
    },
    async deleteDriver(id) { await mysqlPool.query("DELETE FROM drivers WHERE id=?", [id]); },
    async assignDriver(orderId, driverId, notes) {
      const [r] = await mysqlPool.query("INSERT INTO driver_assignments (order_id, driver_id, notes) VALUES (?,?,?)", [orderId, driverId, notes || null]);
      return r.insertId;
    },
    async markAssignmentDelivered(orderId) {
      await mysqlPool.query("UPDATE driver_assignments SET delivered_at=CURRENT_TIMESTAMP WHERE order_id=? AND delivered_at IS NULL", [orderId]);
    },
    async listAssignments({ activeOnly = false } = {}) {
      const where = activeOnly ? "WHERE a.delivered_at IS NULL" : "";
      const [r] = await mysqlPool.query(`SELECT a.*, d.name AS driver_name, d.phone AS driver_phone, d.shift_online AS driver_shift_online, o.order_number, o.customer_name, o.customer_phone, o.delivery_address, o.total
        FROM driver_assignments a JOIN drivers d ON d.id=a.driver_id JOIN orders o ON o.id=a.order_id ${where} ORDER BY a.assigned_at DESC LIMIT 200`);
      return r;
    },
    async getOrderAssignment(orderId) {
      const [r] = await mysqlPool.query("SELECT a.*, d.name AS driver_name, d.phone AS driver_phone, d.shift_online AS driver_shift_online FROM driver_assignments a JOIN drivers d ON d.id=a.driver_id WHERE a.order_id=? ORDER BY a.assigned_at DESC LIMIT 1", [orderId]);
      return r[0] || null;
    },
    async metrics() {
      const [byStatus] = await mysqlPool.query("SELECT status, COUNT(*) c FROM orders GROUP BY status");
      const today = new Date(); today.setHours(0,0,0,0);
      const weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - 6);
      const monthStart = new Date(today); monthStart.setDate(monthStart.getDate() - 29);
      const fmtD = (d) => d.toISOString().slice(0,19).replace("T"," ");
      const [revT] = await mysqlPool.query("SELECT COALESCE(SUM(total),0) s, COUNT(*) c FROM orders WHERE created_at >= ? AND status != 'cancelled'", [fmtD(today)]);
      const [revW] = await mysqlPool.query("SELECT COALESCE(SUM(total),0) s FROM orders WHERE created_at >= ? AND status != 'cancelled'", [fmtD(weekStart)]);
      const [revM] = await mysqlPool.query("SELECT COALESCE(SUM(total),0) s FROM orders WHERE created_at >= ? AND status != 'cancelled'", [fmtD(monthStart)]);
      const [series] = await mysqlPool.query(
        "SELECT DATE(created_at) d, COUNT(*) orders, COALESCE(SUM(total),0) revenue FROM orders WHERE created_at >= ? AND status != 'cancelled' GROUP BY DATE(created_at) ORDER BY d ASC",
        [fmtD(new Date(Date.now() - 13*24*3600*1000))]
      );
      return {
        by_status: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.c)])),
        today: { orders: Number(revT[0].c), revenue: Number(revT[0].s) },
        week_revenue: Number(revW[0].s),
        month_revenue: Number(revM[0].s),
        series: series.map((r) => ({
          date: r.d instanceof Date ? r.d.toISOString().slice(0,10) : String(r.d).slice(0,10),
          orders: Number(r.orders), revenue: Number(r.revenue),
        })),
      };
    },
  };
} else {
  let Database;
  try { Database = require("better-sqlite3"); }
  catch (e) { console.error("[db] better-sqlite3 not installed and DB_HOST not set."); throw e; }
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "deli-aden.db");
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  sqliteDb = new Database(DB_PATH);
  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'new',
      customer_name TEXT NOT NULL, customer_phone TEXT NOT NULL, customer_email TEXT,
      order_type TEXT NOT NULL, delivery_address TEXT,
      preferred_time TEXT NOT NULL DEFAULT 'ASAP', payment_method TEXT NOT NULL,
      items_json TEXT NOT NULL,
      subtotal REAL NOT NULL, gst REAL NOT NULL, qst REAL NOT NULL, total REAL NOT NULL,
      special_notes TEXT, admin_notes TEXT, cancel_reason TEXT,
      dispatched_at TEXT, completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
    CREATE TABLE IF NOT EXISTS order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL,
      event TEXT NOT NULL, meta TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_event_order ON order_events(order_id);
    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, phone TEXT, email TEXT NOT NULL, message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT NOT NULL, subject TEXT NOT NULL, status TEXT NOT NULL, error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL);
    INSERT OR IGNORE INTO counters (name, value) VALUES ('order_number', 1000);
    CREATE TABLE IF NOT EXISTS settings (
      k TEXT PRIMARY KEY, v TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS menu_overrides (
      item_id TEXT PRIMARY KEY,
      available INTEGER NOT NULL DEFAULT 1,
      price_override REAL,
      description_override TEXT,
      image_override TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS drivers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, phone TEXT, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS driver_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL, driver_id INTEGER NOT NULL, notes TEXT,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      delivered_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_assign_order ON driver_assignments(order_id);
    CREATE INDEX IF NOT EXISTS idx_assign_driver ON driver_assignments(driver_id);
  `);
  // Best-effort migrations for existing dbs
  for (const col of [
    "ALTER TABLE orders ADD COLUMN admin_notes TEXT",
    "ALTER TABLE orders ADD COLUMN cancel_reason TEXT",
    "ALTER TABLE orders ADD COLUMN dispatched_at TEXT",
    "ALTER TABLE orders ADD COLUMN completed_at TEXT",
    "ALTER TABLE orders ADD COLUMN delivery_fee REAL NOT NULL DEFAULT 0",
    "ALTER TABLE orders ADD COLUMN delivery_unit TEXT",
    "ALTER TABLE orders ADD COLUMN delivery_door_code TEXT",
    "ALTER TABLE orders ADD COLUMN delivery_instructions TEXT",
    "ALTER TABLE orders ADD COLUMN estimated_ready_time TEXT",
    "ALTER TABLE orders ADD COLUMN estimated_delivery_time TEXT",
  ]) { try { sqliteDb.exec(col); } catch (_) {} }
  dbConnected = true;

  dbApi = {
    kind: "sqlite",
    _db: sqliteDb,
    async init() {},
    async ping() { try { sqliteDb.prepare("SELECT 1").get(); return true; } catch { return false; } },
    async close() { try { sqliteDb.close(); } catch (_) {} },
    async nextOrderNumber() {
      const tx = sqliteDb.transaction(() => {
        sqliteDb.prepare("UPDATE counters SET value = value + 1 WHERE name = 'order_number'").run();
        return sqliteDb.prepare("SELECT value FROM counters WHERE name = 'order_number'").get().value;
      });
      return `DA-${tx()}`;
    },
    async insertOrder(o) {
      const r = sqliteDb.prepare(
        `INSERT INTO orders (order_number, customer_name, customer_phone, customer_email, order_type,
          delivery_address, preferred_time, payment_method, items_json, subtotal, gst, qst, total, special_notes, delivery_fee,
          delivery_unit, delivery_door_code, delivery_instructions, estimated_ready_time, estimated_delivery_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(o.order_number, o.customer_name, o.customer_phone, o.customer_email, o.order_type,
        o.delivery_address, o.preferred_time, o.payment_method, o.items_json,
        o.subtotal, o.gst, o.qst, o.total, o.special_notes, o.delivery_fee || 0,
        o.delivery_unit || null, o.delivery_door_code || null, o.delivery_instructions || null,
        o.estimated_ready_time || null, o.estimated_delivery_time || null);
      sqliteDb.prepare("INSERT INTO order_events (order_id, event, meta) VALUES (?,?,?)")
        .run(r.lastInsertRowid, "created", "new");
      return r.lastInsertRowid;
    },
    async getOrderById(id) { return sqliteDb.prepare("SELECT * FROM orders WHERE id = ?").get(id) || null; },
    async getOrderByNumber(n) { return sqliteDb.prepare("SELECT * FROM orders WHERE order_number = ?").get(n) || null; },
    async listOrders({ status, search, from, to, limit = 500 }) {
      let sql = "SELECT * FROM orders"; const where = []; const params = [];
      if (status && status !== "all") { where.push("status = ?"); params.push(status); }
      if (search) { where.push("(order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)");
        const s = `%${search}%`; params.push(s, s, s); }
      if (from) { where.push("created_at >= ?"); params.push(from); }
      if (to) { where.push("created_at <= ?"); params.push(to); }
      if (where.length) sql += " WHERE " + where.join(" AND ");
      sql += " ORDER BY created_at DESC LIMIT ?"; params.push(parseInt(limit, 10));
      return sqliteDb.prepare(sql).all(...params);
    },
    async listEvents(orderId) {
      return sqliteDb.prepare("SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at ASC").all(orderId);
    },
    async updateOrder(id, status, { note, reason } = {}) {
      const sets = ["status = ?", "updated_at = datetime('now')"]; const params = [status];
      if (status === "dispatched") sets.push("dispatched_at = COALESCE(dispatched_at, datetime('now'))");
      if (status === "completed") sets.push("completed_at = COALESCE(completed_at, datetime('now'))");
      if (note) { sets.push("admin_notes = ?"); params.push(note); }
      if (reason) { sets.push("cancel_reason = ?"); params.push(reason); }
      params.push(id);
      sqliteDb.prepare(`UPDATE orders SET ${sets.join(", ")} WHERE id = ?`).run(...params);
      sqliteDb.prepare("INSERT INTO order_events (order_id, event, meta) VALUES (?,?,?)")
        .run(id, "status_change", JSON.stringify({ status, note: note || null, reason: reason || null }));
    },
    async insertContact(m) {
      sqliteDb.prepare("INSERT INTO contact_messages (name, phone, email, message) VALUES (?,?,?,?)")
        .run(m.name, m.phone || null, m.email, m.message);
    },
    async logEmail(recipient, subject, status, error) {
      try { sqliteDb.prepare("INSERT INTO email_logs (recipient, subject, status, error) VALUES (?,?,?,?)")
        .run(recipient, subject, status, error || null); }
      catch (e) { console.error("[email_log] insert failed", e.message); }
    },
    async getSettings() {
      const rows = sqliteDb.prepare("SELECT k, v FROM settings").all();
      const out = {};
      for (const r of rows) { try { out[r.k] = JSON.parse(r.v); } catch { out[r.k] = r.v; } }
      return out;
    },
    async setSettings(obj) {
      const stmt = sqliteDb.prepare(
        "INSERT INTO settings (k, v, updated_at) VALUES (?, ?, datetime('now')) " +
        "ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = datetime('now')"
      );
      for (const [k, v] of Object.entries(obj)) stmt.run(k, JSON.stringify(v));
    },
    async getMenuOverrides() {
      return sqliteDb.prepare("SELECT * FROM menu_overrides").all().map((r) => ({
        item_id: r.item_id,
        available: r.available === 1,
        price_override: r.price_override != null ? Number(r.price_override) : null,
        description_override: r.description_override,
        image_override: r.image_override,
      }));
    },
    async upsertMenuOverride(itemId, o) {
      sqliteDb.prepare(
        `INSERT INTO menu_overrides (item_id, available, price_override, description_override, image_override, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(item_id) DO UPDATE SET
           available = excluded.available,
           price_override = excluded.price_override,
           description_override = excluded.description_override,
           image_override = excluded.image_override,
           updated_at = datetime('now')`
      ).run(itemId, o.available ? 1 : 0,
        o.price_override == null ? null : Number(o.price_override),
        o.description_override || null,
        o.image_override || null);
    },
    async listDrivers({ activeOnly = false } = {}) {
      return activeOnly
        ? sqliteDb.prepare("SELECT * FROM drivers WHERE active=1 ORDER BY name").all()
        : sqliteDb.prepare("SELECT * FROM drivers ORDER BY name").all();
    },
    async createDriver({ name, phone, active = true }) {
      const r = sqliteDb.prepare("INSERT INTO drivers (name, phone, active) VALUES (?,?,?)").run(name, phone || null, active ? 1 : 0);
      return r.lastInsertRowid;
    },
    async updateDriver(id, { name, phone, active }) {
      const sets = []; const params = [];
      if (name != null) { sets.push("name=?"); params.push(name); }
      if (phone != null) { sets.push("phone=?"); params.push(phone); }
      if (active != null) { sets.push("active=?"); params.push(active ? 1 : 0); }
      if (!sets.length) return;
      params.push(id);
      sqliteDb.prepare(`UPDATE drivers SET ${sets.join(",")} WHERE id=?`).run(...params);
    },
    async deleteDriver(id) { sqliteDb.prepare("DELETE FROM drivers WHERE id=?").run(id); },
    async assignDriver(orderId, driverId, notes) {
      const r = sqliteDb.prepare("INSERT INTO driver_assignments (order_id, driver_id, notes) VALUES (?,?,?)").run(orderId, driverId, notes || null);
      return r.lastInsertRowid;
    },
    async markAssignmentDelivered(orderId) {
      sqliteDb.prepare("UPDATE driver_assignments SET delivered_at=datetime('now') WHERE order_id=? AND delivered_at IS NULL").run(orderId);
    },
    async listAssignments({ activeOnly = false } = {}) {
      const where = activeOnly ? "WHERE a.delivered_at IS NULL" : "";
      return sqliteDb.prepare(`SELECT a.*, d.name AS driver_name, d.phone AS driver_phone, o.order_number, o.customer_name, o.customer_phone, o.delivery_address, o.total
        FROM driver_assignments a JOIN drivers d ON d.id=a.driver_id JOIN orders o ON o.id=a.order_id ${where} ORDER BY a.assigned_at DESC LIMIT 200`).all();
    },
    async getOrderAssignment(orderId) {
      return sqliteDb.prepare("SELECT a.*, d.name AS driver_name, d.phone AS driver_phone FROM driver_assignments a JOIN drivers d ON d.id=a.driver_id WHERE a.order_id=? ORDER BY a.assigned_at DESC LIMIT 1").get(orderId) || null;
    },
    async metrics() {
      const byStatus = sqliteDb.prepare("SELECT status, COUNT(*) c FROM orders GROUP BY status").all();
      const today = new Date(); today.setHours(0,0,0,0);
      const weekStart = new Date(today); weekStart.setDate(weekStart.getDate() - 6);
      const monthStart = new Date(today); monthStart.setDate(monthStart.getDate() - 29);
      const fmtD = (d) => d.toISOString().slice(0,19).replace("T"," ");
      const revT = sqliteDb.prepare("SELECT COALESCE(SUM(total),0) s, COUNT(*) c FROM orders WHERE created_at >= ? AND status != 'cancelled'").get(fmtD(today));
      const revW = sqliteDb.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE created_at >= ? AND status != 'cancelled'").get(fmtD(weekStart));
      const revM = sqliteDb.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE created_at >= ? AND status != 'cancelled'").get(fmtD(monthStart));
      const series = sqliteDb.prepare(
        "SELECT substr(created_at,1,10) d, COUNT(*) orders, COALESCE(SUM(total),0) revenue FROM orders WHERE created_at >= ? AND status != 'cancelled' GROUP BY substr(created_at,1,10) ORDER BY d ASC"
      ).all(fmtD(new Date(Date.now() - 13*24*3600*1000)));
      return {
        by_status: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.c)])),
        today: { orders: Number(revT.c), revenue: Number(revT.s) },
        week_revenue: Number(revW.s),
        month_revenue: Number(revM.s),
        series: series.map((r) => ({ date: String(r.d).slice(0,10), orders: Number(r.orders), revenue: Number(r.revenue) })),
      };
    },
  };
}

function rowToOrder(row) {
  if (!row) return null;
  const iso = (v) => v instanceof Date ? v.toISOString() : (v || null);
  return {
    id: row.id, order_number: row.order_number, status: row.status,
    customer_name: row.customer_name, customer_phone: row.customer_phone, customer_email: row.customer_email,
    order_type: row.order_type, delivery_address: row.delivery_address,
    delivery_unit: row.delivery_unit || null,
    delivery_door_code: row.delivery_door_code || null,
    delivery_instructions: row.delivery_instructions || null,
    preferred_time: row.preferred_time, payment_method: row.payment_method,
    items: typeof row.items_json === "string" ? JSON.parse(row.items_json) : row.items_json,
    subtotal: Number(row.subtotal), gst: Number(row.gst), qst: Number(row.qst), total: Number(row.total),
    delivery_fee: row.delivery_fee != null ? Number(row.delivery_fee) : 0,
    special_notes: row.special_notes,
    admin_notes: row.admin_notes || null,
    cancel_reason: row.cancel_reason || null,
    dispatched_at: iso(row.dispatched_at),
    completed_at: iso(row.completed_at),
    estimated_ready_time: iso(row.estimated_ready_time),
    estimated_delivery_time: iso(row.estimated_delivery_time),
    created_at: iso(row.created_at),
    payment_status: row.payment_status || "unpaid",
    stripe_payment_intent_id: row.stripe_payment_intent_id || null,
    coupon_code: row.coupon_code || null,
    discount: row.discount != null ? Number(row.discount) : 0,
  };
}

// =====================================================================
// Settings cache — refreshed on every PATCH, fetched on boot
// =====================================================================
let SETTINGS = { ...DEFAULT_SETTINGS };
async function loadSettings() {
  try {
    const stored = await dbApi.getSettings();
    SETTINGS = { ...DEFAULT_SETTINGS, ...stored };
  } catch (e) { console.warn("[settings] load failed", e.message); }
}
function publicSettings() {
  // Exposed to unauthenticated frontend — safe subset
  return {
    is_open: !!SETTINGS.is_open,
    orders_paused: !!SETTINGS.orders_paused,
    pickup_enabled: !!SETTINGS.pickup_enabled,
    delivery_enabled: !!SETTINGS.delivery_enabled,
    est_pickup_min: Number(SETTINGS.est_pickup_min) || 0,
    est_delivery_min: Number(SETTINGS.est_delivery_min) || 0,
    min_order: Number(SETTINGS.min_order) || 0,
    delivery_fee: Number(SETTINGS.delivery_fee) || 0,
    free_delivery_threshold: Number(SETTINGS.free_delivery_threshold) || 0,
    gst_rate: Number(SETTINGS.gst_rate) || 0,
    qst_rate: Number(SETTINGS.qst_rate) || 0,
    restaurant_name: String(SETTINGS.restaurant_name || ""),
    restaurant_phone: String(SETTINGS.restaurant_phone || ""),
    restaurant_address: String(SETTINGS.restaurant_address || ""),
    restaurant_email: String(SETTINGS.restaurant_email || ""),
    google_maps_url: String(SETTINGS.google_maps_url || ""),
    opening_hours: String(SETTINGS.opening_hours || ""),
    order_pause_message: String(SETTINGS.order_pause_message || ""),
    closed_message: String(SETTINGS.closed_message || ""),
    hidden_categories: String(SETTINGS.hidden_categories || ""),
    delivery_zone_text: String(SETTINGS.delivery_zone_text || ""),
  };
}
function computeDeliveryFee(orderType, subtotal) {
  if (orderType !== "delivery") return 0;
  const free = Number(SETTINGS.free_delivery_threshold) || 0;
  if (free > 0 && subtotal >= free) return 0;
  return Number(SETTINGS.delivery_fee) || 0;
}

// =====================================================================
// Mail
// =====================================================================
let transporter = null;
let smtpVerified = false;
function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const secure = (process.env.SMTP_SECURE || "true") === "true";
  const user = process.env.SMTP_USER; const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) { console.warn("[mail] SMTP env vars missing — email sending disabled"); return null; }
  transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass }, pool: true });
  transporter.verify().then(() => { smtpVerified = true; console.log("[mail] SMTP verified"); })
    .catch((e) => { smtpVerified = false; console.warn("[mail] SMTP verify failed:", e.message); });
  return transporter;
}

function fmtMoney(n) { return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n); }

function buildOrderEmailHtml(order) {
  const itemRows = order.items.map((it) => {
    const opts = it.options && it.options.length
      ? `<div style="font-size:12px;color:#666">${escapeHtml(it.options.map((o) => `${o.groupLabel}: ${o.values.join(", ")}`).join(" • "))}</div>` : "";
    const note = it.notes ? `<div style="font-size:12px;color:#888"><em>Note: ${escapeHtml(it.notes)}</em></div>` : "";
    return `<tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>${escapeHtml(it.quantity)}× ${escapeHtml(it.name)}</strong>${opts}${note}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${fmtMoney(Number(it.unitPrice) * Number(it.quantity))}</td></tr>`;
  }).join("");
  const isDelivery = order.order_type === "delivery";
  const etaIso = isDelivery ? order.estimated_delivery_time : order.estimated_ready_time;
  const etaStr = etaIso ? new Date(etaIso).toLocaleString("fr-CA") : "";
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#222;max-width:600px;margin:0 auto">
    <h2 style="background:#9F1115;color:#FFF8E6;padding:16px;border-radius:8px;margin:0 0 16px">Nouvelle commande ${escapeHtml(order.order_number)}</h2>
    <p><strong>Date :</strong> ${escapeHtml(new Date(order.created_at).toLocaleString("fr-CA"))}</p>
    <p><strong>Client :</strong> ${escapeHtml(order.customer_name)}<br/><strong>Téléphone :</strong> ${escapeHtml(order.customer_phone)}<br/>
      ${order.customer_email ? `<strong>Email :</strong> ${escapeHtml(order.customer_email)}<br/>` : ""}
      <strong>Type :</strong> ${isDelivery ? "Livraison" : "Ramassage"}<br/>
      ${order.delivery_address ? `<strong>Adresse :</strong> ${escapeHtml(order.delivery_address)}<br/>` : ""}
      ${order.delivery_unit ? `<strong>App./Unité :</strong> ${escapeHtml(order.delivery_unit)}<br/>` : ""}
      ${order.delivery_door_code ? `<strong>Code de porte :</strong> ${escapeHtml(order.delivery_door_code)}<br/>` : ""}
      ${order.delivery_instructions ? `<strong>Instructions livraison :</strong> ${escapeHtml(order.delivery_instructions)}<br/>` : ""}
      <strong>Heure :</strong> ${escapeHtml(order.preferred_time)}<br/>
      ${etaStr ? `<strong>${isDelivery ? "Livraison estimée" : "Prêt vers"} :</strong> ${escapeHtml(etaStr)}<br/>` : ""}
      <strong>Paiement :</strong> ${escapeHtml(order.payment_method)}</p>
    ${order.special_notes ? `<p style="background:#FFF8E6;padding:10px;border-radius:6px"><strong>Instructions :</strong> ${escapeHtml(order.special_notes)}</p>` : ""}
    <table style="width:100%;border-collapse:collapse;margin-top:12px">${itemRows}</table>
    <table style="width:100%;margin-top:12px">
      <tr><td>Sous-total</td><td style="text-align:right">${fmtMoney(order.subtotal)}</td></tr>
      <tr><td>TPS</td><td style="text-align:right">${fmtMoney(order.gst)}</td></tr>
      <tr><td>TVQ</td><td style="text-align:right">${fmtMoney(order.qst)}</td></tr>
      ${isDelivery ? `<tr><td>Frais de livraison</td><td style="text-align:right">${fmtMoney(order.delivery_fee || 0)}</td></tr>` : ""}
      <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${fmtMoney(order.total)}</strong></td></tr>
    </table></body></html>`;
}

async function sendOrderEmail(order) {
  const t = getTransporter();
  const subject = `Nouvelle commande Deli Aden - ${order.order_number}`;
  if (!t) { await dbApi.logEmail(RESTAURANT_EMAIL, subject, "skipped", "SMTP not configured"); return; }
  try {
    await t.sendMail({
      from: `"Deli Aden" <${FROM_EMAIL}>`, to: RESTAURANT_EMAIL,
      replyTo: order.customer_email || undefined, subject, html: buildOrderEmailHtml(order),
    });
    await dbApi.logEmail(RESTAURANT_EMAIL, subject, "sent");
  } catch (err) {
    console.error("[mail] send order failed", err.message);
    await dbApi.logEmail(RESTAURANT_EMAIL, subject, "failed", err.message);
  }
}

async function sendContactEmail(msg) {
  const t = getTransporter();
  const subject = `Nouveau message de ${msg.name}`;
  if (!t) { await dbApi.logEmail(RESTAURANT_EMAIL, subject, "skipped", "SMTP not configured"); return; }
  try {
    await t.sendMail({
      from: `"Deli Aden Site" <${FROM_EMAIL}>`, to: RESTAURANT_EMAIL, replyTo: msg.email, subject,
      html: `<p><strong>De :</strong> ${escapeHtml(msg.name)} (${escapeHtml(msg.email)})${msg.phone ? ` — ${escapeHtml(msg.phone)}` : ""}</p><p>${escapeHtml(msg.message).replace(/\n/g, "<br/>")}</p>`,
    });
    await dbApi.logEmail(RESTAURANT_EMAIL, subject, "sent");
  } catch (err) {
    console.error("[mail] send contact failed", err.message);
    await dbApi.logEmail(RESTAURANT_EMAIL, subject, "failed", err.message);
  }
}

// =====================================================================
// App
// =====================================================================
const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
// helmet — CSP off so Vite-hashed assets always load; CORP off for compat
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(compression());

// Stripe webhook MUST be registered BEFORE express.json to receive the raw body
// for signature verification. The route lazily resolves dbApi/SETTINGS via closure.
app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookHandler());

app.use(express.json({ limit: "1mb" }));

// Structured request log
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const ms = Date.now() - start;
    if (req.path.startsWith("/api/")) {
      console.log(JSON.stringify({ t: new Date().toISOString(), method: req.method, path: req.path, status: res.statusCode, ms }));
    }
  });
  next();
});

function requireAdmin(req, res, next) {
  const pwd = req.header("x-admin-password") || (req.body && req.body.password);
  if (pwd !== EFFECTIVE_ADMIN_PASSWORD) return res.status(401).json({ error: "Mot de passe invalide" });
  next();
}

// ---- Real-time (SSE) ----
const realtime = createRealtime({
  requireAdmin,
  adminPassword: () => EFFECTIVE_ADMIN_PASSWORD,
});
realtime.mount(app);

// ---- SMS (Phase 5) ----
const { createSms } = require("./server-sms.cjs");
const sms = createSms(dbApi);

// ---- Drivers (Phase 6) ----
const { createDrivers } = require("./server-drivers.cjs");
const drivers = createDrivers({ dbApi, sms, realtime, emitOrderStatus: (id, ev) => emitOrderStatus(id, ev) });
drivers.mount(app, { requireAdmin });

// Async table init for phase 5/6 (non-blocking; log any error)
(async () => {
  try { await sms.init(); } catch (e) { console.error("[sms] init failed", e.message); }
  try { await drivers.init(); } catch (e) { console.error("[drivers] init failed", e.message); }
})();

// ---- SMS admin routes ----
app.get("/api/admin/sms/logs", requireAdmin, async (req, res) => {
  try {
    const logs = await sms.listLogs({ status: req.query.status, search: req.query.search, limit: req.query.limit });
    res.json({ logs: logs.map((r) => ({
      ...r,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    })), config: sms.config() });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});
app.post("/api/admin/sms/:id/retry", requireAdmin, async (req, res) => {
  try {
    const row = await sms.getLog(parseInt(req.params.id, 10));
    if (!row) return res.status(404).json({ error: "Introuvable" });
    const r = await sms.send({ orderId: row.order_id, to: row.phone, type: row.message_type, body: row.body, force: true });
    res.json({ ok: r.ok, result: r });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});
app.post("/api/admin/orders/:id/sms", requireAdmin, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const order = await dbApi.getOrderById(orderId);
    if (!order) return res.status(404).json({ error: "Commande introuvable" });
    const body = clean(req.body?.body || "", 1000);
    const type = clean(req.body?.type || "manual", 60);
    if (!body) return res.status(400).json({ error: "Message vide" });
    const r = await sms.send({ orderId, to: order.customer_phone, type, body, force: true });
    res.json({ ok: r.ok, result: r });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});


// helper: broadcast an order status change to both admin + public channel
async function emitOrderStatus(orderId, extraEvent) {
  try {
    const row = await dbApi.getOrderById(orderId);
    if (!row) return;
    const safe = {
      id: row.id,
      order_number: row.order_number,
      status: row.status,
      order_type: row.order_type,
      payment_status: row.payment_status || null,
      updated_at: (row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at) || null,
    };
    realtime.emitAdmin(extraEvent || "order_status_changed", safe);
    realtime.emitOrder(row.order_number, extraEvent || "order_status_changed", safe);
  } catch (e) { console.error("[realtime] emitOrderStatus", e.message); }
}

// ---- Health ----
app.get("/api/health", async (_req, res) => {
  const dbOk = await dbApi.ping();
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  res.json({
    ok: dbOk,
    message: "Deli Aden ordering system",
    env: NODE_ENV,
    uptime_s: Math.floor((Date.now() - STARTED_AT) / 1000),
    db: { kind: dbApi.kind, connected: dbOk },
    smtp: { configured: smtpConfigured, verified: smtpVerified },
    admin_password_set: Boolean(ADMIN_PASSWORD),
    realtime: realtime.stats(),
  });
});

// ---- Settings (public read) ----
app.get("/api/settings", (_req, res) => {
  res.json({ settings: publicSettings() });
});

// ---- Settings (admin read full + update) ----
app.get("/api/admin/settings", requireAdmin, (_req, res) => {
  res.json({ settings: { ...DEFAULT_SETTINGS, ...SETTINGS } });
});
app.patch("/api/admin/settings", requireAdmin, async (req, res) => {
  try {
    const incoming = req.body || {};
    const allowedKeys = Object.keys(DEFAULT_SETTINGS);
    const out = {};
    for (const k of allowedKeys) {
      if (!(k in incoming)) continue;
      const v = incoming[k];
      if (typeof DEFAULT_SETTINGS[k] === "boolean") out[k] = Boolean(v);
      else if (typeof DEFAULT_SETTINGS[k] === "number") out[k] = Math.max(0, Number(v) || 0);
      else out[k] = clean(String(v ?? ""), 500);
    }
    await dbApi.setSettings(out);
    SETTINGS = { ...SETTINGS, ...out };
    realtime.emitAdmin("settings_updated", { keys: Object.keys(out) });
    res.json({ ok: true, settings: { ...DEFAULT_SETTINGS, ...SETTINGS } });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});

// ---- Menu overrides ----
app.get("/api/menu/overrides", async (_req, res) => {
  try { res.json({ overrides: await dbApi.getMenuOverrides() }); }
  catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});
app.put("/api/admin/menu/:itemId", requireAdmin, async (req, res) => {
  try {
    const itemId = clean(req.params.itemId, 64);
    if (!itemId) return res.status(400).json({ error: "itemId requis" });
    const b = req.body || {};
    await dbApi.upsertMenuOverride(itemId, {
      available: b.available !== false,
      price_override: b.price_override === "" || b.price_override == null ? null : Number(b.price_override),
      description_override: clean(b.description_override, 800) || null,
      image_override: clean(b.image_override, 500) || null,
    });
    realtime.emitAdmin("menu_updated", { item_id: itemId });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});

// Validate + sanitize + recompute totals for an incoming order body.
// Throws Error with .statusCode on validation failure. Does NOT insert.
async function buildOrderPayload(b) {
  b = b || {};
  const c = b.customer || {};
  const name = clean(c.name, 160), phone = clean(c.phone, 40), email = clean(c.email, 200);

  if (!SETTINGS.is_open) { const e = new Error(SETTINGS.closed_message || "Restaurant fermé"); e.statusCode = 409; throw e; }
  if (SETTINGS.orders_paused) { const e = new Error("Les commandes sont temporairement suspendues. Merci de réessayer dans quelques minutes."); e.statusCode = 409; throw e; }
  if (!name || !phone) { const e = new Error("Nom et téléphone requis"); e.statusCode = 400; throw e; }
  if (!["pickup", "delivery"].includes(b.orderType)) { const e = new Error("Type invalide"); e.statusCode = 400; throw e; }
  if (b.orderType === "pickup" && !SETTINGS.pickup_enabled) { const e = new Error("Le ramassage n'est pas disponible actuellement."); e.statusCode = 409; throw e; }
  if (b.orderType === "delivery" && !SETTINGS.delivery_enabled) { const e = new Error("La livraison n'est pas disponible actuellement."); e.statusCode = 409; throw e; }
  if (b.orderType === "delivery" && !clean(b.deliveryAddress, 500)) { const e = new Error("Adresse requise"); e.statusCode = 400; throw e; }
  if (!Array.isArray(b.items) || b.items.length === 0) { const e = new Error("Panier vide"); e.statusCode = 400; throw e; }
  if (b.items.length > 100) { const e = new Error("Trop d'articles"); e.statusCode = 400; throw e; }

  const overrides = await dbApi.getMenuOverrides();
  const ovMap = new Map(overrides.map((o) => [o.item_id, o]));
  const items = b.items.map((it) => {
    const itemId = clean(it.itemId, 64);
    const ov = ovMap.get(itemId);
    if (ov && ov.available === false) { const e = new Error(`Article indisponible : ${clean(it.name, 80)}`); e.statusCode = 409; throw e; }
    return {
      itemId, name: clean(it.name, 160),
      unitPrice: Number(it.unitPrice) || 0,
      quantity: Math.max(1, Math.min(99, parseInt(it.quantity, 10) || 1)),
      options: Array.isArray(it.options) ? it.options.slice(0, 20).map((o) => ({
        groupLabel: clean(o.groupLabel, 80),
        values: Array.isArray(o.values) ? o.values.slice(0, 20).map((v) => clean(v, 80)) : [],
      })) : [],
      combo: Boolean(it.combo), notes: clean(it.notes, 300),
    };
  });

  const subtotal = +items.reduce((s, i) => s + i.unitPrice * i.quantity, 0).toFixed(2);
  if (subtotal < (Number(SETTINGS.min_order) || 0)) {
    const e = new Error(`Minimum de commande : ${fmtMoney(SETTINGS.min_order)}`); e.statusCode = 409; throw e;
  }
  const deliveryFee = computeDeliveryFee(b.orderType, subtotal);
  const gst = +(subtotal * (Number(SETTINGS.gst_rate) || 0)).toFixed(2);
  const qst = +(subtotal * (Number(SETTINGS.qst_rate) || 0)).toFixed(2);
  const total = +(subtotal + gst + qst + deliveryFee).toFixed(2);

  const fmtDT = (d) => d.toISOString().slice(0, 19).replace("T", " ");
  const etaMin = b.orderType === "delivery" ? (Number(SETTINGS.est_delivery_min) || 0) : (Number(SETTINGS.est_pickup_min) || 0);
  const readyMin = Number(SETTINGS.est_pickup_min) || 0;
  const now = Date.now();
  const estimated_ready_time = readyMin > 0 ? fmtDT(new Date(now + readyMin * 60000)) : null;
  const estimated_delivery_time = b.orderType === "delivery" && etaMin > 0 ? fmtDT(new Date(now + etaMin * 60000)) : null;

  return {
    customer_name: name, customer_phone: phone, customer_email: email || null,
    order_type: b.orderType,
    delivery_address: clean(b.deliveryAddress, 500) || null,
    delivery_unit: b.orderType === "delivery" ? (clean(b.deliveryUnit, 80) || null) : null,
    delivery_door_code: b.orderType === "delivery" ? (clean(b.deliveryDoorCode, 40) || null) : null,
    delivery_instructions: b.orderType === "delivery" ? (clean(b.deliveryInstructions, 500) || null) : null,
    preferred_time: clean(b.preferredTime, 60) || "ASAP",
    special_notes: clean(b.specialNotes, 500) || null,
    items, subtotal, gst, qst, total, delivery_fee: deliveryFee,
    estimated_ready_time, estimated_delivery_time,
  };
}

// ---- Create order ----
app.post("/api/orders", orderLimiter, async (req, res) => {
  try {
    const p = await buildOrderPayload(req.body);
    const orderNumber = await dbApi.nextOrderNumber();
    const id = await dbApi.insertOrder({
      order_number: orderNumber,
      customer_name: p.customer_name, customer_phone: p.customer_phone, customer_email: p.customer_email,
      order_type: p.order_type, delivery_address: p.delivery_address,
      delivery_unit: p.delivery_unit, delivery_door_code: p.delivery_door_code,
      delivery_instructions: p.delivery_instructions,
      preferred_time: p.preferred_time,
      payment_method: clean((req.body || {}).paymentMethod, 40) || "pay_at_restaurant",
      items_json: JSON.stringify(p.items),
      subtotal: p.subtotal, gst: p.gst, qst: p.qst, total: p.total, delivery_fee: p.delivery_fee,
      special_notes: p.special_notes,
      estimated_ready_time: p.estimated_ready_time, estimated_delivery_time: p.estimated_delivery_time,
    });
    // Phase 2 — if a valid customer token is present, attach the order to the account.
    try {
      const h = req.header("authorization") || "";
      const m = h.match(/^Bearer\s+(.+)$/i);
      if (m) {
        const payload = verifyCustomerToken(m[1]);
        if (payload && payload.sub && typeof dbApi.attachOrderToCustomer === "function") {
          await dbApi.attachOrderToCustomer(id, parseInt(payload.sub, 10));
        }
      }
    } catch (_) {}
    // Phase 5 — persist SMS opt-in (defaults to true; only update if explicitly false)
    try {
      const optIn = req.body?.smsOptIn;
      if (optIn === false || optIn === 0 || optIn === "false") {
        if (dbApi.kind === "mysql" && dbApi._pool) await dbApi._pool.query("UPDATE orders SET sms_opt_in=0 WHERE id=?", [id]);
        else if (dbApi.kind === "sqlite" && dbApi._db) dbApi._db.prepare("UPDATE orders SET sms_opt_in=0 WHERE id=?").run(id);
      }
    } catch (_) {}
    const order = rowToOrder(await dbApi.getOrderById(id));
    sendOrderEmail(order).catch((e) => console.error("[mail] async", e.message));
    // Phase 5 — SMS: customer confirmation + admin alert (non-blocking)
    try { sms.notifyCustomer(order, "order_created"); } catch (_) {}
    try { sms.notifyAdmin(order, "new_order"); } catch (_) {}
    // Real-time: broadcast to admins + public tracking channel
    const safe = {
      id: order.id, order_number: order.order_number, status: order.status,
      order_type: order.order_type, total: order.total,
      customer_name: order.customer_name, created_at: order.created_at,
    };
    realtime.emitAdmin("order_created", safe);
    realtime.emitOrder(order.order_number, "order_created", {
      order_number: order.order_number, status: order.status, order_type: order.order_type,
    });

    res.json({ orderNumber, id });
  } catch (err) {
    const code = err && err.statusCode ? err.statusCode : 500;
    if (code !== 500) return res.status(code).json({ error: err.message });
    console.error("[orders] create failed", err);
    res.status(500).json({ error: "Impossible de créer la commande" });
  }
});

app.get("/api/orders/:orderNumber", async (req, res) => {
  try {
    const row = await dbApi.getOrderByNumber(req.params.orderNumber);
    const order = rowToOrder(row);
    if (order) {
      delete order.admin_notes;
      // Attach driver info for delivery tracking (public-safe fields only)
      if (order.order_type === "delivery") {
        try {
          const a = await dbApi.getOrderAssignment(order.id);
          if (a) {
            order.driver_name = a.driver_name || null;
            order.driver_phone = a.driver_phone || null;
            order.assigned_at = a.assigned_at instanceof Date ? a.assigned_at.toISOString() : (a.assigned_at || null);
            order.delivered_at = a.delivered_at instanceof Date ? a.delivered_at.toISOString() : (a.delivered_at || null);
          }
        } catch (_) {}
      }
    }
    res.json({ order });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});

app.get("/api/orders", requireAdmin, async (req, res) => {
  try {
    const rows = await dbApi.listOrders({
      status: req.query.status, search: req.query.search,
      from: req.query.from, to: req.query.to,
    });
    res.json({ orders: rows.map(rowToOrder) });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});

app.get("/api/orders/:id/events", requireAdmin, async (req, res) => {
  try {
    const events = await dbApi.listEvents(parseInt(req.params.id, 10));
    res.json({ events: events.map((e) => ({
      id: e.id, event: e.event, meta: e.meta,
      created_at: e.created_at instanceof Date ? e.created_at.toISOString() : e.created_at,
    })) });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});

app.get("/api/orders.csv", requireAdmin, async (req, res) => {
  try {
    const rows = await dbApi.listOrders({
      status: req.query.status, search: req.query.search,
      from: req.query.from, to: req.query.to, limit: 5000,
    });
    const orders = rows.map(rowToOrder);
    const header = ["order_number","created_at","status","order_type","customer_name","customer_phone","customer_email","delivery_address","delivery_unit","delivery_door_code","delivery_instructions","preferred_time","payment_method","subtotal","gst","qst","delivery_fee","total","items","special_notes","admin_notes","cancel_reason","dispatched_at","completed_at","estimated_ready_time","estimated_delivery_time"];
    const lines = [header.join(",")];
    for (const o of orders) {
      const items = o.items.map((i) => `${i.quantity}x ${i.name}`).join(" | ");
      lines.push([o.order_number,o.created_at,o.status,o.order_type,o.customer_name,o.customer_phone,o.customer_email||"",o.delivery_address||"",o.delivery_unit||"",o.delivery_door_code||"",o.delivery_instructions||"",o.preferred_time,o.payment_method,o.subtotal,o.gst,o.qst,o.delivery_fee||0,o.total,items,o.special_notes||"",o.admin_notes||"",o.cancel_reason||"",o.dispatched_at||"",o.completed_at||"",o.estimated_ready_time||"",o.estimated_delivery_time||""].map(csvCell).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="orders-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(lines.join("\n"));
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});

app.patch("/api/orders/:id/status", requireAdmin, async (req, res) => {
  const allowed = ["new", "accepted", "preparing", "ready", "dispatched", "completed", "cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Statut invalide" });
  try {
    const orderId = parseInt(req.params.id, 10);
    await dbApi.updateOrder(orderId, req.body.status, {
      note: clean(req.body.note, 500) || undefined,
      reason: clean(req.body.reason, 500) || undefined,
    });
    // Phase 5 — customer SMS on status transitions
    try {
      const row = await dbApi.getOrderById(orderId);
      const map = { accepted: "order_accepted", preparing: "order_preparing", ready: "order_ready", dispatched: "order_dispatched", completed: "order_completed", cancelled: "order_cancelled" };
      const t = map[req.body.status];
      if (t && row) sms.notifyCustomer(rowToOrder(row), t);
    } catch (_) {}
    await emitOrderStatus(orderId);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});

// ---- Drivers ----
app.get("/api/admin/drivers", requireAdmin, async (req, res) => {
  try { res.json({ drivers: await dbApi.listDrivers({ activeOnly: req.query.active === "1" }) }); }
  catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});
app.post("/api/admin/drivers", requireAdmin, async (req, res) => {
  try {
    const name = clean(req.body?.name, 160);
    if (!name) return res.status(400).json({ error: "Nom requis" });
    const id = await dbApi.createDriver({ name, phone: clean(req.body?.phone, 40), active: req.body?.active !== false });
    res.json({ ok: true, id });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});
app.patch("/api/admin/drivers/:id", requireAdmin, async (req, res) => {
  try {
    await dbApi.updateDriver(parseInt(req.params.id, 10), {
      name: req.body?.name != null ? clean(req.body.name, 160) : undefined,
      phone: req.body?.phone != null ? clean(req.body.phone, 40) : undefined,
      active: req.body?.active != null ? Boolean(req.body.active) : undefined,
    });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});
app.delete("/api/admin/drivers/:id", requireAdmin, async (req, res) => {
  try { await dbApi.deleteDriver(parseInt(req.params.id, 10)); res.json({ ok: true }); }
  catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});

// ---- Assignments ----
app.get("/api/admin/assignments", requireAdmin, async (req, res) => {
  try { res.json({ assignments: (await dbApi.listAssignments({ activeOnly: req.query.active === "1" })).map((a) => ({
    ...a,
    assigned_at: a.assigned_at instanceof Date ? a.assigned_at.toISOString() : a.assigned_at,
    delivered_at: a.delivered_at instanceof Date ? a.delivered_at.toISOString() : a.delivered_at,
  })) }); }
  catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});
app.post("/api/admin/orders/:id/assign", requireAdmin, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const driverId = parseInt(req.body?.driver_id, 10);
    if (!orderId || !driverId) return res.status(400).json({ error: "order_id et driver_id requis" });
    await dbApi.assignDriver(orderId, driverId, clean(req.body?.notes, 500));
    await dbApi.updateOrder(orderId, "dispatched", { note: `Assigné au livreur #${driverId}` });
    // realtime: admin sees full driver info; public tracking sees only safe name/phone
    try {
      const row = await dbApi.getOrderById(orderId);
      const a = await dbApi.getOrderAssignment(orderId);
      const publicPayload = {
        order_number: row && row.order_number,
        driver_name: a && a.driver_name ? a.driver_name : null,
        driver_phone: a && a.driver_phone ? a.driver_phone : null,
      };
      realtime.emitAdmin("order_assigned", { order_id: orderId, driver_id: driverId, order_number: row && row.order_number });
      realtime.emitOrder(row && row.order_number, "driver_assigned", publicPayload);
    } catch (_) {}
    try { const r = await dbApi.getOrderById(orderId); if (r) sms.notifyCustomer(rowToOrder(r), "order_dispatched"); } catch (_) {}
    await emitOrderStatus(orderId);
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});
app.post("/api/admin/orders/:id/delivered", requireAdmin, async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    await dbApi.markAssignmentDelivered(orderId);
    await dbApi.updateOrder(orderId, "completed", { note: "Livraison confirmée" });
    try {
      const row = await dbApi.getOrderById(orderId);
      realtime.emitAdmin("order_delivered", { order_id: orderId, order_number: row && row.order_number });
      realtime.emitOrder(row && row.order_number, "order_delivered", { order_number: row && row.order_number });
    } catch (_) {}
    try { const r = await dbApi.getOrderById(orderId); if (r) sms.notifyCustomer(rowToOrder(r), "order_completed"); } catch (_) {}
    await emitOrderStatus(orderId, "order_status_changed");
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});

// ---- Metrics ----
app.get("/api/admin/metrics", requireAdmin, async (_req, res) => {
  try { res.json(await dbApi.metrics()); }
  catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});

// ---- Menu admin list + bulk category toggle ----
app.get("/api/admin/menu", requireAdmin, async (_req, res) => {
  try { res.json({ overrides: await dbApi.getMenuOverrides() }); }
  catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});
app.post("/api/admin/menu/bulk", requireAdmin, async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: "items requis" });
    const available = Boolean(req.body?.available);
    for (const id of items) {
      const itemId = clean(id, 64); if (!itemId) continue;
      const existing = (await dbApi.getMenuOverrides()).find((o) => o.item_id === itemId) || {};
      await dbApi.upsertMenuOverride(itemId, {
        available,
        price_override: existing.price_override ?? null,
        description_override: existing.description_override ?? null,
        image_override: existing.image_override ?? null,
      });
    }
    realtime.emitAdmin("menu_updated", { bulk: true, count: items.length });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});



app.post("/api/admin/verify", loginLimiter, (req, res) => {
  const pwd = req.body && req.body.password;
  res.json({ ok: pwd === EFFECTIVE_ADMIN_PASSWORD });
});

app.post("/api/contact", contactLimiter, async (req, res) => {
  try {
    const b = req.body || {};
    const name = clean(b.name, 160), email = clean(b.email, 200), message = clean(b.message, 2000);
    if (!name || !email || !message) return res.status(400).json({ error: "Champs requis manquants" });
    const phone = clean(b.phone, 40) || null;
    await dbApi.insertContact({ name, phone, email, message });
    sendContactEmail({ name, phone, email, message }).catch((e) => console.error("[mail] async", e.message));
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "Erreur" }); }
});

// ---------- Static frontend ----------
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, {
    maxAge: "1y", etag: true,
    setHeaders: (res, p) => { if (p.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache"); },
  }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    const indexHtml = path.join(DIST_DIR, "index.html");
    if (fs.existsSync(indexHtml)) { res.setHeader("Cache-Control", "no-cache"); return res.sendFile(indexHtml); }
    next();
  });
} else {
  console.warn(`[server] dist/ not found at ${DIST_DIR}. Run "npm run build" first.`);
}

app.use((err, _req, res, _next) => {
  console.error("[server] unhandled", err);
  res.status(500).json({ error: "Erreur serveur" });
});

// =====================================================================
// Bootstrap + graceful shutdown
// =====================================================================
let server;
(async () => {
  try { await dbApi.init(); } catch (e) { console.error("[db] init failed", e); process.exit(1); }
  await loadSettings();
  getTransporter(); // warm + verify SMTP
  // Phase 2 — customer accounts (must mount BEFORE the SPA fallback at /*).
  try {
    const { mountCustomers } = require("./server-customers.cjs");
    await mountCustomers(app, { kind: dbApi.kind, mysqlPool, sqliteDb, rateLimit, dbApi });
    console.log("[Deli Aden] Customer accounts module mounted");
  } catch (e) {
    console.error("[customers] mount failed", e);
  }
  // Phase 3 — Stripe payments + coupons (must mount BEFORE the SPA fallback at /*).
  try {
    await mountPayments(app, {
      kind: dbApi.kind, mysqlPool, sqliteDb, rateLimit, dbApi, requireAdmin,
      buildOrderPayload,
      getSettings: () => SETTINGS,
      logOrderEvent: (orderId, event, meta) => {
        try {
          if (dbApi.kind === "mysql") {
            mysqlPool.query("INSERT INTO order_events (order_id, event, meta) VALUES (?,?,?)", [orderId, event, meta || null]);
          } else {
            sqliteDb.prepare("INSERT INTO order_events (order_id, event, meta) VALUES (?,?,?)").run(orderId, event, meta || null);
          }
        } catch (e) { console.error("[event log]", e.message); }
      },
      attachCustomerByToken: async (token, orderId) => {
        const payload = verifyCustomerToken(token);
        if (payload && payload.sub && typeof dbApi.attachOrderToCustomer === "function") {
          await dbApi.attachOrderToCustomer(orderId, parseInt(payload.sub, 10));
        }
      },
      // Realtime hooks used by Stripe webhook + admin refund route
      emitAdmin: (event, data) => realtime.emitAdmin(event, data),
      emitOrderById: async (orderId, event, data) => {
        try {
          const row = await dbApi.getOrderById(orderId);
          if (!row) return;
          realtime.emitAdmin(event, { order_id: orderId, order_number: row.order_number, ...data });
          const safe = { order_number: row.order_number, status: row.status, payment_status: row.payment_status || null };
          const publicEvent = event === "refund_created" ? "payment_status_changed"
                           : event === "payment_failed" ? "payment_status_changed"
                           : event === "payment_succeeded" ? "payment_status_changed"
                           : event;
          realtime.emitOrder(row.order_number, publicEvent, { ...safe, kind: event });
          // Phase 5 — SMS on payment events
          try {
            const o = rowToOrder(row);
            if (event === "payment_succeeded") sms.notifyCustomer(o, "payment_succeeded");
            else if (event === "payment_failed") { sms.notifyCustomer(o, "payment_failed"); sms.notifyAdmin(o, "payment_failed"); }
          } catch (_) {}
        } catch (_) {}
      },

    });
  } catch (e) {
    console.error("[payments] mount failed", e);
  }
  server = app.listen(PORT, () => {
    const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    console.log(`[Deli Aden] Server running on port ${PORT} (${NODE_ENV})`);
    console.log(`[Deli Aden] Database: ${dbApi.kind.toUpperCase()}${dbApi.kind === "mysql" ? ` @ ${process.env.DB_HOST}/${process.env.DB_NAME}` : ""}`);
    console.log(`[Deli Aden] Dist:     ${DIST_DIR}${fs.existsSync(DIST_DIR) ? "" : " (MISSING — run `npm run build`)"}`);
    console.log(`[Deli Aden] SMTP:     ${smtpConfigured ? "configured" : "NOT configured (emails disabled, orders still saved)"}`);
    console.log(`[Deli Aden] Admin:    password ${ADMIN_PASSWORD ? "set via env" : "USING DEFAULT — change ADMIN_PASSWORD!"}`);
  });
})();

async function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down…`);
  const timeout = setTimeout(() => { console.error("[server] forced exit"); process.exit(1); }, 10000);
  try {
    if (server) await new Promise((r) => server.close(r));
    if (transporter) { try { transporter.close(); } catch (_) {} }
    try { realtime.shutdown(); } catch (_) {}
    await dbApi.close();
    clearTimeout(timeout);
    console.log("[server] clean shutdown complete");
    process.exit(0);
  } catch (e) { console.error("[server] shutdown error", e); process.exit(1); }
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));

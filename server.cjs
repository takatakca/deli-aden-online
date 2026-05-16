/* eslint-disable */
// MochaHost Node.js entry point.
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

const PORT = parseInt(process.env.PORT || "3000", 10);
const DIST_DIR = path.join(__dirname, "dist");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "deli-aden-admin";
const RESTAURANT_EMAIL = process.env.RESTAURANT_EMAIL || "orders@deliaden.ca";
const FROM_EMAIL = process.env.FROM_EMAIL || "notify@deliaden.ca";

const USE_MYSQL = Boolean(process.env.DB_HOST);

// =====================================================================
// Database abstraction — supports MySQL (prod) and SQLite (fallback)
// =====================================================================
let dbApi;

if (USE_MYSQL) {
  const mysql = require("mysql2/promise");
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    namedPlaceholders: false,
    charset: "utf8mb4",
  });

  async function init() {
    const conn = await pool.getConnection();
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
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_orders_order_number (order_number),
        INDEX idx_orders_status (status),
        INDEX idx_orders_created_at (created_at),
        INDEX idx_orders_customer_phone (customer_phone)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

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
        name VARCHAR(160) NOT NULL,
        phone VARCHAR(40),
        email VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_contact_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

      await conn.query(`CREATE TABLE IF NOT EXISTS email_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        recipient VARCHAR(200) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        status VARCHAR(20) NOT NULL,
        error TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email_status (status),
        INDEX idx_email_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

      await conn.query(`CREATE TABLE IF NOT EXISTS counters (
        name VARCHAR(40) PRIMARY KEY,
        value INT NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

      await conn.query(
        "INSERT IGNORE INTO counters (name, value) VALUES ('order_number', 1000)"
      );
    } finally {
      conn.release();
    }
  }

  dbApi = {
    kind: "mysql",
    init,
    async nextOrderNumber() {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          "UPDATE counters SET value = value + 1 WHERE name = 'order_number'"
        );
        const [rows] = await conn.query(
          "SELECT value FROM counters WHERE name = 'order_number'"
        );
        await conn.commit();
        return `DA-${rows[0].value}`;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },
    async insertOrder(o) {
      const [r] = await pool.query(
        `INSERT INTO orders (order_number, customer_name, customer_phone, customer_email, order_type,
          delivery_address, preferred_time, payment_method, items_json, subtotal, gst, qst, total, special_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          o.order_number, o.customer_name, o.customer_phone, o.customer_email,
          o.order_type, o.delivery_address, o.preferred_time, o.payment_method,
          o.items_json, o.subtotal, o.gst, o.qst, o.total, o.special_notes,
        ]
      );
      return r.insertId;
    },
    async getOrderById(id) {
      const [rows] = await pool.query("SELECT * FROM orders WHERE id = ?", [id]);
      return rows[0] || null;
    },
    async getOrderByNumber(num) {
      const [rows] = await pool.query("SELECT * FROM orders WHERE order_number = ?", [num]);
      return rows[0] || null;
    },
    async listOrders({ status, search, from, to, limit = 500 }) {
      let sql = "SELECT * FROM orders";
      const where = []; const params = [];
      if (status && status !== "all") { where.push("status = ?"); params.push(status); }
      if (search) {
        where.push("(order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)");
        const s = `%${search}%`; params.push(s, s, s);
      }
      if (from) { where.push("created_at >= ?"); params.push(from); }
      if (to) { where.push("created_at <= ?"); params.push(to); }
      if (where.length) sql += " WHERE " + where.join(" AND ");
      sql += " ORDER BY created_at DESC LIMIT ?";
      params.push(parseInt(limit, 10));
      const [rows] = await pool.query(sql, params);
      return rows;
    },
    async updateStatus(id, status) {
      await pool.query("UPDATE orders SET status = ? WHERE id = ?", [status, id]);
      await pool.query(
        "INSERT INTO order_events (order_id, event, meta) VALUES (?, ?, ?)",
        [id, "status_change", status]
      );
    },
    async insertContact(m) {
      await pool.query(
        "INSERT INTO contact_messages (name, phone, email, message) VALUES (?, ?, ?, ?)",
        [m.name, m.phone, m.email, m.message]
      );
    },
    async logEmail(recipient, subject, status, error) {
      try {
        await pool.query(
          "INSERT INTO email_logs (recipient, subject, status, error) VALUES (?, ?, ?, ?)",
          [recipient, subject, status, error || null]
        );
      } catch (e) { console.error("[email_log] insert failed", e.message); }
    },
  };
} else {
  // SQLite fallback
  let Database;
  try { Database = require("better-sqlite3"); }
  catch (e) {
    console.error("[db] better-sqlite3 not installed and DB_HOST not set. Set DB_HOST or install better-sqlite3.");
    throw e;
  }
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "deli-aden.db");
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'new',
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT,
      order_type TEXT NOT NULL,
      delivery_address TEXT,
      preferred_time TEXT NOT NULL DEFAULT 'ASAP',
      payment_method TEXT NOT NULL,
      items_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      gst REAL NOT NULL,
      qst REAL NOT NULL,
      total REAL NOT NULL,
      special_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_customer_phone ON orders(customer_phone);
    CREATE TABLE IF NOT EXISTS order_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      event TEXT NOT NULL,
      meta TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_event_order ON order_events(order_id);
    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS email_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS counters (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO counters (name, value) VALUES ('order_number', 1000);
  `);

  dbApi = {
    kind: "sqlite",
    async init() {},
    async nextOrderNumber() {
      const tx = db.transaction(() => {
        db.prepare("UPDATE counters SET value = value + 1 WHERE name = 'order_number'").run();
        return db.prepare("SELECT value FROM counters WHERE name = 'order_number'").get().value;
      });
      return `DA-${tx()}`;
    },
    async insertOrder(o) {
      const r = db.prepare(
        `INSERT INTO orders (order_number, customer_name, customer_phone, customer_email, order_type,
          delivery_address, preferred_time, payment_method, items_json, subtotal, gst, qst, total, special_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        o.order_number, o.customer_name, o.customer_phone, o.customer_email,
        o.order_type, o.delivery_address, o.preferred_time, o.payment_method,
        o.items_json, o.subtotal, o.gst, o.qst, o.total, o.special_notes
      );
      return r.lastInsertRowid;
    },
    async getOrderById(id) {
      return db.prepare("SELECT * FROM orders WHERE id = ?").get(id) || null;
    },
    async getOrderByNumber(num) {
      return db.prepare("SELECT * FROM orders WHERE order_number = ?").get(num) || null;
    },
    async listOrders({ status, search, from, to, limit = 500 }) {
      let sql = "SELECT * FROM orders";
      const where = []; const params = [];
      if (status && status !== "all") { where.push("status = ?"); params.push(status); }
      if (search) {
        where.push("(order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)");
        const s = `%${search}%`; params.push(s, s, s);
      }
      if (from) { where.push("created_at >= ?"); params.push(from); }
      if (to) { where.push("created_at <= ?"); params.push(to); }
      if (where.length) sql += " WHERE " + where.join(" AND ");
      sql += " ORDER BY created_at DESC LIMIT ?";
      params.push(parseInt(limit, 10));
      return db.prepare(sql).all(...params);
    },
    async updateStatus(id, status) {
      db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
      db.prepare("INSERT INTO order_events (order_id, event, meta) VALUES (?, ?, ?)")
        .run(id, "status_change", status);
    },
    async insertContact(m) {
      db.prepare("INSERT INTO contact_messages (name, phone, email, message) VALUES (?, ?, ?, ?)")
        .run(m.name, m.phone || null, m.email, m.message);
    },
    async logEmail(recipient, subject, status, error) {
      try {
        db.prepare("INSERT INTO email_logs (recipient, subject, status, error) VALUES (?, ?, ?, ?)")
          .run(recipient, subject, status, error || null);
      } catch (e) { console.error("[email_log] insert failed", e.message); }
    },
  };
}

function rowToOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    order_number: row.order_number,
    status: row.status,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    customer_email: row.customer_email,
    order_type: row.order_type,
    delivery_address: row.delivery_address,
    preferred_time: row.preferred_time,
    payment_method: row.payment_method,
    items: typeof row.items_json === "string" ? JSON.parse(row.items_json) : row.items_json,
    subtotal: Number(row.subtotal),
    gst: Number(row.gst),
    qst: Number(row.qst),
    total: Number(row.total),
    special_notes: row.special_notes,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

// ---------- Mail ----------
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "465", 10);
  const secure = (process.env.SMTP_SECURE || "true") === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.warn("[mail] SMTP env vars missing — email sending disabled");
    return null;
  }
  transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass }, pool: true });
  return transporter;
}

function fmtMoney(n) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);
}

function buildOrderEmailHtml(order) {
  const itemRows = order.items.map((it) => {
    const opts = it.options && it.options.length
      ? `<div style="font-size:12px;color:#666">${it.options.map((o) => `${o.groupLabel}: ${o.values.join(", ")}`).join(" • ")}</div>` : "";
    const note = it.notes ? `<div style="font-size:12px;color:#888"><em>Note: ${it.notes}</em></div>` : "";
    return `<tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>${it.quantity}× ${it.name}</strong>${opts}${note}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${fmtMoney(it.unitPrice * it.quantity)}</td></tr>`;
  }).join("");
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#222;max-width:600px;margin:0 auto">
    <h2 style="background:#9F1115;color:#FFF8E6;padding:16px;border-radius:8px;margin:0 0 16px">Nouvelle commande ${order.order_number}</h2>
    <p><strong>Date :</strong> ${new Date(order.created_at).toLocaleString("fr-CA")}</p>
    <p><strong>Client :</strong> ${order.customer_name}<br/><strong>Téléphone :</strong> ${order.customer_phone}<br/>
      ${order.customer_email ? `<strong>Email :</strong> ${order.customer_email}<br/>` : ""}
      <strong>Type :</strong> ${order.order_type === "pickup" ? "Ramassage" : "Livraison"}<br/>
      ${order.delivery_address ? `<strong>Adresse :</strong> ${order.delivery_address}<br/>` : ""}
      <strong>Heure :</strong> ${order.preferred_time}<br/><strong>Paiement :</strong> ${order.payment_method}</p>
    ${order.special_notes ? `<p style="background:#FFF8E6;padding:10px;border-radius:6px"><strong>Instructions :</strong> ${order.special_notes}</p>` : ""}
    <table style="width:100%;border-collapse:collapse;margin-top:12px">${itemRows}</table>
    <table style="width:100%;margin-top:12px">
      <tr><td>Sous-total</td><td style="text-align:right">${fmtMoney(order.subtotal)}</td></tr>
      <tr><td>TPS</td><td style="text-align:right">${fmtMoney(order.gst)}</td></tr>
      <tr><td>TVQ</td><td style="text-align:right">${fmtMoney(order.qst)}</td></tr>
      <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${fmtMoney(order.total)}</strong></td></tr>
    </table></body></html>`;
}

async function sendOrderEmail(order) {
  const t = getTransporter();
  const subject = `Nouvelle commande Deli Aden - ${order.order_number}`;
  if (!t) { dbApi.logEmail(RESTAURANT_EMAIL, subject, "skipped", "SMTP not configured"); return; }
  try {
    await t.sendMail({
      from: `"Deli Aden" <${FROM_EMAIL}>`, to: RESTAURANT_EMAIL,
      replyTo: order.customer_email || undefined, subject, html: buildOrderEmailHtml(order),
    });
    dbApi.logEmail(RESTAURANT_EMAIL, subject, "sent");
  } catch (err) {
    console.error("[mail] send order failed", err.message);
    dbApi.logEmail(RESTAURANT_EMAIL, subject, "failed", err.message);
  }
}

async function sendContactEmail(msg) {
  const t = getTransporter();
  const subject = `Nouveau message de ${msg.name}`;
  if (!t) { dbApi.logEmail(RESTAURANT_EMAIL, subject, "skipped", "SMTP not configured"); return; }
  try {
    await t.sendMail({
      from: `"Deli Aden Site" <${FROM_EMAIL}>`, to: RESTAURANT_EMAIL, replyTo: msg.email, subject,
      html: `<p><strong>De :</strong> ${msg.name} (${msg.email})${msg.phone ? ` — ${msg.phone}` : ""}</p><p>${String(msg.message).replace(/\n/g, "<br/>")}</p>`,
    });
    dbApi.logEmail(RESTAURANT_EMAIL, subject, "sent");
  } catch (err) {
    console.error("[mail] send contact failed", err.message);
    dbApi.logEmail(RESTAURANT_EMAIL, subject, "failed", err.message);
  }
}

// =====================================================================
// App
// =====================================================================
const app = express();
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
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
  if (pwd !== ADMIN_PASSWORD) return res.status(401).json({ error: "Mot de passe invalide" });
  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, message: "Deli Aden ordering system running", db: dbApi.kind });
});

app.post("/api/orders", async (req, res) => {
  try {
    const b = req.body || {};
    const c = b.customer || {};
    if (!c.name || !c.phone) return res.status(400).json({ error: "Nom et téléphone requis" });
    if (!["pickup", "delivery"].includes(b.orderType)) return res.status(400).json({ error: "Type invalide" });
    if (b.orderType === "delivery" && !b.deliveryAddress) return res.status(400).json({ error: "Adresse requise" });
    if (!Array.isArray(b.items) || b.items.length === 0) return res.status(400).json({ error: "Panier vide" });

    const orderNumber = await dbApi.nextOrderNumber();
    const id = await dbApi.insertOrder({
      order_number: orderNumber,
      customer_name: String(c.name),
      customer_phone: String(c.phone),
      customer_email: c.email || null,
      order_type: b.orderType,
      delivery_address: b.deliveryAddress || null,
      preferred_time: b.preferredTime || "ASAP",
      payment_method: b.paymentMethod || "pay_at_restaurant",
      items_json: JSON.stringify(b.items),
      subtotal: Number(b.subtotal || 0),
      gst: Number(b.gst || 0),
      qst: Number(b.qst || 0),
      total: Number(b.total || 0),
      special_notes: b.specialNotes || null,
    });
    const order = rowToOrder(await dbApi.getOrderById(id));
    // fire and forget — never fail order on email failure
    sendOrderEmail(order).catch((e) => console.error("[mail] async error", e.message));
    res.json({ orderNumber, id });
  } catch (err) {
    console.error("[orders] create failed", err);
    res.status(500).json({ error: "Impossible de créer la commande" });
  }
});

app.get("/api/orders/:orderNumber", async (req, res) => {
  try {
    const row = await dbApi.getOrderByNumber(req.params.orderNumber);
    res.json({ order: rowToOrder(row) });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Erreur" });
  }
});

app.get("/api/orders", requireAdmin, async (req, res) => {
  try {
    const rows = await dbApi.listOrders({
      status: req.query.status, search: req.query.search,
      from: req.query.from, to: req.query.to,
    });
    res.json({ orders: rows.map(rowToOrder) });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Erreur" });
  }
});

app.get("/api/orders.csv", requireAdmin, async (req, res) => {
  try {
    const rows = await dbApi.listOrders({
      status: req.query.status, search: req.query.search,
      from: req.query.from, to: req.query.to, limit: 5000,
    });
    const orders = rows.map(rowToOrder);
    const header = ["order_number","created_at","status","order_type","customer_name","customer_phone","customer_email","delivery_address","preferred_time","payment_method","subtotal","gst","qst","total","items","special_notes"];
    const esc = (v) => { if (v == null) return ""; const s = String(v).replace(/"/g, '""'); return /[",\n]/.test(s) ? `"${s}"` : s; };
    const lines = [header.join(",")];
    for (const o of orders) {
      const items = o.items.map((i) => `${i.quantity}x ${i.name}`).join(" | ");
      lines.push([o.order_number,o.created_at,o.status,o.order_type,o.customer_name,o.customer_phone,o.customer_email||"",o.delivery_address||"",o.preferred_time,o.payment_method,o.subtotal,o.gst,o.qst,o.total,items,o.special_notes||""].map(esc).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="orders-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send(lines.join("\n"));
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Erreur" });
  }
});

app.patch("/api/orders/:id/status", requireAdmin, async (req, res) => {
  const allowed = ["new", "accepted", "preparing", "ready", "dispatched", "completed", "cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Statut invalide" });
  try {
    await dbApi.updateStatus(req.params.id, req.body.status);
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Erreur" });
  }
});

app.post("/api/admin/verify", (req, res) => {
  res.json({ ok: (req.body && req.body.password) === ADMIN_PASSWORD });
});

app.post("/api/contact", async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.email || !b.message) return res.status(400).json({ error: "Champs requis manquants" });
    await dbApi.insertContact({ name: String(b.name), phone: b.phone || null, email: String(b.email), message: String(b.message) });
    sendContactEmail({ name: b.name, phone: b.phone, email: b.email, message: b.message }).catch((e) => console.error("[mail] async", e.message));
    res.json({ ok: true });
  } catch (err) {
    console.error(err); res.status(500).json({ error: "Erreur" });
  }
});

// ---------- Static frontend (long-cache hashed assets) ----------
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, {
    maxAge: "1y",
    etag: true,
    setHeaders: (res, p) => {
      if (p.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache");
    },
  }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    const indexHtml = path.join(DIST_DIR, "index.html");
    if (fs.existsSync(indexHtml)) {
      res.setHeader("Cache-Control", "no-cache");
      return res.sendFile(indexHtml);
    }
    next();
  });
} else {
  console.warn(`[server] dist/ not found at ${DIST_DIR}. Run "npm run build" first.`);
}

// Centralized error handler
app.use((err, _req, res, _next) => {
  console.error("[server] unhandled", err);
  res.status(500).json({ error: "Erreur serveur" });
});

(async () => {
  try { await dbApi.init(); } catch (e) {
    console.error("[db] init failed", e); process.exit(1);
  }
  app.listen(PORT, () => {
    const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    console.log(`[Deli Aden] Server running on port ${PORT}`);
    console.log(`[Deli Aden] Database: ${dbApi.kind.toUpperCase()}${dbApi.kind === "mysql" ? ` @ ${process.env.DB_HOST}/${process.env.DB_NAME}` : ""}`);
    console.log(`[Deli Aden] Dist:     ${DIST_DIR}${fs.existsSync(DIST_DIR) ? "" : " (MISSING — run `npm run build`)"}`);
    console.log(`[Deli Aden] SMTP:     ${smtpConfigured ? "configured" : "NOT configured (emails disabled, orders still saved)"}`);
    console.log(`[Deli Aden] Admin:    password ${process.env.ADMIN_PASSWORD ? "set via env" : "USING DEFAULT — change ADMIN_PASSWORD!"}`);
  });
})();

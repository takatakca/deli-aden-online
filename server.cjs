/* eslint-disable */
// MochaHost Node.js entry point.
// Run with: node server.cjs
// Requires: npm install && npm run build (produces ./dist)

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const Database = require("better-sqlite3");
const nodemailer = require("nodemailer");

const PORT = parseInt(process.env.PORT || "3000", 10);
const DIST_DIR = path.join(__dirname, "dist");
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "deli-aden.db");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "deli-aden-admin";

const RESTAURANT_EMAIL = process.env.RESTAURANT_EMAIL || "orders@deliaden.ca";
const FROM_EMAIL = process.env.FROM_EMAIL || "notify@deliaden.ca";

// ---------- Database ----------
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
  CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS counters (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  );
  INSERT OR IGNORE INTO counters (name, value) VALUES ('order_number', 1000);
`);

function nextOrderNumber() {
  const tx = db.transaction(() => {
    db.prepare("UPDATE counters SET value = value + 1 WHERE name = 'order_number'").run();
    return db.prepare("SELECT value FROM counters WHERE name = 'order_number'").get().value;
  });
  return `DA-${tx()}`;
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
    items: JSON.parse(row.items_json),
    subtotal: row.subtotal,
    gst: row.gst,
    qst: row.qst,
    total: row.total,
    special_notes: row.special_notes,
    created_at: row.created_at,
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
  transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  return transporter;
}

function fmtMoney(n) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);
}

function buildOrderEmailHtml(order) {
  const itemRows = order.items
    .map((it) => {
      const opts =
        it.options && it.options.length
          ? `<div style="font-size:12px;color:#666">${it.options
              .map((o) => `${o.groupLabel}: ${o.values.join(", ")}`)
              .join(" • ")}</div>`
          : "";
      const note = it.notes ? `<div style="font-size:12px;color:#888"><em>Note: ${it.notes}</em></div>` : "";
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee">
          <strong>${it.quantity}× ${it.name}</strong>${opts}${note}
        </td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${fmtMoney(it.unitPrice * it.quantity)}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#222;max-width:600px;margin:0 auto">
    <h2 style="background:#9F1115;color:#FFF8E6;padding:16px;border-radius:8px;margin:0 0 16px">
      Nouvelle commande ${order.order_number}
    </h2>
    <p><strong>Date :</strong> ${new Date(order.created_at).toLocaleString("fr-CA")}</p>
    <p>
      <strong>Client :</strong> ${order.customer_name}<br/>
      <strong>Téléphone :</strong> ${order.customer_phone}<br/>
      ${order.customer_email ? `<strong>Email :</strong> ${order.customer_email}<br/>` : ""}
      <strong>Type :</strong> ${order.order_type === "pickup" ? "Ramassage" : "Livraison"}<br/>
      ${order.delivery_address ? `<strong>Adresse :</strong> ${order.delivery_address}<br/>` : ""}
      <strong>Heure préférée :</strong> ${order.preferred_time}<br/>
      <strong>Paiement :</strong> ${order.payment_method}
    </p>
    ${order.special_notes ? `<p style="background:#FFF8E6;padding:10px;border-radius:6px"><strong>Instructions :</strong> ${order.special_notes}</p>` : ""}
    <table style="width:100%;border-collapse:collapse;margin-top:12px">${itemRows}</table>
    <table style="width:100%;margin-top:12px">
      <tr><td>Sous-total</td><td style="text-align:right">${fmtMoney(order.subtotal)}</td></tr>
      <tr><td>TPS (5%)</td><td style="text-align:right">${fmtMoney(order.gst)}</td></tr>
      <tr><td>TVQ (9.975%)</td><td style="text-align:right">${fmtMoney(order.qst)}</td></tr>
      <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${fmtMoney(order.total)}</strong></td></tr>
    </table>
  </body></html>`;
}

async function sendOrderEmail(order) {
  const t = getTransporter();
  if (!t) return;
  try {
    await t.sendMail({
      from: `"Deli Aden" <${FROM_EMAIL}>`,
      to: RESTAURANT_EMAIL,
      replyTo: order.customer_email || undefined,
      subject: `Nouvelle commande Deli Aden - ${order.order_number}`,
      html: buildOrderEmailHtml(order),
    });
  } catch (err) {
    console.error("[mail] send order failed", err);
  }
}

async function sendContactEmail(msg) {
  const t = getTransporter();
  if (!t) return;
  try {
    await t.sendMail({
      from: `"Deli Aden Site" <${FROM_EMAIL}>`,
      to: RESTAURANT_EMAIL,
      replyTo: msg.email,
      subject: `Nouveau message de ${msg.name}`,
      html: `<p><strong>De :</strong> ${msg.name} (${msg.email})${msg.phone ? ` — ${msg.phone}` : ""}</p>
             <p>${msg.message.replace(/\n/g, "<br/>")}</p>`,
    });
  } catch (err) {
    console.error("[mail] send contact failed", err);
  }
}

// ---------- App ----------
const app = express();
app.use(express.json({ limit: "1mb" }));

function requireAdmin(req, res, next) {
  const pwd = req.header("x-admin-password") || (req.body && req.body.password);
  if (pwd !== ADMIN_PASSWORD) return res.status(401).json({ error: "Mot de passe invalide" });
  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, message: "Deli Aden ordering system running" });
});

app.post("/api/orders", async (req, res) => {
  try {
    const b = req.body || {};
    const c = b.customer || {};
    if (!c.name || !c.phone) return res.status(400).json({ error: "Nom et téléphone requis" });
    if (!["pickup", "delivery"].includes(b.orderType)) return res.status(400).json({ error: "Type invalide" });
    if (b.orderType === "delivery" && !b.deliveryAddress) return res.status(400).json({ error: "Adresse requise" });
    if (!Array.isArray(b.items) || b.items.length === 0) return res.status(400).json({ error: "Panier vide" });

    const orderNumber = nextOrderNumber();
    const result = db
      .prepare(
        `INSERT INTO orders (order_number, customer_name, customer_phone, customer_email, order_type,
          delivery_address, preferred_time, payment_method, items_json, subtotal, gst, qst, total, special_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        orderNumber,
        String(c.name),
        String(c.phone),
        c.email || null,
        b.orderType,
        b.deliveryAddress || null,
        b.preferredTime || "ASAP",
        b.paymentMethod || "pay_at_restaurant",
        JSON.stringify(b.items),
        Number(b.subtotal || 0),
        Number(b.gst || 0),
        Number(b.qst || 0),
        Number(b.total || 0),
        b.specialNotes || null
      );

    const row = db.prepare("SELECT * FROM orders WHERE id = ?").get(result.lastInsertRowid);
    const order = rowToOrder(row);
    sendOrderEmail(order); // fire and forget
    res.json({ orderNumber, id: result.lastInsertRowid });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Impossible de créer la commande" });
  }
});

app.get("/api/orders/:orderNumber", (req, res) => {
  const row = db.prepare("SELECT * FROM orders WHERE order_number = ?").get(req.params.orderNumber);
  res.json({ order: rowToOrder(row) });
});

app.get("/api/orders", requireAdmin, (req, res) => {
  const status = req.query.status;
  const search = req.query.search;
  let sql = "SELECT * FROM orders";
  const params = [];
  const where = [];
  if (status && status !== "all") {
    where.push("status = ?");
    params.push(status);
  }
  if (search) {
    where.push("(order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)");
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY created_at DESC LIMIT 500";
  const rows = db.prepare(sql).all(...params);
  res.json({ orders: rows.map(rowToOrder) });
});

app.patch("/api/orders/:id/status", requireAdmin, (req, res) => {
  const allowed = ["new", "accepted", "preparing", "ready", "completed", "cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Statut invalide" });
  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(req.body.status, req.params.id);
  res.json({ ok: true });
});

app.post("/api/admin/verify", (req, res) => {
  res.json({ ok: (req.body && req.body.password) === ADMIN_PASSWORD });
});

app.post("/api/contact", async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.email || !b.message) return res.status(400).json({ error: "Champs requis manquants" });
    db.prepare("INSERT INTO contact_messages (name, phone, email, message) VALUES (?, ?, ?, ?)")
      .run(String(b.name), b.phone || null, String(b.email), String(b.message));
    sendContactEmail({ name: b.name, phone: b.phone, email: b.email, message: b.message });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur" });
  }
});

// ---------- Static frontend ----------
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    const indexHtml = path.join(DIST_DIR, "index.html");
    if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
    next();
  });
} else {
  console.warn(`[server] dist/ not found at ${DIST_DIR}. Run "npm run build" first.`);
}

app.listen(PORT, () => {
  const smtpConfigured = Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );
  console.log(`[Deli Aden] Server running on port ${PORT}`);
  console.log(`[Deli Aden] Database: ${DB_PATH}`);
  console.log(`[Deli Aden] Dist:     ${DIST_DIR}${fs.existsSync(DIST_DIR) ? "" : " (MISSING — run `npm run build`)"}`);
  console.log(`[Deli Aden] SMTP:     ${smtpConfigured ? "configured" : "NOT configured (emails disabled)"}`);
  console.log(`[Deli Aden] Admin:    password ${process.env.ADMIN_PASSWORD ? "set via env" : "USING DEFAULT — change ADMIN_PASSWORD!"}`);
});

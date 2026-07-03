"use strict";
// Phase 5 — Twilio SMS notifications. Non-blocking, opt-in aware, logged.
// Works with MySQL and SQLite via the same dbApi shape used by server.cjs.

const SID = process.env.TWILIO_ACCOUNT_SID || "";
const TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const FROM = process.env.TWILIO_PHONE_NUMBER || "";
const ADMIN_PHONE = process.env.SMS_RESTAURANT_ADMIN_PHONE || "";
const ENABLED = String(process.env.SMS_ENABLED || "").toLowerCase() === "true";

let twilioClient = null;
function client() {
  if (!ENABLED || !SID || !TOKEN || !FROM) return null;
  if (twilioClient) return twilioClient;
  try {
    const twilio = require("twilio");
    twilioClient = twilio(SID, TOKEN);
    return twilioClient;
  } catch (e) {
    console.warn("[sms] twilio package unavailable:", e.message);
    return null;
  }
}

// Sanitize + validate CA/US phone → E.164 (+1XXXXXXXXXX)
function normalizePhone(input) {
  if (!input) return null;
  const digits = String(input).replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;
  if (digits.length >= 11 && digits.length <= 15) return "+" + digits;
  return null;
}

function config() {
  return {
    enabled: ENABLED,
    configured: Boolean(SID && TOKEN && FROM),
    from: FROM || null,
    admin_phone: ADMIN_PHONE || null,
  };
}

function createSms(dbApi) {
  async function init() {
    if (dbApi.kind === "mysql") {
      const mysql = require("./server.cjs"); // no-op guard, just to keep intent clear
      void mysql;
      const pool = dbApi._pool || null;
      if (pool && pool.query) {
        await pool.query(`CREATE TABLE IF NOT EXISTS sms_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_id INT NULL,
          phone VARCHAR(40) NOT NULL,
          message_type VARCHAR(60) NOT NULL,
          body TEXT NOT NULL,
          status VARCHAR(20) NOT NULL,
          provider_message_id VARCHAR(80) NULL,
          error TEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_sms_order (order_id),
          INDEX idx_sms_status (status),
          INDEX idx_sms_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
        try { await pool.query("ALTER TABLE orders ADD COLUMN sms_opt_in TINYINT(1) NOT NULL DEFAULT 1"); } catch (_) {}
      }
    } else if (dbApi.kind === "sqlite" && dbApi._db) {
      const db = dbApi._db;
      db.exec(`CREATE TABLE IF NOT EXISTS sms_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        phone TEXT NOT NULL,
        message_type TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL,
        provider_message_id TEXT,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
      db.exec("CREATE INDEX IF NOT EXISTS idx_sms_order ON sms_logs(order_id)");
      db.exec("CREATE INDEX IF NOT EXISTS idx_sms_status ON sms_logs(status)");
      try { db.exec("ALTER TABLE orders ADD COLUMN sms_opt_in INTEGER NOT NULL DEFAULT 1"); } catch (_) {}
    }
  }

  async function logSms({ orderId, phone, type, body, status, providerId, error }) {
    try {
      if (dbApi.kind === "mysql" && dbApi._pool) {
        await dbApi._pool.query(
          "INSERT INTO sms_logs (order_id, phone, message_type, body, status, provider_message_id, error) VALUES (?,?,?,?,?,?,?)",
          [orderId || null, phone || "", type, body || "", status, providerId || null, error || null]
        );
      } else if (dbApi.kind === "sqlite" && dbApi._db) {
        dbApi._db.prepare(
          "INSERT INTO sms_logs (order_id, phone, message_type, body, status, provider_message_id, error) VALUES (?,?,?,?,?,?,?)"
        ).run(orderId || null, phone || "", type, body || "", status, providerId || null, error || null);
      }
    } catch (e) { console.error("[sms_log] insert failed", e.message); }
  }

  // Dedupe per order+type
  async function alreadySent(orderId, type) {
    if (!orderId) return false;
    try {
      if (dbApi.kind === "mysql" && dbApi._pool) {
        const [r] = await dbApi._pool.query(
          "SELECT 1 FROM sms_logs WHERE order_id=? AND message_type=? AND status='sent' LIMIT 1",
          [orderId, type]
        );
        return r.length > 0;
      } else if (dbApi.kind === "sqlite" && dbApi._db) {
        return !!dbApi._db.prepare("SELECT 1 FROM sms_logs WHERE order_id=? AND message_type=? AND status='sent' LIMIT 1").get(orderId, type);
      }
    } catch (_) {}
    return false;
  }

  async function send({ orderId, to, type, body, force = false }) {
    const cfg = config();
    const phone = normalizePhone(to);
    if (!phone) { await logSms({ orderId, phone: String(to || ""), type, body, status: "skipped", error: "invalid_phone" }); return { ok: false, reason: "invalid_phone" }; }
    if (!cfg.enabled) { await logSms({ orderId, phone, type, body, status: "skipped", error: "sms_disabled" }); return { ok: false, reason: "disabled" }; }
    if (!cfg.configured) { await logSms({ orderId, phone, type, body, status: "skipped", error: "twilio_not_configured" }); return { ok: false, reason: "not_configured" }; }
    if (!force && await alreadySent(orderId, type)) return { ok: true, reason: "duplicate" };
    const c = client();
    if (!c) { await logSms({ orderId, phone, type, body, status: "skipped", error: "twilio_client_unavailable" }); return { ok: false, reason: "client" }; }
    try {
      const msg = await c.messages.create({ from: FROM, to: phone, body: String(body || "").slice(0, 1500) });
      await logSms({ orderId, phone, type, body, status: "sent", providerId: msg.sid });
      return { ok: true, sid: msg.sid };
    } catch (err) {
      console.error("[sms] send failed", err.message);
      await logSms({ orderId, phone, type, body, status: "failed", error: err.message });
      return { ok: false, error: err.message };
    }
  }

  // Templates in French for customer-facing events
  function templateFor(type, order) {
    const num = order.order_number || "";
    const name = order.customer_name || "";
    const eta = order.estimated_delivery_time || order.estimated_ready_time || null;
    const etaStr = eta ? new Date(eta).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" }) : "";
    const track = order.order_number ? `Suivi: ${process.env.PUBLIC_BASE_URL || ""}/track/${order.order_number}` : "";
    switch (type) {
      case "order_created": return `Deli Aden — commande ${num} reçue. Merci ${name}! ${etaStr ? "Estimé: " + etaStr + ". " : ""}${track}`.trim();
      case "order_accepted": return `Deli Aden — votre commande ${num} est confirmée. ${etaStr ? "Estimé: " + etaStr : ""}`.trim();
      case "order_preparing": return `Deli Aden — préparation de la commande ${num} en cours.`;
      case "order_ready": return order.order_type === "delivery"
        ? `Deli Aden — commande ${num} prête, en attente d'un livreur.`
        : `Deli Aden — commande ${num} prête au ramassage.`;
      case "order_dispatched": return `Deli Aden — commande ${num} en route! ${track}`;
      case "order_completed": return `Deli Aden — commande ${num} livrée/complétée. Merci!`;
      case "order_cancelled": return `Deli Aden — commande ${num} annulée. Contactez-nous si besoin.`;
      case "payment_succeeded": return `Deli Aden — paiement reçu pour ${num}. Merci!`;
      case "payment_failed": return `Deli Aden — paiement échoué pour ${num}. Merci de réessayer.`;
      default: return `Deli Aden — mise à jour ${num}`;
    }
  }

  // Fire customer SMS if opted in. Non-blocking helper.
  function notifyCustomer(order, type) {
    if (!order) return;
    const optIn = order.sms_opt_in === undefined ? true : Boolean(order.sms_opt_in);
    if (!optIn) return;
    if (!order.customer_phone) return;
    const body = templateFor(type, order);
    send({ orderId: order.id, to: order.customer_phone, type, body })
      .catch((e) => console.error("[sms] notifyCustomer", e.message));
  }

  function notifyAdmin(order, type, extra) {
    if (!ADMIN_PHONE) return;
    const num = order && order.order_number ? order.order_number : "";
    let body = `Deli Aden ADMIN — ${type} ${num}`;
    if (type === "new_order") body = `Deli Aden — NOUVELLE commande ${num} (${order.customer_name}, ${order.total ? order.total.toFixed(2) + "$" : ""})`;
    else if (type === "payment_failed") body = `Deli Aden — paiement ÉCHOUÉ ${num}`;
    else if (type === "unassigned_ready") body = `Deli Aden — commande PRÊTE ${num} sans livreur (>${extra?.minutes || 10} min)`;
    send({ orderId: order && order.id, to: ADMIN_PHONE, type: "admin_" + type, body, force: true })
      .catch((e) => console.error("[sms] notifyAdmin", e.message));
  }

  // Admin log queries
  async function listLogs({ status, search, limit = 200 } = {}) {
    const lim = Math.min(1000, Math.max(1, parseInt(limit, 10) || 200));
    if (dbApi.kind === "mysql" && dbApi._pool) {
      const where = []; const params = [];
      if (status && status !== "all") { where.push("status = ?"); params.push(status); }
      if (search) { where.push("(phone LIKE ? OR CAST(order_id AS CHAR) = ?)"); params.push("%" + search + "%", search); }
      const sql = "SELECT * FROM sms_logs" + (where.length ? " WHERE " + where.join(" AND ") : "") + " ORDER BY id DESC LIMIT ?";
      params.push(lim);
      const [rows] = await dbApi._pool.query(sql, params);
      return rows;
    } else if (dbApi.kind === "sqlite" && dbApi._db) {
      const where = []; const params = [];
      if (status && status !== "all") { where.push("status = ?"); params.push(status); }
      if (search) { where.push("(phone LIKE ? OR CAST(order_id AS TEXT) = ?)"); params.push("%" + search + "%", search); }
      const sql = "SELECT * FROM sms_logs" + (where.length ? " WHERE " + where.join(" AND ") : "") + " ORDER BY id DESC LIMIT ?";
      params.push(lim);
      return dbApi._db.prepare(sql).all(...params);
    }
    return [];
  }

  async function getLog(id) {
    if (dbApi.kind === "mysql" && dbApi._pool) {
      const [r] = await dbApi._pool.query("SELECT * FROM sms_logs WHERE id=?", [id]);
      return r[0] || null;
    } else if (dbApi.kind === "sqlite" && dbApi._db) {
      return dbApi._db.prepare("SELECT * FROM sms_logs WHERE id=?").get(id) || null;
    }
    return null;
  }

  return { init, send, notifyCustomer, notifyAdmin, templateFor, listLogs, getLog, config, normalizePhone };
}

module.exports = { createSms, normalizePhone, config };

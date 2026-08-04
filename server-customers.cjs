/* eslint-disable */
// Phase 2 — Customer accounts module.
// Mounts customers / addresses / favorites tables, dbApi methods, and HTTP routes.

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.ADMIN_PASSWORD ||
  "deli-aden-dev-jwt-secret-change-me";
const JWT_TTL = "30d";
const TOKEN_AUDIENCE = "deli-aden-customer";

function clean(v, max = 500) {
  if (v == null) return "";
  return String(v).replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim().slice(0, max);
}
function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
function signToken(customer, jti) {
  return jwt.sign(
    { sub: String(customer.id), email: customer.email, name: customer.name, jti },
    JWT_SECRET,
    { expiresIn: JWT_TTL, audience: TOKEN_AUDIENCE }
  );
}
function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET, { audience: TOKEN_AUDIENCE }); }
  catch { return null; }
}
function hashToken(t) { return crypto.createHash("sha256").update(String(t)).digest("hex"); }


/**
 * @param {import('express').Express} app
 * @param {object} ctx { mysqlPool, sqliteDb, kind: 'mysql'|'sqlite', rateLimit, dbApi }
 */
async function mountCustomers(app, ctx) {
  const { kind, mysqlPool, sqliteDb, rateLimit, dbApi } = ctx;
  const isMysql = kind === "mysql";

  // ---- Schema ----
  if (isMysql) {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.query(`CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(200) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(160) NOT NULL,
        phone VARCHAR(40),
        reset_token VARCHAR(80),
        reset_expires_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_customers_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await conn.query(`CREATE TABLE IF NOT EXISTS customer_addresses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        label VARCHAR(80) NOT NULL DEFAULT 'Maison',
        address VARCHAR(500) NOT NULL,
        unit VARCHAR(80),
        door_code VARCHAR(40),
        instructions TEXT,
        is_default TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_addr_customer (customer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await conn.query(`CREATE TABLE IF NOT EXISTS customer_favorites (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        label VARCHAR(120) NOT NULL,
        items_json LONGTEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_fav_customer (customer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await conn.query(`CREATE TABLE IF NOT EXISTS customer_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_id INT NOT NULL,
        token_hash VARCHAR(64) NOT NULL UNIQUE,
        user_agent VARCHAR(255),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at DATETIME NULL,
        expires_at DATETIME NOT NULL,
        INDEX idx_sess_customer (customer_id),
        INDEX idx_sess_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      // Link orders to customers (nullable for guest checkout)

      try { await conn.query(`ALTER TABLE orders ADD COLUMN customer_id INT NULL`); } catch (_) {}
      try { await conn.query(`ALTER TABLE orders ADD INDEX idx_orders_customer (customer_id)`); } catch (_) {}
    } finally { conn.release(); }
  } else {
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        reset_token TEXT,
        reset_expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
      CREATE TABLE IF NOT EXISTS customer_addresses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        label TEXT NOT NULL DEFAULT 'Maison',
        address TEXT NOT NULL,
        unit TEXT, door_code TEXT, instructions TEXT,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_addr_customer ON customer_addresses(customer_id);
      CREATE TABLE IF NOT EXISTS customer_favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        items_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_fav_customer ON customer_favorites(customer_id);
      CREATE TABLE IF NOT EXISTS customer_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_seen_at TEXT,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sess_customer ON customer_sessions(customer_id);
      CREATE INDEX IF NOT EXISTS idx_sess_expires ON customer_sessions(expires_at);

    `);
    try { sqliteDb.exec(`ALTER TABLE orders ADD COLUMN customer_id INTEGER`); } catch (_) {}
  }

  // ---- DAL ----
  const q = (sql, params = []) => isMysql
    ? mysqlPool.query(sql, params).then(([r]) => r)
    : Promise.resolve(sqliteDb.prepare(sql).all(...params));
  const exec = (sql, params = []) => isMysql
    ? mysqlPool.query(sql, params).then(([r]) => r)
    : Promise.resolve(sqliteDb.prepare(sql).run(...params));
  const one = (sql, params = []) => q(sql, params).then((r) => (Array.isArray(r) ? r[0] : r) || null);
  const insertedId = (r) => (r && (r.insertId ?? r.lastInsertRowid)) || null;

  async function findCustomerByEmail(email) {
    return one("SELECT * FROM customers WHERE email = ?", [email]);
  }
  async function findCustomerById(id) {
    return one("SELECT * FROM customers WHERE id = ?", [id]);
  }
  async function createCustomer({ email, password, name, phone }) {
    const hash = await bcrypt.hash(password, 10);
    const r = await exec(
      "INSERT INTO customers (email, password_hash, name, phone) VALUES (?,?,?,?)",
      [email, hash, name, phone || null]
    );
    return findCustomerById(insertedId(r));
  }
  async function updateCustomer(id, patch) {
    const sets = []; const params = [];
    if (patch.name != null) { sets.push("name = ?"); params.push(patch.name); }
    if (patch.phone !== undefined) { sets.push("phone = ?"); params.push(patch.phone || null); }
    if (patch.password) {
      const hash = await bcrypt.hash(patch.password, 10);
      sets.push("password_hash = ?"); params.push(hash);
    }
    if (!sets.length) return;
    params.push(id);
    await exec(`UPDATE customers SET ${sets.join(", ")} WHERE id = ?`, params);
  }
  async function listAddresses(customerId) {
    return q("SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC", [customerId]);
  }
  async function createAddress(customerId, a) {
    if (a.is_default) {
      await exec("UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?", [customerId]);
    }
    const r = await exec(
      "INSERT INTO customer_addresses (customer_id, label, address, unit, door_code, instructions, is_default) VALUES (?,?,?,?,?,?,?)",
      [customerId, a.label || "Maison", a.address, a.unit || null, a.door_code || null, a.instructions || null, a.is_default ? 1 : 0]
    );
    return insertedId(r);
  }
  async function deleteAddress(customerId, id) {
    await exec("DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?", [id, customerId]);
  }
  async function listFavorites(customerId) {
    const rows = await q("SELECT * FROM customer_favorites WHERE customer_id = ? ORDER BY id DESC", [customerId]);
    return rows.map((r) => ({
      id: r.id, label: r.label,
      items: typeof r.items_json === "string" ? JSON.parse(r.items_json) : r.items_json,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    }));
  }
  async function createFavorite(customerId, label, items) {
    const r = await exec(
      "INSERT INTO customer_favorites (customer_id, label, items_json) VALUES (?,?,?)",
      [customerId, label, JSON.stringify(items)]
    );
    return insertedId(r);
  }
  async function deleteFavorite(customerId, id) {
    await exec("DELETE FROM customer_favorites WHERE id = ? AND customer_id = ?", [id, customerId]);
  }
  async function listOrdersForCustomer(customerId) {
    const sql = "SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 100";
    return q(sql, [customerId]);
  }

  // Expose for /api/orders to attach customer_id when token present
  dbApi.attachOrderToCustomer = async (orderId, customerId) => {
    await exec("UPDATE orders SET customer_id = ? WHERE id = ?", [customerId, orderId]);
  };

  // ---- Sessions (hashed server-side, revocable) ----
  const dt = (d) => isMysql ? d.toISOString().slice(0, 19).replace("T", " ") : d.toISOString();
  async function createSession(customer, userAgent) {
    const jti = crypto.randomBytes(16).toString("hex");
    const token = signToken(customer, jti);
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await exec(
      "INSERT INTO customer_sessions (customer_id, token_hash, user_agent, expires_at) VALUES (?,?,?,?)",
      [customer.id, hashToken(token), clean(userAgent, 255) || null, dt(expires)]
    );
    // Opportunistic cleanup of expired sessions
    try { await exec("DELETE FROM customer_sessions WHERE expires_at < ?", [dt(new Date())]); } catch (_) {}
    return token;
  }
  async function findSession(token) {
    return one("SELECT * FROM customer_sessions WHERE token_hash = ?", [hashToken(token)]);
  }
  async function revokeSession(token) {
    await exec("DELETE FROM customer_sessions WHERE token_hash = ?", [hashToken(token)]);
  }

  // ---- Middleware ----
  async function requireCustomer(req, res, next) {
    try {
      const h = req.header("authorization") || "";
      const m = h.match(/^Bearer\s+(.+)$/i);
      if (!m) return res.status(401).json({ error: "Connexion requise" });
      const payload = verifyToken(m[1]);
      if (!payload || !payload.sub) return res.status(401).json({ error: "Session invalide" });
      const sess = await findSession(m[1]);
      if (!sess) return res.status(401).json({ error: "Session expirée" });
      const exp = sess.expires_at instanceof Date ? sess.expires_at.getTime() : Date.parse(sess.expires_at);
      if (exp && exp < Date.now()) {
        await revokeSession(m[1]);
        return res.status(401).json({ error: "Session expirée" });
      }
      req.customerId = parseInt(payload.sub, 10);
      req.customerToken = m[1];
      try { await exec("UPDATE customer_sessions SET last_seen_at = ? WHERE id = ?", [dt(new Date()), sess.id]); } catch (_) {}
      next();
    } catch (err) {
      console.error("[customers] auth", err);
      res.status(500).json({ error: "Erreur" });
    }
  }

  // NOTE: do not app.use here — order routes are already registered.
  // server.cjs uses verifyToken() inline in the create-order route instead.

  // ---- Rate limiters ----
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyPrefix: "cust-auth" });
  const resetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, keyPrefix: "cust-reset" });

  // ---- Routes ----
  app.post("/api/customers/signup", authLimiter, async (req, res) => {
    try {
      const b = req.body || {};
      const email = clean(b.email, 200).toLowerCase();
      const password = String(b.password || "");
      const name = clean(b.name, 160);
      const phone = clean(b.phone, 40);
      if (!isEmail(email)) return res.status(400).json({ error: "Email invalide" });
      if (password.length < 8) return res.status(400).json({ error: "Mot de passe : minimum 8 caractères" });
      if (!name) return res.status(400).json({ error: "Nom requis" });
      if (await findCustomerByEmail(email)) return res.status(409).json({ error: "Un compte existe déjà avec cet email" });
      const customer = await createCustomer({ email, password, name, phone });
      const token = await createSession(customer, req.header("user-agent"));
      res.json({ token, customer: publicCustomer(customer) });
    } catch (err) { console.error("[customers] signup", err); res.status(500).json({ error: "Erreur" }); }
  });

  app.post("/api/customers/login", authLimiter, async (req, res) => {
    try {
      const email = clean(req.body?.email, 200).toLowerCase();
      const password = String(req.body?.password || "");
      const cust = await findCustomerByEmail(email);
      if (!cust || !(await bcrypt.compare(password, cust.password_hash))) {
        return res.status(401).json({ error: "Email ou mot de passe invalide" });
      }
      const token = await createSession(cust, req.header("user-agent"));
      res.json({ token, customer: publicCustomer(cust) });

    } catch (err) { console.error("[customers] login", err); res.status(500).json({ error: "Erreur" }); }
  });

  app.post("/api/customers/forgot", resetLimiter, async (req, res) => {
    try {
      const email = clean(req.body?.email, 200).toLowerCase();
      const cust = await findCustomerByEmail(email);
      // Always return ok to avoid email enumeration
      if (cust) {
        const token = crypto.randomBytes(24).toString("hex");
        const expires = new Date(Date.now() + 60 * 60 * 1000);
        const expStr = isMysql ? expires.toISOString().slice(0,19).replace("T"," ") : expires.toISOString();
        await exec("UPDATE customers SET reset_token = ?, reset_expires_at = ? WHERE id = ?", [token, expStr, cust.id]);
        console.log(`[customers] password reset token for ${email}: ${token}`);
        // TODO: send email — wired into existing nodemailer in future turn
      }
      res.json({ ok: true });
    } catch (err) { console.error("[customers] forgot", err); res.status(500).json({ error: "Erreur" }); }
  });

  app.post("/api/customers/reset", resetLimiter, async (req, res) => {
    try {
      const token = clean(req.body?.token, 80);
      const password = String(req.body?.password || "");
      if (password.length < 8) return res.status(400).json({ error: "Mot de passe : minimum 8 caractères" });
      const cust = await one("SELECT * FROM customers WHERE reset_token = ?", [token]);
      if (!cust) return res.status(400).json({ error: "Lien invalide ou expiré" });
      const exp = cust.reset_expires_at instanceof Date ? cust.reset_expires_at.getTime() : Date.parse(cust.reset_expires_at);
      if (!exp || exp < Date.now()) return res.status(400).json({ error: "Lien expiré" });
      const hash = await bcrypt.hash(password, 10);
      await exec("UPDATE customers SET password_hash = ?, reset_token = NULL, reset_expires_at = NULL WHERE id = ?", [hash, cust.id]);
      res.json({ ok: true });
    } catch (err) { console.error("[customers] reset", err); res.status(500).json({ error: "Erreur" }); }
  });

  app.get("/api/customers/me", requireCustomer, async (req, res) => {
    const cust = await findCustomerById(req.customerId);
    if (!cust) return res.status(404).json({ error: "Compte introuvable" });
    res.json({ customer: publicCustomer(cust) });
  });

  app.patch("/api/customers/me", requireCustomer, async (req, res) => {
    try {
      const b = req.body || {};
      const patch = {};
      if (b.name != null) patch.name = clean(b.name, 160);
      if (b.phone !== undefined) patch.phone = clean(b.phone, 40);
      if (b.password) {
        if (String(b.password).length < 8) return res.status(400).json({ error: "Mot de passe : minimum 8 caractères" });
        patch.password = String(b.password);
      }
      await updateCustomer(req.customerId, patch);
      const cust = await findCustomerById(req.customerId);
      res.json({ customer: publicCustomer(cust) });
    } catch (err) { console.error("[customers] update", err); res.status(500).json({ error: "Erreur" }); }
  });

  app.get("/api/customers/me/orders", requireCustomer, async (req, res) => {
    try {
      const rows = await listOrdersForCustomer(req.customerId);
      res.json({ orders: rows.map((row) => ({
        id: row.id, order_number: row.order_number, status: row.status,
        order_type: row.order_type, total: Number(row.total),
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        items: typeof row.items_json === "string" ? JSON.parse(row.items_json) : row.items_json,
      })) });
    } catch (err) { console.error("[customers] orders", err); res.status(500).json({ error: "Erreur" }); }
  });

  app.get("/api/customers/me/addresses", requireCustomer, async (req, res) => {
    try {
      const rows = await listAddresses(req.customerId);
      res.json({ addresses: rows.map((r) => ({
        id: r.id, label: r.label, address: r.address, unit: r.unit, door_code: r.door_code,
        instructions: r.instructions, is_default: r.is_default === 1 || r.is_default === true,
      })) });
    } catch (err) { console.error("[customers] addresses", err); res.status(500).json({ error: "Erreur" }); }
  });
  app.post("/api/customers/me/addresses", requireCustomer, async (req, res) => {
    try {
      const b = req.body || {};
      const address = clean(b.address, 500);
      if (!address) return res.status(400).json({ error: "Adresse requise" });
      const id = await createAddress(req.customerId, {
        label: clean(b.label, 80) || "Maison",
        address, unit: clean(b.unit, 80), door_code: clean(b.door_code, 40),
        instructions: clean(b.instructions, 500), is_default: Boolean(b.is_default),
      });
      res.json({ ok: true, id });
    } catch (err) { console.error("[customers] addr create", err); res.status(500).json({ error: "Erreur" }); }
  });
  app.delete("/api/customers/me/addresses/:id", requireCustomer, async (req, res) => {
    try { await deleteAddress(req.customerId, parseInt(req.params.id, 10)); res.json({ ok: true }); }
    catch (err) { console.error("[customers] addr del", err); res.status(500).json({ error: "Erreur" }); }
  });

  app.get("/api/customers/me/favorites", requireCustomer, async (req, res) => {
    try { res.json({ favorites: await listFavorites(req.customerId) }); }
    catch (err) { console.error("[customers] fav", err); res.status(500).json({ error: "Erreur" }); }
  });
  app.post("/api/customers/me/favorites", requireCustomer, async (req, res) => {
    try {
      const label = clean(req.body?.label, 120);
      const items = Array.isArray(req.body?.items) ? req.body.items : null;
      if (!label || !items || !items.length) return res.status(400).json({ error: "Nom et articles requis" });
      const id = await createFavorite(req.customerId, label, items);
      res.json({ ok: true, id });
    } catch (err) { console.error("[customers] fav create", err); res.status(500).json({ error: "Erreur" }); }
  });
  app.delete("/api/customers/me/favorites/:id", requireCustomer, async (req, res) => {
    try { await deleteFavorite(req.customerId, parseInt(req.params.id, 10)); res.json({ ok: true }); }
    catch (err) { console.error("[customers] fav del", err); res.status(500).json({ error: "Erreur" }); }
  });

  // Sign out — revokes the current session server-side.
  app.post("/api/customers/logout", requireCustomer, async (req, res) => {
    try { await revokeSession(req.customerToken); res.json({ ok: true }); }
    catch (err) { console.error("[customers] logout", err); res.status(500).json({ error: "Erreur" }); }
  });
  // Sign out everywhere
  app.post("/api/customers/logout-all", requireCustomer, async (req, res) => {
    try { await exec("DELETE FROM customer_sessions WHERE customer_id = ?", [req.customerId]); res.json({ ok: true }); }
    catch (err) { console.error("[customers] logout-all", err); res.status(500).json({ error: "Erreur" }); }
  });

  // ---- Admin: customer directory + history ----
  const { requireAdmin } = ctx;
  if (typeof requireAdmin === "function") {
    app.get("/api/admin/customers", requireAdmin, async (req, res) => {
      try {
        const search = clean(req.query?.search, 120);
        const params = [];
        let where = "";
        if (search) {
          where = "WHERE c.email LIKE ? OR c.name LIKE ? OR c.phone LIKE ?";
          const like = `%${search}%`; params.push(like, like, like);
        }
        const rows = await q(
          `SELECT c.id, c.email, c.name, c.phone, c.created_at,
                  (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS orders_count,
                  (SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.customer_id = c.id) AS lifetime_total
           FROM customers c ${where} ORDER BY c.id DESC LIMIT 200`, params);
        res.json({ customers: rows.map((r) => ({
          id: r.id, email: r.email, name: r.name, phone: r.phone || "",
          created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
          orders_count: Number(r.orders_count) || 0,
          lifetime_total: Number(r.lifetime_total) || 0,
        })) });
      } catch (err) { console.error("[customers] admin list", err); res.status(500).json({ error: "Erreur" }); }
    });

    app.get("/api/admin/customers/:id", requireAdmin, async (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        const cust = await findCustomerById(id);
        if (!cust) return res.status(404).json({ error: "Client introuvable" });
        const orders = await listOrdersForCustomer(id);
        const addresses = await listAddresses(id);
        res.json({
          customer: publicCustomer(cust),
          addresses: addresses.map((a) => ({ id: a.id, label: a.label, address: a.address, unit: a.unit, is_default: a.is_default === 1 || a.is_default === true })),
          orders: orders.map((row) => ({
            id: row.id, order_number: row.order_number, status: row.status,
            order_type: row.order_type, total: Number(row.total),
            created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
          })),
        });
      } catch (err) { console.error("[customers] admin detail", err); res.status(500).json({ error: "Erreur" }); }
    });
  }
}


function publicCustomer(c) {
  return {
    id: c.id, email: c.email, name: c.name, phone: c.phone || "",
    created_at: c.created_at instanceof Date ? c.created_at.toISOString() : c.created_at,
  };
}

module.exports = { mountCustomers, verifyToken };

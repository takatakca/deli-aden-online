"use strict";
// Turn 6 — Inventory, Recipe Costing, Suppliers, Purchases, Waste, Low-stock.
// MySQL + SQLite compatible. Mounted from server.cjs.

const UNITS = ["g", "kg", "ml", "l", "unit", "portion"];

function csvCell(v) {
  let s = v == null ? "" : String(v);
  // CSV injection guard
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function clean(v, max = 255) {
  if (v == null) return null;
  const s = String(v).trim().slice(0, max);
  return s.length ? s : null;
}
// decimal-safe: work in integer micro-units (6 decimals)
const SCALE = 1e6;
function dec(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * SCALE) / SCALE;
}
function addDec(a, b) { return (Math.round(Number(a) * SCALE) + Math.round(Number(b) * SCALE)) / SCALE; }
function mulDec(a, b) { return Math.round(Number(a) * Number(b) * SCALE) / SCALE; }

// Normalise a quantity to the ingredient's stock unit when compatible.
function convert(qty, fromUnit, toUnit) {
  const f = String(fromUnit || "").toLowerCase();
  const t = String(toUnit || "").toLowerCase();
  if (!f || !t || f === t) return dec(qty);
  const mass = { g: 1, kg: 1000 };
  const vol = { ml: 1, l: 1000 };
  if (mass[f] && mass[t]) return dec((qty * mass[f]) / mass[t]);
  if (vol[f] && vol[t]) return dec((qty * vol[f]) / vol[t]);
  return dec(qty); // incompatible units: use as-is
}

function createInventory({ dbApi, realtime, sendAdminSms, sendAdminEmail, logOrderEvent, onLowStock }) {
  const isMysql = dbApi.kind === "mysql";
  const LOW_EMAIL = String(process.env.ENABLE_LOW_STOCK_EMAIL || "").toLowerCase() === "true";
  const LOW_SMS = String(process.env.ENABLE_LOW_STOCK_SMS || "").toLowerCase() === "true";
  const alerted = new Set(); // ingredient ids already alerted (cleared when restocked)

  async function q(sql, params = []) {
    if (isMysql) { const [r] = await dbApi._pool.query(sql, params); return r; }
    const s = dbApi._db.prepare(sql);
    if (/^\s*select/i.test(sql)) return s.all(...params);
    return s.run(...params);
  }
  async function qOne(sql, params = []) {
    if (isMysql) { const [r] = await dbApi._pool.query(sql, params); return r[0] || null; }
    return dbApi._db.prepare(sql).get(...params) || null;
  }
  async function insertId(sql, params = []) {
    if (isMysql) { const [r] = await dbApi._pool.query(sql, params); return r.insertId; }
    return dbApi._db.prepare(sql).run(...params).lastInsertRowid;
  }
  const NOW = () => (isMysql ? "NOW()" : "datetime('now')");

  // -------------------------------------------------------------------
  // Schema
  // -------------------------------------------------------------------
  async function init() {
    if (isMysql) {
      const p = dbApi._pool;
      await p.query(`CREATE TABLE IF NOT EXISTS suppliers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(160) NOT NULL,
        contact_name VARCHAR(160) NULL,
        phone VARCHAR(40) NULL,
        email VARCHAR(200) NULL,
        address VARCHAR(300) NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await p.query(`CREATE TABLE IF NOT EXISTS ingredients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(160) NOT NULL,
        sku VARCHAR(60) NULL,
        unit VARCHAR(16) NOT NULL DEFAULT 'g',
        current_stock DECIMAL(14,4) NOT NULL DEFAULT 0,
        minimum_stock DECIMAL(14,4) NOT NULL DEFAULT 0,
        reorder_quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
        average_unit_cost DECIMAL(14,6) NOT NULL DEFAULT 0,
        supplier_id INT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ing_supplier (supplier_id),
        INDEX idx_ing_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await p.query(`CREATE TABLE IF NOT EXISTS inventory_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ingredient_id INT NOT NULL,
        transaction_type VARCHAR(32) NOT NULL,
        quantity DECIMAL(14,4) NOT NULL,
        unit_cost DECIMAL(14,6) NULL,
        reference_type VARCHAR(32) NULL,
        reference_id VARCHAR(64) NULL,
        note VARCHAR(300) NULL,
        created_by VARCHAR(60) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_tx_ing (ingredient_id),
        INDEX idx_tx_ref (reference_type, reference_id),
        INDEX idx_tx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await p.query(`CREATE TABLE IF NOT EXISTS recipes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        menu_item_id VARCHAR(80) NOT NULL,
        ingredient_id INT NOT NULL,
        quantity_required DECIMAL(14,4) NOT NULL DEFAULT 0,
        unit VARCHAR(16) NOT NULL DEFAULT 'g',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_recipe (menu_item_id, ingredient_id),
        INDEX idx_recipe_item (menu_item_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await p.query(`CREATE TABLE IF NOT EXISTS purchase_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        supplier_id INT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'draft',
        subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        tax DECIMAL(12,2) NOT NULL DEFAULT 0,
        total DECIMAL(12,2) NOT NULL DEFAULT 0,
        expected_at DATETIME NULL,
        received_at DATETIME NULL,
        notes VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_po_supplier (supplier_id),
        INDEX idx_po_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await p.query(`CREATE TABLE IF NOT EXISTS purchase_order_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        purchase_order_id INT NOT NULL,
        ingredient_id INT NOT NULL,
        quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
        unit_cost DECIMAL(14,6) NOT NULL DEFAULT 0,
        received_quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
        INDEX idx_poi_po (purchase_order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      await p.query(`CREATE TABLE IF NOT EXISTS waste_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ingredient_id INT NOT NULL,
        quantity DECIMAL(14,4) NOT NULL,
        reason VARCHAR(60) NOT NULL DEFAULT 'other',
        estimated_cost DECIMAL(12,4) NOT NULL DEFAULT 0,
        note VARCHAR(300) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_waste_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      for (const c of [
        "ALTER TABLE orders ADD COLUMN inventory_deducted_at DATETIME NULL",
        "ALTER TABLE orders ADD COLUMN inventory_restored_at DATETIME NULL",
      ]) { try { await p.query(c); } catch (_) {} }
    } else {
      const db = dbApi._db;
      db.exec(`
        CREATE TABLE IF NOT EXISTS suppliers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL, contact_name TEXT, phone TEXT, email TEXT, address TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS ingredients (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL, sku TEXT, unit TEXT NOT NULL DEFAULT 'g',
          current_stock REAL NOT NULL DEFAULT 0,
          minimum_stock REAL NOT NULL DEFAULT 0,
          reorder_quantity REAL NOT NULL DEFAULT 0,
          average_unit_cost REAL NOT NULL DEFAULT 0,
          supplier_id INTEGER,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_ing_supplier ON ingredients(supplier_id);
        CREATE TABLE IF NOT EXISTS inventory_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ingredient_id INTEGER NOT NULL,
          transaction_type TEXT NOT NULL,
          quantity REAL NOT NULL,
          unit_cost REAL,
          reference_type TEXT, reference_id TEXT, note TEXT, created_by TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_tx_ing ON inventory_transactions(ingredient_id);
        CREATE INDEX IF NOT EXISTS idx_tx_ref ON inventory_transactions(reference_type, reference_id);
        CREATE TABLE IF NOT EXISTS recipes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          menu_item_id TEXT NOT NULL,
          ingredient_id INTEGER NOT NULL,
          quantity_required REAL NOT NULL DEFAULT 0,
          unit TEXT NOT NULL DEFAULT 'g',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (menu_item_id, ingredient_id)
        );
        CREATE TABLE IF NOT EXISTS purchase_orders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          supplier_id INTEGER, status TEXT NOT NULL DEFAULT 'draft',
          subtotal REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0,
          expected_at TEXT, received_at TEXT, notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS purchase_order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          purchase_order_id INTEGER NOT NULL,
          ingredient_id INTEGER NOT NULL,
          quantity REAL NOT NULL DEFAULT 0,
          unit_cost REAL NOT NULL DEFAULT 0,
          received_quantity REAL NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS waste_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ingredient_id INTEGER NOT NULL,
          quantity REAL NOT NULL,
          reason TEXT NOT NULL DEFAULT 'other',
          estimated_cost REAL NOT NULL DEFAULT 0,
          note TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      for (const c of [
        "ALTER TABLE orders ADD COLUMN inventory_deducted_at TEXT",
        "ALTER TABLE orders ADD COLUMN inventory_restored_at TEXT",
      ]) { try { db.exec(c); } catch (_) {} }
    }
  }

  // -------------------------------------------------------------------
  // Core helpers
  // -------------------------------------------------------------------
  async function getIngredient(id) {
    return qOne("SELECT * FROM ingredients WHERE id = ?", [id]);
  }

  async function recordTx(t) {
    await q(
      `INSERT INTO inventory_transactions
       (ingredient_id, transaction_type, quantity, unit_cost, reference_type, reference_id, note, created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [t.ingredient_id, t.transaction_type, dec(t.quantity), t.unit_cost != null ? dec(t.unit_cost) : null,
        t.reference_type || null, t.reference_id != null ? String(t.reference_id) : null,
        clean(t.note, 300), clean(t.created_by, 60)]
    );
  }

  // delta is signed, expressed in the ingredient's own unit
  async function applyStock(ingredientId, delta, tx) {
    const ing = await getIngredient(ingredientId);
    if (!ing) return null;
    const before = dec(ing.current_stock);
    const after = addDec(before, dec(delta));
    await q(`UPDATE ingredients SET current_stock = ?, updated_at = ${NOW()} WHERE id = ?`, [after, ingredientId]);
    if (tx) await recordTx({ ...tx, ingredient_id: ingredientId, quantity: dec(delta) });
    try { realtime?.emitAdmin("inventory_adjusted", { ingredient_id: ingredientId, name: ing.name, before, after }); } catch (_) {}
    await checkLowStock({ ...ing, current_stock: after });
    return after;
  }

  async function checkLowStock(ing) {
    const low = dec(ing.current_stock) <= dec(ing.minimum_stock);
    if (!low) { alerted.delete(ing.id); return; }
    if (alerted.has(ing.id)) return;
    alerted.add(ing.id);
    const payload = {
      ingredient_id: ing.id, name: ing.name,
      current_stock: dec(ing.current_stock), minimum_stock: dec(ing.minimum_stock), unit: ing.unit,
    };
    try { realtime?.emitAdmin("inventory_low_stock", payload); } catch (_) {}
    try { onLowStock?.(payload); } catch (_) {}
    const msg = `Deli Aden — stock bas : ${ing.name} (${dec(ing.current_stock)} ${ing.unit}, min ${dec(ing.minimum_stock)}).`;
    if (LOW_SMS && typeof sendAdminSms === "function") {
      try { await sendAdminSms(msg); } catch (e) { console.error("[inventory] low-stock sms", e.message); }
    }
    if (LOW_EMAIL && typeof sendAdminEmail === "function") {
      try { await sendAdminEmail("Stock bas — " + ing.name, msg); }
      catch (e) { console.error("[inventory] low-stock email", e.message); }
    }
  }

  // -------------------------------------------------------------------
  // Engine: order consumption / restore
  // -------------------------------------------------------------------
  async function deductForOrder(order) {
    if (!order || !order.id) return { skipped: true };
    const row = await qOne("SELECT inventory_deducted_at FROM orders WHERE id = ?", [order.id]);
    if (row && row.inventory_deducted_at) return { skipped: true, reason: "already_deducted" };

    const items = Array.isArray(order.items) ? order.items : [];
    const missing = [];
    const totals = new Map(); // ingredient_id -> qty in ingredient unit

    for (const it of items) {
      const itemId = it.itemId || it.item_id;
      const qty = Number(it.quantity) || 0;
      if (!itemId || qty <= 0) continue;
      const rows = await q(
        `SELECT r.ingredient_id, r.quantity_required, r.unit AS recipe_unit, i.unit AS stock_unit
         FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id
         WHERE r.menu_item_id = ? AND i.active = 1`,
        [String(itemId)]
      );
      if (!rows.length) { missing.push(itemId); continue; }
      for (const r of rows) {
        const need = convert(mulDec(r.quantity_required, qty), r.recipe_unit, r.stock_unit);
        totals.set(r.ingredient_id, addDec(totals.get(r.ingredient_id) || 0, need));
      }
    }

    for (const [ingredientId, qty] of totals) {
      if (qty <= 0) continue;
      const ing = await getIngredient(ingredientId);
      await applyStock(ingredientId, -qty, {
        transaction_type: "order_consumption",
        unit_cost: ing ? dec(ing.average_unit_cost) : null,
        reference_type: "order",
        reference_id: order.id,
        note: `Commande ${order.order_number || order.id}`,
        created_by: "system",
      });
    }

    await q(`UPDATE orders SET inventory_deducted_at = ${NOW()} WHERE id = ?`, [order.id]);
    try {
      logOrderEvent?.(order.id, "inventory_deducted", JSON.stringify({ ingredients: totals.size }));
      if (missing.length) logOrderEvent?.(order.id, "recipe_missing", JSON.stringify({ items: missing }));
    } catch (_) {}
    return { deducted: totals.size, recipe_missing: missing };
  }

  async function restoreForOrder(order) {
    if (!order || !order.id) return { skipped: true };
    const row = await qOne(
      "SELECT inventory_deducted_at, inventory_restored_at FROM orders WHERE id = ?", [order.id]
    );
    if (!row || !row.inventory_deducted_at) return { skipped: true, reason: "never_deducted" };
    if (row.inventory_restored_at) return { skipped: true, reason: "already_restored" };

    const txs = await q(
      `SELECT ingredient_id, SUM(quantity) AS qty FROM inventory_transactions
       WHERE reference_type = 'order' AND reference_id = ? AND transaction_type = 'order_consumption'
       GROUP BY ingredient_id`,
      [String(order.id)]
    );
    for (const t of txs) {
      const back = Math.abs(dec(t.qty));
      if (back <= 0) continue;
      await applyStock(t.ingredient_id, back, {
        transaction_type: "correction",
        reference_type: "order",
        reference_id: order.id,
        note: `Annulation commande ${order.order_number || order.id}`,
        created_by: "system",
      });
    }
    await q(`UPDATE orders SET inventory_restored_at = ${NOW()} WHERE id = ?`, [order.id]);
    try { logOrderEvent?.(order.id, "inventory_restored", JSON.stringify({ ingredients: txs.length })); } catch (_) {}
    return { restored: txs.length };
  }

  // Called from server.cjs on every status transition.
  async function onOrderStatus(order, status) {
    try {
      if (status === "accepted" || status === "preparing") return await deductForOrder(order);
      if (status === "cancelled") return await restoreForOrder(order);
    } catch (e) { console.error("[inventory] status hook", e.message); }
    return null;
  }

  // -------------------------------------------------------------------
  // Metrics
  // -------------------------------------------------------------------
  async function metrics() {
    const ings = await q("SELECT * FROM ingredients WHERE active = 1");
    let inventoryValue = 0;
    const lowStock = [];
    for (const i of ings) {
      inventoryValue = addDec(inventoryValue, mulDec(i.current_stock, i.average_unit_cost));
      if (dec(i.current_stock) <= dec(i.minimum_stock)) lowStock.push(i);
    }
    const wasteSince = async (expr) => {
      const r = await qOne(`SELECT COALESCE(SUM(estimated_cost),0) AS c FROM waste_logs WHERE created_at >= ${expr}`);
      return dec(r ? r.c : 0);
    };
    const today = isMysql ? "CURDATE()" : "date('now')";
    const week = isMysql ? "DATE_SUB(NOW(), INTERVAL 7 DAY)" : "datetime('now','-7 day')";
    const month = isMysql ? "DATE_SUB(NOW(), INTERVAL 30 DAY)" : "datetime('now','-30 day')";

    // theoretical food cost per menu item
    const recipeRows = await q(
      `SELECT r.menu_item_id, r.quantity_required, r.unit AS recipe_unit,
              i.unit AS stock_unit, i.average_unit_cost, i.name AS ingredient_name
       FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id`
    );
    const costs = {};
    for (const r of recipeRows) {
      const qty = convert(r.quantity_required, r.recipe_unit, r.stock_unit);
      costs[r.menu_item_id] = addDec(costs[r.menu_item_id] || 0, mulDec(qty, r.average_unit_cost));
    }
    return {
      inventory_value: dec(inventoryValue),
      ingredient_count: ings.length,
      low_stock_count: lowStock.length,
      waste_today: await wasteSince(today),
      waste_week: await wasteSince(week),
      waste_month: await wasteSince(month),
      item_costs: costs, // { menu_item_id: ingredient cost }
    };
  }

  async function lowStock() {
    return q(
      `SELECT i.*, s.name AS supplier_name FROM ingredients i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       WHERE i.active = 1 AND i.current_stock <= i.minimum_stock
       ORDER BY (i.current_stock - i.minimum_stock) ASC`
    );
  }

  // -------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------
  function mount(app, { requireAdmin }) {
    const B = "/api/admin/inventory";
    const wrap = (fn) => async (req, res) => {
      try { await fn(req, res); }
      catch (e) { console.error("[inventory]", e); if (!res.headersSent) res.status(500).json({ error: "Erreur" }); }
    };
    const sendCsv = (res, name, header, rows) => {
      const lines = [header.join(",")];
      for (const r of rows) lines.push(r.map(csvCell).join(","));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(lines.join("\n"));
    };

    // ---- Ingredients ----
    app.get(`${B}/ingredients`, requireAdmin, wrap(async (req, res) => {
      const params = [];
      let sql = `SELECT i.*, s.name AS supplier_name FROM ingredients i
                 LEFT JOIN suppliers s ON s.id = i.supplier_id WHERE 1=1`;
      if (req.query.search) { sql += " AND (i.name LIKE ? OR i.sku LIKE ?)"; const s = `%${req.query.search}%`; params.push(s, s); }
      if (req.query.low === "1") sql += " AND i.current_stock <= i.minimum_stock";
      if (req.query.active === "1") sql += " AND i.active = 1";
      sql += " ORDER BY i.name ASC LIMIT 1000";
      res.json({ ingredients: await q(sql, params), units: UNITS });
    }));

    app.get(`${B}/ingredients.csv`, requireAdmin, wrap(async (_req, res) => {
      const rows = await q(`SELECT i.*, s.name AS supplier_name FROM ingredients i
                            LEFT JOIN suppliers s ON s.id = i.supplier_id ORDER BY i.name`);
      sendCsv(res, "stock", ["name", "sku", "unit", "current_stock", "minimum_stock", "reorder_quantity", "average_unit_cost", "supplier", "active"],
        rows.map((r) => [r.name, r.sku || "", r.unit, r.current_stock, r.minimum_stock, r.reorder_quantity, r.average_unit_cost, r.supplier_name || "", r.active ? 1 : 0]));
    }));

    app.post(`${B}/ingredients`, requireAdmin, wrap(async (req, res) => {
      const name = clean(req.body?.name, 160);
      if (!name) return res.status(400).json({ error: "Nom requis" });
      const unit = UNITS.includes(req.body?.unit) ? req.body.unit : "g";
      const id = await insertId(
        `INSERT INTO ingredients (name, sku, unit, current_stock, minimum_stock, reorder_quantity, average_unit_cost, supplier_id, active)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [name, clean(req.body?.sku, 60), unit, dec(req.body?.current_stock), dec(req.body?.minimum_stock),
          dec(req.body?.reorder_quantity), dec(req.body?.average_unit_cost),
          req.body?.supplier_id ? parseInt(req.body.supplier_id, 10) : null,
          req.body?.active === false ? 0 : 1]
      );
      res.json({ ok: true, id });
    }));

    app.patch(`${B}/ingredients/:id`, requireAdmin, wrap(async (req, res) => {
      const id = parseInt(req.params.id, 10);
      const sets = []; const params = [];
      const map = {
        name: (v) => clean(v, 160), sku: (v) => clean(v, 60),
        unit: (v) => (UNITS.includes(v) ? v : "g"),
        minimum_stock: dec, reorder_quantity: dec, average_unit_cost: dec,
        supplier_id: (v) => (v ? parseInt(v, 10) : null),
        active: (v) => (v ? 1 : 0),
      };
      for (const [k, fn] of Object.entries(map)) {
        if (req.body?.[k] !== undefined) { sets.push(`${k} = ?`); params.push(fn(req.body[k])); }
      }
      if (!sets.length) return res.json({ ok: true });
      params.push(id);
      await q(`UPDATE ingredients SET ${sets.join(", ")}, updated_at = ${NOW()} WHERE id = ?`, params);
      const ing = await getIngredient(id);
      if (ing) await checkLowStock(ing);
      res.json({ ok: true });
    }));

    app.delete(`${B}/ingredients/:id`, requireAdmin, wrap(async (req, res) => {
      // soft delete keeps transaction history intact
      await q(`UPDATE ingredients SET active = 0, updated_at = ${NOW()} WHERE id = ?`, [parseInt(req.params.id, 10)]);
      res.json({ ok: true });
    }));

    app.get(`${B}/ingredients/:id/transactions`, requireAdmin, wrap(async (req, res) => {
      res.json({
        transactions: await q(
          "SELECT * FROM inventory_transactions WHERE ingredient_id = ? ORDER BY created_at DESC, id DESC LIMIT 300",
          [parseInt(req.params.id, 10)]
        ),
      });
    }));

    app.get(`${B}/transactions.csv`, requireAdmin, wrap(async (_req, res) => {
      const rows = await q(`SELECT t.*, i.name AS ingredient_name FROM inventory_transactions t
                            LEFT JOIN ingredients i ON i.id = t.ingredient_id
                            ORDER BY t.created_at DESC LIMIT 5000`);
      sendCsv(res, "transactions", ["created_at", "ingredient", "type", "quantity", "unit_cost", "reference_type", "reference_id", "note", "created_by"],
        rows.map((r) => [r.created_at, r.ingredient_name || "", r.transaction_type, r.quantity, r.unit_cost ?? "", r.reference_type || "", r.reference_id || "", r.note || "", r.created_by || ""]));
    }));

    app.post(`${B}/ingredients/:id/adjust`, requireAdmin, wrap(async (req, res) => {
      const id = parseInt(req.params.id, 10);
      const qty = dec(req.body?.quantity);
      if (!qty) return res.status(400).json({ error: "Quantité requise" });
      const type = ["manual_add", "manual_remove", "correction", "return_to_supplier"].includes(req.body?.transaction_type)
        ? req.body.transaction_type
        : (qty > 0 ? "manual_add" : "manual_remove");
      const delta = type === "manual_add" ? Math.abs(qty)
        : type === "correction" ? qty
          : -Math.abs(qty);
      const after = await applyStock(id, delta, {
        transaction_type: type, reference_type: "manual",
        note: clean(req.body?.note, 300), created_by: "admin",
      });
      if (after == null) return res.status(404).json({ error: "Ingrédient introuvable" });
      res.json({ ok: true, current_stock: after });
    }));

    // ---- Suppliers ----
    app.get(`${B}/suppliers`, requireAdmin, wrap(async (_req, res) => {
      const suppliers = await q("SELECT * FROM suppliers ORDER BY name ASC");
      const counts = await q("SELECT supplier_id, COUNT(*) AS n FROM ingredients WHERE active = 1 GROUP BY supplier_id");
      const m = new Map(counts.map((c) => [c.supplier_id, Number(c.n)]));
      res.json({ suppliers: suppliers.map((s) => ({ ...s, ingredient_count: m.get(s.id) || 0 })) });
    }));
    app.post(`${B}/suppliers`, requireAdmin, wrap(async (req, res) => {
      const name = clean(req.body?.name, 160);
      if (!name) return res.status(400).json({ error: "Nom requis" });
      const id = await insertId(
        "INSERT INTO suppliers (name, contact_name, phone, email, address, active) VALUES (?,?,?,?,?,?)",
        [name, clean(req.body?.contact_name, 160), clean(req.body?.phone, 40), clean(req.body?.email, 200),
          clean(req.body?.address, 300), req.body?.active === false ? 0 : 1]
      );
      res.json({ ok: true, id });
    }));
    app.patch(`${B}/suppliers/:id`, requireAdmin, wrap(async (req, res) => {
      const sets = []; const params = [];
      const map = {
        name: (v) => clean(v, 160), contact_name: (v) => clean(v, 160), phone: (v) => clean(v, 40),
        email: (v) => clean(v, 200), address: (v) => clean(v, 300), active: (v) => (v ? 1 : 0),
      };
      for (const [k, fn] of Object.entries(map)) {
        if (req.body?.[k] !== undefined) { sets.push(`${k} = ?`); params.push(fn(req.body[k])); }
      }
      if (!sets.length) return res.json({ ok: true });
      params.push(parseInt(req.params.id, 10));
      await q(`UPDATE suppliers SET ${sets.join(", ")}, updated_at = ${NOW()} WHERE id = ?`, params);
      res.json({ ok: true });
    }));
    app.delete(`${B}/suppliers/:id`, requireAdmin, wrap(async (req, res) => {
      const id = parseInt(req.params.id, 10);
      await q("UPDATE ingredients SET supplier_id = NULL WHERE supplier_id = ?", [id]);
      await q("DELETE FROM suppliers WHERE id = ?", [id]);
      res.json({ ok: true });
    }));

    // ---- Recipes ----
    app.get(`${B}/recipes`, requireAdmin, wrap(async (req, res) => {
      const params = [];
      let sql = `SELECT r.*, i.name AS ingredient_name, i.unit AS stock_unit, i.average_unit_cost
                 FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id`;
      if (req.query.menu_item_id) { sql += " WHERE r.menu_item_id = ?"; params.push(String(req.query.menu_item_id)); }
      sql += " ORDER BY r.menu_item_id, i.name";
      const rows = await q(sql, params);
      const recipes = rows.map((r) => ({
        ...r,
        line_cost: mulDec(convert(r.quantity_required, r.unit, r.stock_unit), r.average_unit_cost),
      }));
      res.json({ recipes });
    }));
    app.post(`${B}/recipes`, requireAdmin, wrap(async (req, res) => {
      const menuItemId = clean(req.body?.menu_item_id, 80);
      const ingredientId = parseInt(req.body?.ingredient_id, 10);
      if (!menuItemId || !ingredientId) return res.status(400).json({ error: "Article et ingrédient requis" });
      const unit = UNITS.includes(req.body?.unit) ? req.body.unit : "g";
      const qty = dec(req.body?.quantity_required);
      const existing = await qOne("SELECT id FROM recipes WHERE menu_item_id = ? AND ingredient_id = ?", [menuItemId, ingredientId]);
      if (existing) {
        await q(`UPDATE recipes SET quantity_required = ?, unit = ?, updated_at = ${NOW()} WHERE id = ?`, [qty, unit, existing.id]);
      } else {
        await insertId("INSERT INTO recipes (menu_item_id, ingredient_id, quantity_required, unit) VALUES (?,?,?,?)",
          [menuItemId, ingredientId, qty, unit]);
      }
      try { realtime?.emitAdmin("recipe_updated", { menu_item_id: menuItemId }); } catch (_) {}
      res.json({ ok: true });
    }));
    app.patch(`${B}/recipes/:id`, requireAdmin, wrap(async (req, res) => {
      const unit = UNITS.includes(req.body?.unit) ? req.body.unit : null;
      const sets = ["quantity_required = ?"]; const params = [dec(req.body?.quantity_required)];
      if (unit) { sets.push("unit = ?"); params.push(unit); }
      params.push(parseInt(req.params.id, 10));
      await q(`UPDATE recipes SET ${sets.join(", ")}, updated_at = ${NOW()} WHERE id = ?`, params);
      try { realtime?.emitAdmin("recipe_updated", { id: parseInt(req.params.id, 10) }); } catch (_) {}
      res.json({ ok: true });
    }));
    app.delete(`${B}/recipes/:id`, requireAdmin, wrap(async (req, res) => {
      await q("DELETE FROM recipes WHERE id = ?", [parseInt(req.params.id, 10)]);
      try { realtime?.emitAdmin("recipe_updated", { deleted: parseInt(req.params.id, 10) }); } catch (_) {}
      res.json({ ok: true });
    }));

    // ---- Purchases ----
    app.get(`${B}/purchases`, requireAdmin, wrap(async (_req, res) => {
      res.json({
        purchases: await q(`SELECT p.*, s.name AS supplier_name FROM purchase_orders p
                            LEFT JOIN suppliers s ON s.id = p.supplier_id
                            ORDER BY p.created_at DESC LIMIT 300`),
      });
    }));
    app.get(`${B}/purchases.csv`, requireAdmin, wrap(async (_req, res) => {
      const rows = await q(`SELECT p.id, p.created_at, p.status, p.total, p.received_at, s.name AS supplier_name,
                                   i.name AS ingredient_name, poi.quantity, poi.unit_cost, poi.received_quantity
                            FROM purchase_orders p
                            LEFT JOIN suppliers s ON s.id = p.supplier_id
                            LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = p.id
                            LEFT JOIN ingredients i ON i.id = poi.ingredient_id
                            ORDER BY p.created_at DESC LIMIT 5000`);
      sendCsv(res, "achats", ["po_id", "created_at", "status", "supplier", "ingredient", "quantity", "unit_cost", "received_quantity", "po_total", "received_at"],
        rows.map((r) => [r.id, r.created_at, r.status, r.supplier_name || "", r.ingredient_name || "", r.quantity ?? "", r.unit_cost ?? "", r.received_quantity ?? "", r.total, r.received_at || ""]));
    }));
    app.get(`${B}/purchases/:id`, requireAdmin, wrap(async (req, res) => {
      const id = parseInt(req.params.id, 10);
      const purchase = await qOne(`SELECT p.*, s.name AS supplier_name FROM purchase_orders p
                                   LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`, [id]);
      if (!purchase) return res.status(404).json({ error: "Introuvable" });
      const items = await q(`SELECT poi.*, i.name AS ingredient_name, i.unit
                             FROM purchase_order_items poi
                             LEFT JOIN ingredients i ON i.id = poi.ingredient_id
                             WHERE poi.purchase_order_id = ?`, [id]);
      res.json({ purchase, items });
    }));
    app.post(`${B}/purchases`, requireAdmin, wrap(async (req, res) => {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      let subtotal = 0;
      for (const it of items) subtotal = addDec(subtotal, mulDec(dec(it.quantity), dec(it.unit_cost)));
      const tax = dec(req.body?.tax);
      const total = addDec(subtotal, tax);
      const id = await insertId(
        "INSERT INTO purchase_orders (supplier_id, status, subtotal, tax, total, expected_at, notes) VALUES (?,?,?,?,?,?,?)",
        [req.body?.supplier_id ? parseInt(req.body.supplier_id, 10) : null, "ordered",
          subtotal, tax, total, clean(req.body?.expected_at, 40), clean(req.body?.notes, 500)]
      );
      for (const it of items) {
        if (!it.ingredient_id) continue;
        await q("INSERT INTO purchase_order_items (purchase_order_id, ingredient_id, quantity, unit_cost) VALUES (?,?,?,?)",
          [id, parseInt(it.ingredient_id, 10), dec(it.quantity), dec(it.unit_cost)]);
      }
      res.json({ ok: true, id });
    }));
    app.patch(`${B}/purchases/:id`, requireAdmin, wrap(async (req, res) => {
      const status = ["draft", "ordered", "partial", "received", "cancelled"].includes(req.body?.status) ? req.body.status : null;
      const sets = []; const params = [];
      if (status) { sets.push("status = ?"); params.push(status); }
      if (req.body?.notes !== undefined) { sets.push("notes = ?"); params.push(clean(req.body.notes, 500)); }
      if (req.body?.expected_at !== undefined) { sets.push("expected_at = ?"); params.push(clean(req.body.expected_at, 40)); }
      if (!sets.length) return res.json({ ok: true });
      params.push(parseInt(req.params.id, 10));
      await q(`UPDATE purchase_orders SET ${sets.join(", ")}, updated_at = ${NOW()} WHERE id = ?`, params);
      res.json({ ok: true });
    }));
    // Receive partial or full: body.lines = [{ item_id, received_quantity }]
    app.post(`${B}/purchases/:id/receive`, requireAdmin, wrap(async (req, res) => {
      const poId = parseInt(req.params.id, 10);
      const items = await q("SELECT * FROM purchase_order_items WHERE purchase_order_id = ?", [poId]);
      const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
      const byId = new Map(lines.map((l) => [parseInt(l.item_id, 10), dec(l.received_quantity)]));

      for (const it of items) {
        const target = byId.has(it.id) ? byId.get(it.id) : dec(it.quantity); // default: receive everything
        const already = dec(it.received_quantity);
        const delta = dec(target) - already;
        if (delta <= 0) continue;
        const ing = await getIngredient(it.ingredient_id);
        if (!ing) continue;
        // weighted average unit cost
        const oldQty = Math.max(0, dec(ing.current_stock));
        const oldVal = mulDec(oldQty, ing.average_unit_cost);
        const newVal = mulDec(delta, it.unit_cost);
        const newAvg = oldQty + delta > 0 ? dec((oldVal + newVal) / (oldQty + delta)) : dec(it.unit_cost);
        await q(`UPDATE ingredients SET average_unit_cost = ?, updated_at = ${NOW()} WHERE id = ?`, [newAvg, ing.id]);
        await applyStock(ing.id, delta, {
          transaction_type: "purchase", unit_cost: dec(it.unit_cost),
          reference_type: "purchase_order", reference_id: poId,
          note: `Réception BC #${poId}`, created_by: "admin",
        });
        await q("UPDATE purchase_order_items SET received_quantity = ? WHERE id = ?", [dec(target), it.id]);
      }

      const after = await q("SELECT quantity, received_quantity FROM purchase_order_items WHERE purchase_order_id = ?", [poId]);
      const full = after.every((r) => dec(r.received_quantity) >= dec(r.quantity));
      const any = after.some((r) => dec(r.received_quantity) > 0);
      const status = full ? "received" : any ? "partial" : "ordered";
      await q(
        `UPDATE purchase_orders SET status = ?, received_at = ${full ? NOW() : "received_at"}, updated_at = ${NOW()} WHERE id = ?`,
        [status, poId]
      );
      try { realtime?.emitAdmin("purchase_received", { purchase_order_id: poId, status }); } catch (_) {}
      res.json({ ok: true, status });
    }));

    // ---- Waste ----
    app.get(`${B}/waste`, requireAdmin, wrap(async (_req, res) => {
      res.json({
        waste: await q(`SELECT w.*, i.name AS ingredient_name, i.unit FROM waste_logs w
                        LEFT JOIN ingredients i ON i.id = w.ingredient_id
                        ORDER BY w.created_at DESC LIMIT 500`),
      });
    }));
    app.get(`${B}/waste.csv`, requireAdmin, wrap(async (_req, res) => {
      const rows = await q(`SELECT w.*, i.name AS ingredient_name, i.unit FROM waste_logs w
                            LEFT JOIN ingredients i ON i.id = w.ingredient_id
                            ORDER BY w.created_at DESC LIMIT 5000`);
      sendCsv(res, "pertes", ["created_at", "ingredient", "quantity", "unit", "reason", "estimated_cost", "note"],
        rows.map((r) => [r.created_at, r.ingredient_name || "", r.quantity, r.unit || "", r.reason, r.estimated_cost, r.note || ""]));
    }));
    app.post(`${B}/waste`, requireAdmin, wrap(async (req, res) => {
      const ingredientId = parseInt(req.body?.ingredient_id, 10);
      const qty = Math.abs(dec(req.body?.quantity));
      if (!ingredientId || !qty) return res.status(400).json({ error: "Ingrédient et quantité requis" });
      const ing = await getIngredient(ingredientId);
      if (!ing) return res.status(404).json({ error: "Ingrédient introuvable" });
      const cost = mulDec(qty, ing.average_unit_cost);
      await q("INSERT INTO waste_logs (ingredient_id, quantity, reason, estimated_cost, note) VALUES (?,?,?,?,?)",
        [ingredientId, qty, clean(req.body?.reason, 60) || "other", cost, clean(req.body?.note, 300)]);
      await applyStock(ingredientId, -qty, {
        transaction_type: "waste", unit_cost: dec(ing.average_unit_cost),
        reference_type: "waste", note: clean(req.body?.note, 300), created_by: "admin",
      });
      try { realtime?.emitAdmin("waste_recorded", { ingredient_id: ingredientId, quantity: qty, cost }); } catch (_) {}
      res.json({ ok: true, estimated_cost: cost });
    }));

    // ---- Metrics / low stock ----
    app.get(`${B}/metrics`, requireAdmin, wrap(async (_req, res) => res.json(await metrics())));
    app.get(`${B}/low-stock`, requireAdmin, wrap(async (_req, res) => res.json({ ingredients: await lowStock() })));
  }

  return { init, mount, deductForOrder, restoreForOrder, onOrderStatus, metrics, lowStock, UNITS };
}

module.exports = { createInventory, UNITS };

/* eslint-disable */
// =====================================================================
// server-ai.cjs — Deli Aden menu concierge backend (Turn 7, tranche 2)
//
// Endpoints:
//   POST /api/ai/menu-search   { query, language, sessionContext }
//   POST /api/ai/translate     { texts:[], language }
//
// Guarantees:
//   * Local intelligent search always works, with or without AI.
//   * Context is built from the LIVE menu only: admin overrides applied,
//     hidden categories excluded, unavailable items flagged, live prices.
//   * The model can only PICK from supplied product ids; every id it returns
//     is re-validated against the live menu before being sent to the client.
//   * No admin / inventory / customer / payment data ever enters the prompt.
//   * If AI is disabled or fails -> local results are returned.
//
// Env:
//   AI_ENABLED=false
//   OPENAI_API_KEY=
//   AI_MODEL=gpt-4o-mini
//   AI_BASE_URL=https://api.openai.com/v1   (optional override)
// =====================================================================
const fs = require("fs");
const path = require("path");

const CATALOG_PATH = path.join(__dirname, "menu-catalog.json");

let CATALOG = { categories: [], comboDelta: 0 };
try {
  CATALOG = JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
} catch (e) {
  console.warn("[ai] menu-catalog.json unreadable — AI/search context will be empty:", e.message);
}

const AI_ENABLED = String(process.env.AI_ENABLED || "").toLowerCase() === "true";
const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const AI_BASE_URL = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const AI_TIMEOUT_MS = Math.max(2000, parseInt(process.env.AI_TIMEOUT_MS || "9000", 10) || 9000);

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const sanitizeQuery = (v) =>
  String(v == null ? "" : v)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);

const LANGS = ["fr", "en", "es"];
const pickLang = (v) => (LANGS.includes(String(v || "").toLowerCase()) ? String(v).toLowerCase() : "fr");

// ---------------------------------------------------------------------
// Live catalog (overrides + hidden categories + availability)
// ---------------------------------------------------------------------
function buildLiveMenu(overrides, settings) {
  const ov = new Map();
  for (const o of overrides || []) ov.set(o.item_id, o);
  const hidden = new Set(
    String((settings && settings.hidden_categories) || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const out = [];
  for (const cat of CATALOG.categories || []) {
    if (hidden.has(cat.id)) continue;
    for (const item of cat.items || []) {
      const o = ov.get(item.id);
      const priceOverride = o && o.price_override != null ? Number(o.price_override) : null;
      out.push({
        id: item.id,
        name: item.name,
        description: (o && o.description_override) || item.description || "",
        price: priceOverride != null && Number.isFinite(priceOverride) ? priceOverride : Number(item.price),
        image: (o && o.image_override) || item.image,
        categoryId: cat.id,
        categoryName: cat.name,
        available: !(o && o.available === false),
        hasOptions: (item.options && item.options.length > 0) || Boolean(item.combo),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// Local intent search (mirror of src/lib/menu-search.ts)
// ---------------------------------------------------------------------
const TAG_RULES = [
  { tag: "spicy", words: ["epice", "epicee", "piquant", "harissa", "spicy", "hot", "picante"], match: ["harissa", "merguez", "piquant", "epice"] },
  { tag: "mild", words: ["pas trop epice", "doux", "mild", "sin picante", "pas epice", "not spicy"], avoid: ["harissa", "merguez", "piquant"] },
  { tag: "chicken", words: ["poulet", "chicken", "pollo"], match: ["poulet", "chicken"] },
  { tag: "fish", words: ["poisson", "fish", "pescado", "crevette", "shrimp"], match: ["poisson", "crevette", "saumon", "tilapia", "sardine"] },
  { tag: "meat", words: ["viande", "boeuf", "beef", "agneau", "lamb", "carne"], match: ["viande", "boeuf", "agneau", "kefta", "merguez"] },
  { tag: "veggie", words: ["sans viande", "vegetarien", "vegetarian", "vegetariano", "legumes", "veggie"], match: ["legume", "salade", "falafel", "vegetarien"], avoid: ["poulet", "boeuf", "viande", "agneau", "merguez", "poisson"] },
  { tag: "dessert", words: ["dessert", "sucre", "gateau", "postre", "sweet"], categories: ["desserts", "patisseries"] },
  { tag: "drink", words: ["boisson", "drink", "cafe", "the", "bebida", "soda"], categories: ["boissons", "cafes"] },
  { tag: "grill", words: ["grillade", "grill", "brochette", "asado", "bbq"], categories: ["grillades"] },
  { tag: "fastfood", words: ["burger", "sandwich", "poutine", "fast food", "frites"], categories: ["fast-food", "sandwichs", "burgers"] },
];

function detectIntent(query) {
  const q = norm(query);
  const tags = [];
  const categoryHints = [];
  for (const rule of TAG_RULES) {
    if (rule.words.some((w) => q.includes(norm(w)))) {
      tags.push(rule.tag);
      for (const c of rule.categories || []) categoryHints.push(c);
    }
  }
  let maxPrice;
  const priceMatch = q.match(/(?:moins de|sous|under|menos de|max(?:imum)?)\s*(\d+(?:[.,]\d+)?)/);
  if (priceMatch) maxPrice = parseFloat(priceMatch[1].replace(",", "."));
  const dollar = q.match(/(\d+(?:[.,]\d+)?)\s*\$/);
  if (!maxPrice && dollar && /moins|sous|under|menos|budget|max/.test(q)) maxPrice = parseFloat(dollar[1].replace(",", "."));
  let people;
  const two = q.match(/(?:pour|para|for)\s*(\d)\s*(?:personnes?|people|personas?)/);
  if (two) people = parseInt(two[1], 10);
  return { tags, categoryHints, maxPrice, people, raw: query };
}

function localSearch(query, live, limit) {
  const q = norm(query);
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  const intent = detectIntent(query);
  const hits = [];
  for (const it of live) {
    const hay = norm(`${it.name} ${it.description} ${it.categoryName}`);
    let score = 0;
    const reasons = [];

    if (q && hay.includes(q)) score += 60;
    for (const w of words) if (hay.includes(w)) score += 12;
    if (intent.categoryHints.includes(it.categoryId)) {
      score += 25;
      reasons.push(it.categoryName);
    }
    for (const tag of intent.tags) {
      const rule = TAG_RULES.find((r) => r.tag === tag);
      if (!rule) continue;
      if (rule.match && rule.match.some((m) => hay.includes(norm(m)))) {
        score += 22;
        reasons.push(tag);
      }
      if (rule.avoid && rule.avoid.some((m) => hay.includes(norm(m)))) score -= 30;
      if (rule.avoid && !rule.avoid.some((m) => hay.includes(norm(m)))) score += 6;
    }
    if (intent.maxPrice != null) {
      if (it.price <= intent.maxPrice) score += 18;
      else score -= 40;
    }
    if (!it.available) score -= 25;
    if (score > 0) hits.push({ item: it, score, reason: reasons.slice(0, 2).join(" · ") || undefined });
  }
  hits.sort((a, b) => b.score - a.score || a.item.price - b.item.price);
  return { intent, hits: hits.slice(0, limit || 8) };
}

const SUGGESTED = {
  fr: ["Poulet pas trop épicé", "Moins de 15 $", "Quelque chose d'épicé", "Un dessert maison", "Repas pour deux"],
  en: ["Chicken, not too spicy", "Under $15", "Something spicy", "A homemade dessert", "Meal for two"],
  es: ["Pollo no muy picante", "Menos de 15 $", "Algo picante", "Un postre casero", "Comida para dos"],
};

const ANSWERS = {
  fr: {
    none: "Je ne trouve rien qui corresponde exactement. Essayez une autre envie ou parcourez le menu.",
    some: (n) => `Voici ${n} suggestion${n > 1 ? "s" : ""} du menu du jour.`,
    closed: "Le restaurant est actuellement fermé, mais voici ce que vous pourrez commander.",
    paused: "Les commandes sont temporairement suspendues. Voici quand même nos suggestions.",
  },
  en: {
    none: "I can't find an exact match. Try another craving or browse the menu.",
    some: (n) => `Here ${n > 1 ? "are" : "is"} ${n} suggestion${n > 1 ? "s" : ""} from today's menu.`,
    closed: "The restaurant is currently closed, but here is what you'll be able to order.",
    paused: "Orders are paused right now. Here are our suggestions anyway.",
  },
  es: {
    none: "No encuentro nada que coincida. Prueba otra idea o mira el menú.",
    some: (n) => `Aquí ${n > 1 ? "hay" : "está"} ${n} sugerencia${n > 1 ? "s" : ""} del menú de hoy.`,
    closed: "El restaurante está cerrado ahora, pero esto es lo que podrás pedir.",
    paused: "Los pedidos están pausados. Aun así, estas son nuestras sugerencias.",
  },
};

// ---------------------------------------------------------------------
// Optional AI re-ranking — selection only, never generation of products
// ---------------------------------------------------------------------
async function aiSelect({ query, language, candidates, restaurant }) {
  const key = process.env.OPENAI_API_KEY;
  if (!AI_ENABLED || !key) return null;

  const allowed = candidates.map((c) => ({
    id: c.id,
    name: c.name,
    description: (c.description || "").slice(0, 180),
    price: c.price,
    category: c.categoryName,
    available: c.available,
  }));

  const system = [
    "You are the menu concierge for a single Algerian restaurant.",
    "You may ONLY recommend products from the provided catalog, by their exact id.",
    "Never invent products, prices, ingredients, allergens or availability.",
    "If a detail is not in the catalog, say it is unknown and suggest asking the restaurant.",
    "Stay strictly on menu and ordering topics. Answer in 1-2 short sentences.",
    `Answer in this language code: ${language}.`,
    "Return ONLY JSON: {\"answer\":string,\"detectedIntent\":string,\"productIds\":string[],\"reasons\":{[id:string]:string},\"suggestedQueries\":string[]}",
  ].join(" ");

  const user = JSON.stringify({
    query,
    restaurant,
    catalog: allowed,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      console.warn("[ai] upstream", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const json = await res.json();
    const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    return {
      answer: typeof parsed.answer === "string" ? parsed.answer.slice(0, 400) : "",
      detectedIntent: typeof parsed.detectedIntent === "string" ? parsed.detectedIntent.slice(0, 80) : "",
      productIds: Array.isArray(parsed.productIds) ? parsed.productIds.filter((x) => typeof x === "string").slice(0, 8) : [],
      reasons: parsed.reasons && typeof parsed.reasons === "object" ? parsed.reasons : {},
      suggestedQueries: Array.isArray(parsed.suggestedQueries)
        ? parsed.suggestedQueries.filter((x) => typeof x === "string").slice(0, 4)
        : [],
    };
  } catch (e) {
    console.warn("[ai] menu-search failed:", e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function aiTranslate({ texts, language }) {
  const key = process.env.OPENAI_API_KEY;
  if (!AI_ENABLED || !key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Translate restaurant menu copy for customers. Keep authentic dish names in their original language. " +
              `Target language code: ${language}. Return ONLY {"translations":string[]} in the same order.`,
          },
          { role: "user", content: JSON.stringify({ texts }) },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    const parsed = content ? JSON.parse(content) : null;
    const out = parsed && Array.isArray(parsed.translations) ? parsed.translations : null;
    return out && out.length === texts.length ? out.map((t) => String(t).slice(0, 1000)) : null;
  } catch (e) {
    console.warn("[ai] translate failed:", e.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------
function createAi({ dbApi, rateLimit, publicSettings }) {
  const limiter = rateLimit({ windowMs: 60 * 1000, max: 30, keyPrefix: "ai" });

  async function liveContext() {
    let overrides = [];
    try {
      overrides = await dbApi.getMenuOverrides();
    } catch (e) {
      console.warn("[ai] overrides unavailable:", e.message);
    }
    const settings = publicSettings ? publicSettings() : {};
    return { live: buildLiveMenu(overrides, settings), settings };
  }

  function mount(app) {
    app.post("/api/ai/menu-search", limiter, async (req, res) => {
      try {
        const query = sanitizeQuery(req.body && req.body.query);
        const language = pickLang(req.body && req.body.language);
        const ctxRaw = req.body && req.body.sessionContext;
        const sessionContext = {
          orderType: ctxRaw && ctxRaw.orderType === "delivery" ? "delivery" : ctxRaw && ctxRaw.orderType === "pickup" ? "pickup" : null,
          cartItemIds: Array.isArray(ctxRaw && ctxRaw.cartItemIds)
            ? ctxRaw.cartItemIds.filter((x) => typeof x === "string").slice(0, 20)
            : [],
        };
        if (!query) return res.status(400).json({ error: "Requête vide" });

        const { live, settings } = await liveContext();
        const restaurant = {
          isOpen: Boolean(settings.is_open),
          ordersPaused: Boolean(settings.orders_paused),
          pickupEnabled: Boolean(settings.pickup_enabled),
          deliveryEnabled: Boolean(settings.delivery_enabled),
          pickupEtaMinutes: Number(settings.est_pickup_min) || null,
          deliveryEtaMinutes: Number(settings.est_delivery_min) || null,
          currency: "CAD",
        };

        const orderable = live.filter((i) => i.available);
        const { intent, hits } = localSearch(query, orderable, 8);
        const A = ANSWERS[language] || ANSWERS.fr;

        const toProduct = (it, reason) => ({
          id: it.id,
          name: it.name,
          price: it.price,
          image: it.image,
          reason: reason || undefined,
          available: it.available,
          hasOptions: it.hasOptions,
          categoryName: it.categoryName,
        });

        let products = hits.map((h) => toProduct(h.item, h.reason));
        let answer = products.length ? A.some(products.length) : A.none;
        let detectedIntent = intent.tags.length ? intent.tags.join("+") : products.length ? "menu_lookup" : "unknown";
        let suggestedQueries = SUGGESTED[language] || SUGGESTED.fr;
        let source = "local";

        const confident = hits.length > 0 && hits[0].score >= 60;
        if (!confident && AI_ENABLED && process.env.OPENAI_API_KEY) {
          const candidates = (hits.length ? hits.map((h) => h.item) : orderable).slice(0, 40);
          const ai = await aiSelect({ query, language, candidates, restaurant });
          if (ai) {
            const byId = new Map(orderable.map((i) => [i.id, i]));
            // Re-validate every id against the live menu — drop anything invented.
            const validated = ai.productIds.map((id) => byId.get(id)).filter(Boolean);
            if (validated.length) {
              products = validated.map((it) => toProduct(it, ai.reasons[it.id]));
              source = "ai";
            }
            if (ai.answer) answer = ai.answer;
            if (ai.detectedIntent) detectedIntent = ai.detectedIntent;
            if (ai.suggestedQueries && ai.suggestedQueries.length) suggestedQueries = ai.suggestedQueries;
          }
        }

        if (!restaurant.isOpen) answer = `${A.closed} ${answer}`;
        else if (restaurant.ordersPaused) answer = `${A.paused} ${answer}`;

        res.json({
          answer,
          detectedIntent,
          products,
          suggestedQueries,
          meta: { source, aiEnabled: AI_ENABLED, language, restaurant, context: sessionContext },
        });
      } catch (err) {
        console.error("[ai] menu-search", err);
        res.status(500).json({ error: "Assistant indisponible" });
      }
    });

    app.post("/api/ai/translate", limiter, async (req, res) => {
      try {
        const language = pickLang(req.body && req.body.language);
        const texts = Array.isArray(req.body && req.body.texts)
          ? req.body.texts.filter((t) => typeof t === "string").slice(0, 25).map((t) => sanitizeQuery(t).slice(0, 500))
          : [];
        if (!texts.length) return res.status(400).json({ error: "Aucun texte" });
        const out = await aiTranslate({ texts, language });
        res.json({ translations: out || texts, translated: Boolean(out), language });
      } catch (err) {
        console.error("[ai] translate", err);
        res.status(500).json({ error: "Traduction indisponible" });
      }
    });

    app.get("/api/ai/status", (_req, res) => {
      res.json({
        enabled: AI_ENABLED,
        configured: Boolean(process.env.OPENAI_API_KEY),
        model: AI_ENABLED ? AI_MODEL : null,
        catalogItems: (CATALOG.categories || []).reduce((n, c) => n + (c.items || []).length, 0),
      });
    });
  }

  return { mount, buildLiveMenu, localSearch };
}

module.exports = { createAi };

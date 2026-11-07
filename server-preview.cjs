"use strict";
const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const fs = require("node:fs");
const path = require("node:path");

const message = "Le menu est en aperçu. Les commandes, paiements et comptes seront disponibles après l'ouverture du service.";
function createPreviewApp(dist = path.join(__dirname, "dist")) {
  if (!fs.existsSync(path.join(dist, "index.html"))) throw new Error("Packaged SPA index.html is required");
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(compression());
  app.use((_req, res, next) => {
    res.set({ "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" });
    next();
  });
  app.get("/healthz", (_req, res) => res.type("text/plain").send("preview-ok"));
  app.get("/api/health", (_req, res) => res.json({ ok: true, mode: "preview", orderingEnabled: false }));
  app.get("/api/settings", (_req, res) => res.json({ settings: {
    preview_mode: true, is_open: false, orders_paused: true, pickup_enabled: false, delivery_enabled: false,
    est_pickup_min: 0, est_delivery_min: 0, min_order: 0, delivery_fee: 0,
    free_delivery_threshold: 0, gst_rate: 0.05, qst_rate: 0.09975,
    restaurant_name: "Les Délices d'Aden", restaurant_phone: "", restaurant_address: "",
    restaurant_email: "", google_maps_url: "", opening_hours: "À confirmer",
    order_pause_message: message, closed_message: message, hidden_categories: "", delivery_zone_text: "À confirmer",
  } }));
  app.get("/api/menu/overrides", (_req, res) => res.json({ overrides: [] }));
  app.get("/api/payments/config", (_req, res) => res.json({ enabled: false, publishableKey: null }));
  // No DB, auth, payment SDK, AI, email, SMS or merchant relay module is loaded.
  app.use("/api", (_req, res) => res.status(503).json({ error: message, code: "PREVIEW_ONLY" }));
  app.get("/robots.txt", (_req, res) => res.type("text/plain").send("User-agent: *\nDisallow: /\n"));
  app.use((req, res, next) => {
    if (req.path.split("/").some(segment => segment.startsWith(".")) || /^\/(mcp|data)(?:\/|$)/.test(req.path)) return res.sendStatus(404);
    next();
  });
  app.use(express.static(dist, { index: false, redirect: false, dotfiles: "deny" }));
  app.use((req, res) => {
    if (!["GET", "HEAD"].includes(req.method) || path.extname(req.path)) return res.sendStatus(404);
    res.sendFile("index.html", { root: dist });
  });
  return app;
}
function startPreview() {
  const server = createPreviewApp().listen(Number(process.env.PORT || 3000), "0.0.0.0", () => console.log("[Deli Aden] Read-only preview ready; commercial services disabled"));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
  return server;
}
module.exports = { createPreviewApp, startPreview };

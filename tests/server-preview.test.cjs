"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPreviewApp } = require("../server-preview.cjs");

test("production preview is read-only and never exposes auth, providers or private files", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deli-preview-"));
  fs.writeFileSync(path.join(dir, "index.html"), "<html><body>menu preview</body></html>");
  const server = createPreviewApp(dir).listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  t.after(() => { server.close(); server.closeAllConnections(); fs.rmSync(dir, { recursive: true }); });
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const route of ["/", "/menu", "/checkout", "/admin", "/customer/login"]) {
    const r = await fetch(url + route);
    assert.equal(r.status, 200); assert.match(r.headers.get("x-robots-tag"), /noindex/);
  }
  assert.equal(await (await fetch(url + "/healthz")).text(), "preview-ok");
  const { settings } = await (await fetch(url + "/api/settings")).json();
  assert.equal(settings.preview_mode, true); assert.equal(settings.is_open, false);
  assert.equal(settings.pickup_enabled, false); assert.equal(settings.delivery_enabled, false);
  assert.deepEqual(await (await fetch(url + "/api/payments/config")).json(), { enabled: false, publishableKey: null });
  for (const route of ["/api/orders", "/api/admin/verify", "/api/customers/register", "/api/contact", "/api/webhooks/stripe", "/api/payments/create-intent", "/api/ai/menu-search"]) {
    const r = await fetch(url + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(r.status, 503, route); assert.equal((await r.json()).code, "PREVIEW_ONLY");
  }
  for (const route of ["/api/admin/orders", "/api/customers/me", "/api/orders/DA-TEST", "/api/admin/events"]) assert.equal((await fetch(url + route)).status, 503, route);
  for (const route of ["/missing.js", "/.env", "/data/deli-aden.db", "/mcp", "/.mcp/list-tools"]) assert.equal((await fetch(url + route)).status, 404, route);
  assert.match(await (await fetch(url + "/robots.txt")).text(), /Disallow: \//);
});

import assert from 'node:assert/strict';
const base = process.argv[2];
const revision = process.argv[3];
assert.ok(base && /^[0-9a-f]{40}$/.test(revision), 'base URL and full revision are required');
const manifestResponse = await fetch(`${base}/release-manifest.json`);
assert.equal(manifestResponse.status, 200);
const manifest = await manifestResponse.json();
assert.equal(manifest.revision, revision);
assert.equal(manifest.defaultMode, 'preview');
assert.equal(manifest.orderingEnabledByDefault, false);
assert.match(manifest.sourceDigest, /^[0-9a-f]{64}$/);
assert.equal(await (await fetch(`${base}/healthz`)).text(), 'preview-ok');
for (const route of ['/', '/menu', '/checkout', '/admin', '/contact']) {
  const r = await fetch(base + route);
  assert.equal(r.status, 200, route);
  assert.match(r.headers.get('x-robots-tag'), /noindex/);
  assert.match(await r.text(), /<html/);
}
const { settings } = await (await fetch(`${base}/api/settings`)).json();
assert.equal(settings.preview_mode, true); assert.equal(settings.is_open, false);
assert.equal(settings.pickup_enabled, false); assert.equal(settings.delivery_enabled, false);
for (const route of ['/api/orders', '/api/admin/verify', '/api/customers/register', '/api/contact', '/api/webhooks/stripe', '/api/payments/create-intent']) {
  assert.equal((await fetch(base + route, {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,503,route);
}
for (const route of ['/api/admin/orders', '/api/customers/me']) assert.equal((await fetch(base + route)).status,503,route);
for (const route of ['/.env','/data/deli-aden.db','/missing.js','/mcp']) assert.equal((await fetch(base + route)).status,404,route);
const html = await (await fetch(base)).text();
const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/g)].map(m=>m[1]))];
assert.ok(assets.length > 0);
for (const asset of assets) {
  const r = await fetch(base + asset); assert.equal(r.status,200,asset);
  assert.doesNotMatch(await r.text(), /ci-build-only|\.supabase\.co|createSupabaseClient/);
}
console.log(JSON.stringify({...manifest, passed:true, routes:5, assets:assets.length}));

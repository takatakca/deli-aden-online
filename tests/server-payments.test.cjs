"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const Database = require("better-sqlite3");
const Stripe = require("stripe");
const { mountPayments, webhookHandler } = require("../server-payments.cjs");

test("signed webhook HTTP and database regression suite (synthetic, no Stripe requests)", async (t) => {
  process.env.STRIPE_SECRET_KEY = "sk_test_local_synthetic_only";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_local_synthetic_only";
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const db = new Database(":memory:");
  db.exec("CREATE TABLE orders(id INTEGER PRIMARY KEY,total REAL,payment_status TEXT,stripe_payment_intent_id TEXT)");
  const emitted = [];
  const app = express();
  app.post("/webhook", express.raw({ type: "application/json" }), webhookHandler());
  app.use(express.json());
  await mountPayments(app, { kind: "sqlite", sqliteDb: db, requireAdmin: (_q,r) => r.sendStatus(401), rateLimit: () => (_q,_r,next) => next(), emitOrderById: async (...args) => emitted.push(args) });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(r => server.once("listening", r));
  t.after(() => { server.close(); server.closeAllConnections(); db.close(); });
  const url = `http://127.0.0.1:${server.address().port}/webhook`;
  const pi = { id: "pi_synthetic", amount: 1500, amount_received: 1500, currency: "cad", latest_charge: "ch_synthetic", metadata: { order_id: "1" } };
  const send = async (type, object = pi, signature = true) => {
    const payload = JSON.stringify({ id: "evt_synthetic", type, data: { object } });
    const headers = { "content-type": "application/json" };
    if (signature) headers["stripe-signature"] = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET });
    return fetch(url, { method: "POST", headers, body: payload });
  };
  const status = () => db.prepare("SELECT payment_status FROM orders WHERE id=1").get().payment_status;
  db.prepare("INSERT INTO orders(id,total,payment_status,stripe_payment_intent_id) VALUES(1,15,'pending','pi_synthetic')").run();
  db.prepare("INSERT INTO payments(order_id,stripe_payment_intent_id,amount_cents,currency,status) VALUES(1,'pi_synthetic',1500,'cad','pending')").run();
  await t.test("unsigned events rejected", async () => { assert.equal((await send("payment_intent.succeeded", pi, false)).status,400); assert.equal(status(),"pending"); });
  await t.test("forged signature rejected", async () => { assert.equal((await fetch(url,{method:"POST",headers:{"content-type":"application/json","stripe-signature":"t=1,v1=forged"},body:"{}"})).status,400); });
  for (const [label, change] of [["wrong order",{metadata:{order_id:"2"}}],["wrong amount",{amount:1}],["wrong currency",{currency:"usd"}],["partial receipt",{amount_received:1}],["unknown intent",{id:"pi_other"}]]) {
    await t.test(label+" cannot mark an order paid",async()=>{assert.equal((await send("payment_intent.succeeded",{...pi,...change})).status,500);assert.equal(status(),"pending");});
  }
  await t.test("write failure returns retryable error", async () => {
    db.exec("CREATE TRIGGER fail_payment BEFORE UPDATE ON orders BEGIN SELECT RAISE(FAIL,'synthetic disk error'); END");
    assert.equal((await send("payment_intent.succeeded")).status,500); assert.equal(status(),"pending");
    db.exec("DROP TRIGGER fail_payment");
  });
  await t.test("retry repairs state, repeated success emits once",async()=>{
    assert.equal((await send("payment_intent.succeeded")).status,200);
    assert.equal((await send("payment_intent.succeeded")).status,200);
    assert.equal(status(),"paid"); assert.equal(emitted.length,1);
  });
  await t.test("late failure cannot downgrade paid order",async()=>{assert.equal((await send("payment_intent.payment_failed")).status,200);assert.equal(status(),"paid");assert.equal(emitted.length,1);});
  const charge = { id:"ch_synthetic", payment_intent:pi.id, amount:1500, currency:"cad", refunds:{data:[{id:"re_synthetic",amount:1500,status:"succeeded"}]} };
  await t.test("refund is deduplicated and terminal",async()=>{
    assert.equal((await send("charge.refunded",charge)).status,200);
    assert.equal((await send("charge.refunded",charge)).status,200);
    assert.equal((await send("payment_intent.succeeded")).status,200);
    assert.equal((await send("payment_intent.payment_failed")).status,200);
    assert.equal(status(),"refunded"); assert.equal(db.prepare("SELECT COUNT(*) n FROM refunds").get().n,1);assert.equal(emitted.length,2);
  });
  await t.test("other charge cannot refund this payment",async()=>{assert.equal((await send("charge.refunded",{...charge,id:"ch_other"})).status,500);assert.equal(status(),"refunded");});
});

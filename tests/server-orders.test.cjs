"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const catalogue = require("../menu-catalog.json");

test("isolated Express checkout, admin, tracking privacy and SQLite restore", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "deli-orders-"));
  const dbPath = path.join(temp, "orders.db");
  // Only synthetic credentials; no inherited Stripe, SMTP, SMS or merchant env.
  const child = spawn(process.execPath, [path.resolve(__dirname,"../server.cjs")], {
    cwd:temp, env:{ PATH:process.env.PATH, NODE_ENV:"production", PORT:"0", DB_PATH:dbPath, ADMIN_PASSWORD:"synthetic-test-admin-only", JWT_SECRET:"synthetic-test-jwt-secret-only-32-characters", TAKATAK_ENABLED:"false" }, stdio:["ignore","pipe","pipe"],
  });
  let stopped = false;
  const stop = async () => { if(stopped)return; stopped=true; child.kill("SIGTERM"); await new Promise(resolve=>child.once("exit",resolve)); };
  t.after(async()=>{await stop();fs.rmSync(temp,{recursive:true,force:true});});
  const port = await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error("Isolated server readiness timeout")),15000);
    child.once("exit",code=>{clearTimeout(timeout);reject(new Error(`Server exited ${code}`));});
    child.stdout.on("data",chunk=>{const m=chunk.toString().match(/Server running on port (\d+)/);if(m){clearTimeout(timeout);resolve(Number(m[1]));}});
  });
  const base=`http://127.0.0.1:${port}`;
  const post=body=>fetch(base+"/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  assert.equal(await(await fetch(base+"/healthz")).text(),"ok");
  assert.equal((await fetch(base+"/api/orders")).status,401);
  const simple=catalogue.categories.flatMap(c=>c.items).find(i=>!i.combo&&!i.options.length);
  const body={customer:{name:"Synthetic Test",phone:"5145550100"},orderType:"pickup",paymentMethod:"pay_at_restaurant",smsOptIn:false,items:[{itemId:simple.id,quantity:1,unitPrice:simple.price,options:[],combo:false}]};
  const forged=structuredClone(body);forged.items[0].unitPrice=0.01;
  assert.equal((await post(forged)).status,409);
  const created=await post(body);assert.equal(created.status,200);const receipt=await created.json();
  assert.match(receipt.orderToken,/^[a-f0-9]{64}$/);
  const route=base+"/api/orders/"+encodeURIComponent(receipt.orderNumber);
  const publicResponse=await fetch(route);assert.equal(publicResponse.headers.get("cache-control"),"no-store");
  const publicOrder=(await publicResponse.json()).order;
  assert.equal(publicOrder.details_available,false);
  for(const key of ["customer_name","customer_phone","customer_email","items","delivery_address","total","admin_notes","delivery_door_code"])assert.equal(publicOrder[key],undefined,key);
  const privateOrder=(await(await fetch(route,{headers:{"x-order-token":receipt.orderToken}})).json()).order;
  assert.equal(privateOrder.customer_name,"Synthetic Test");assert.equal(privateOrder.items.length,1);
  assert.equal(privateOrder.admin_notes,undefined);assert.equal(privateOrder.delivery_door_code,undefined);assert.equal(privateOrder.sms_opt_in,undefined);
  const bad=(await(await fetch(route,{headers:{"x-order-token":"0".repeat(64)}})).json()).order;assert.equal(bad.details_available,false);
  await stop();
  const db=new Database(dbPath);assert.equal(db.prepare("SELECT COUNT(*) n FROM orders").get().n,1);
  assert.equal(db.prepare("SELECT sms_opt_in FROM orders").get().sms_opt_in,0);
  await db.backup(path.join(temp,"restore.db"));db.close();
  const restored=new Database(path.join(temp,"restore.db"));assert.equal(restored.pragma("integrity_check",{simple:true}),"ok");assert.equal(restored.prepare("SELECT COUNT(*) n FROM orders").get().n,1);restored.close();
});

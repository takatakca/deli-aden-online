"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeOrderItems } = require("../server-pricing.cjs");
const catalogue = require("../menu-catalog.json");

const products = catalogue.categories.flatMap((category) => category.items);
const simple = products.find(
  (item) => !item.combo && (!item.options || item.options.length === 0),
);
const withRequiredOptions = products.find((item) =>
  (item.options || []).some((group) => group.required),
);
const comboProduct = products.find((item) => item.combo);

assert.ok(simple, "Catalogue must contain a basic item for security tests");
assert.ok(withRequiredOptions, "Catalogue must contain a required-option item");
assert.ok(comboProduct, "Catalogue must contain a combo item");

const lineFor = (item, changes = {}) => ({
  itemId: item.id,
  quantity: 1,
  unitPrice: item.price,
  options: [],
  combo: false,
  ...changes,
});

function expectOrderError(action, statusCode) {
  assert.throws(action, (error) => {
    assert.equal(error.statusCode, statusCode);
    return true;
  });
}

test("accepts authentic server catalogue price", () => {
  const items = normalizeOrderItems([lineFor(simple)]);
  assert.equal(items.length, 1);
  assert.equal(items[0].itemId, simple.id);
  assert.equal(items[0].unitPrice, simple.price);
});

test("rejects client-forged lower price", () => {
  expectOrderError(
    () => normalizeOrderItems([lineFor(simple, { unitPrice: 0.01 })]),
    409,
  );
});

test("rejects unknown catalogue product", () => {
  expectOrderError(
    () => normalizeOrderItems([lineFor(simple, { itemId: "fake-product-id" })]),
    409,
  );
});

test("rejects excessive and non-integer quantities", () => {
  for (const quantity of [0, 100, -1, 1.25]) {
    expectOrderError(
      () => normalizeOrderItems([lineFor(simple, { quantity })]),
      400,
    );
  }
});

test("rejects missing required options", () => {
  expectOrderError(
    () => normalizeOrderItems([lineFor(withRequiredOptions)]),
    409,
  );
});

test("accepts required options from the real catalogue", () => {
  const options = withRequiredOptions.options
    .filter((group) => group.required)
    .map((group) => ({ groupLabel: group.label, values: [group.choices[0].label] }));
  const extraCents = withRequiredOptions.options
    .filter((group) => group.required)
    .reduce((sum, group) => sum + Math.round((group.choices[0].priceDelta || 0) * 100), 0);
  const price = (Math.round(withRequiredOptions.price * 100) + extraCents) / 100;
  const items = normalizeOrderItems([lineFor(withRequiredOptions, { options, unitPrice: price })]);
  assert.equal(items[0].unitPrice, price);
});

test("rejects an invented product option", () => {
  const required = withRequiredOptions.options.filter((group) => group.required);
  const options = required.map((group) => ({
    groupLabel: group.label,
    values: [group.choices[0].label],
  }));
  options[0].values = ["option-not-in-menu"];
  expectOrderError(
    () => normalizeOrderItems([lineFor(withRequiredOptions, { options })]),
    409,
  );
});

test("rejects forged combo discount", () => {
  expectOrderError(
    () => normalizeOrderItems([lineFor(comboProduct, { combo: true })]),
    409,
  );
});

test("allows valid combo with server-owned premium", () => {
  const price = (Math.round(comboProduct.price * 100) + Math.round(catalogue.comboDelta * 100)) / 100;
  const items = normalizeOrderItems([lineFor(comboProduct, { combo: true, unitPrice: price })]);
  assert.equal(items[0].unitPrice, price);
  assert.equal(items[0].combo, true);
});

test("rejects an unavailable item even when the cart price is correct", () => {
  expectOrderError(
    () => normalizeOrderItems([lineFor(simple)], [{ item_id: simple.id, available: false }]),
    409,
  );
});

test("rejects stale prices following a server override", () => {
  expectOrderError(
    () => normalizeOrderItems([lineFor(simple)], [{ item_id: simple.id, price_override: simple.price + 1 }]),
    409,
  );
});

test("rejects empty or excessive cart lines", () => {
  expectOrderError(() => normalizeOrderItems([]), 400);
  expectOrderError(
    () => normalizeOrderItems(Array.from({ length: 101 }, () => lineFor(simple))),
    400,
  );
});

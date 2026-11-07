"use strict";

// Server-owned catalogue prices and option rules. Never charge using a browser
// supplied unitPrice, item name, option premium, or availability flag.
const catalogue = require("./menu-catalog.json");
const itemsById = new Map(
  catalogue.categories.flatMap((category) => category.items.map((item) => [item.id, item])),
);

function invalid(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function moneyCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 10000) {
    invalid("Prix du menu invalide. Contactez le restaurant.", 503);
  }
  return Math.round(amount * 100);
}

function normalizeOrderItems(lines, overrides = []) {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 100) {
    invalid("Le panier doit contenir entre 1 et 100 articles.");
  }
  const overrideMap = new Map(overrides.map((row) => [row.item_id, row]));

  return lines.map((line) => {
    if (!line || typeof line !== "object" || typeof line.itemId !== "string") {
      invalid("Article du panier invalide.");
    }
    const item = itemsById.get(line.itemId);
    if (!item) invalid("Un article a changé dans le menu. Actualisez votre panier.", 409);
    const override = overrideMap.get(item.id);
    if (override && (override.available === false || override.available === 0 || override.available === "0")) {
      invalid(`Article indisponible : ${item.name}`, 409);
    }

    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      invalid(`Quantité invalide : ${item.name}`);
    }
    if (line.combo !== undefined && typeof line.combo !== "boolean") {
      invalid("Formule invalide.");
    }
    const combo = line.combo === true;
    if (combo && !item.combo) invalid("Formule non offerte pour cet article.", 409);

    const optionGroups = Array.isArray(item.options) ? item.options : [];
    const selected = Array.isArray(line.options) ? line.options : [];
    if (selected.length > optionGroups.length + (combo ? 1 : 0)) {
      invalid("Options du panier invalides.");
    }
    const selectionMap = new Map();
    for (const selection of selected) {
      if (!selection || typeof selection.groupLabel !== "string" || !Array.isArray(selection.values)) {
        invalid("Sélection d'options invalide.");
      }
      if (selection.groupLabel === "Formule") {
        if (!combo || selectionMap.has("Formule") || selection.values.length !== 1) {
          invalid("Formule invalide.");
        }
        selectionMap.set("Formule", selection.values);
        continue;
      }
      if (selectionMap.has(selection.groupLabel)) invalid("Groupe d'options en double.");
      if (!optionGroups.some((group) => group.label === selection.groupLabel)) {
        invalid("Option non offerte pour cet article.", 409);
      }
      selectionMap.set(selection.groupLabel, selection.values);
    }

    let unitCents = moneyCents(override?.price_override ?? item.price);
    const options = [];
    for (const group of optionGroups) {
      const values = selectionMap.get(group.label) || [];
      if (group.required && values.length === 0) {
        invalid(`Choix requis : ${group.label}`, 409);
      }
      if (group.type === "single" && values.length > 1) {
        invalid(`Un seul choix autorisé : ${group.label}`);
      }
      if (values.length > group.choices.length || new Set(values).size !== values.length) {
        invalid("Choix multiples invalides.");
      }
      for (const value of values) {
        if (typeof value !== "string") invalid("Valeur d'option invalide.");
        const choice = group.choices.find((candidate) => candidate.label === value);
        if (!choice) invalid(`Option non offerte : ${group.label}`, 409);
        unitCents += moneyCents(choice.priceDelta || 0);
      }
      if (values.length) options.push({ groupLabel: group.label, values: [...values] });
    }
    if (combo) {
      unitCents += moneyCents(catalogue.comboDelta);
      options.push({ groupLabel: "Formule", values: [`Trio (+${new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(catalogue.comboDelta)})`] });
    }

    // A stale or manipulated cart must prompt repricing, never silently charge
    // an unexpected amount or trust the forged unitPrice.
    if (moneyCents(line.unitPrice) !== unitCents) {
      invalid(`Le prix de ${item.name} a changé. Actualisez votre panier.`, 409);
    }
    return {
      itemId: item.id,
      name: item.name,
      unitPrice: unitCents / 100,
      quantity,
      options,
      combo,
      notes: typeof line.notes === "string" ? line.notes.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 300) : "",
    };
  });
}

module.exports = { normalizeOrderItems };

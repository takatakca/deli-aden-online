// Exports the TypeScript menu catalog to menu-catalog.json so the Express
// backend (server-ai.cjs / server-takatak.cjs) can read live product data
// without duplicating it. Regenerate after editing src/lib/menu.ts:
//
//   node --experimental-strip-types scripts/export-menu.mjs
//
// (Node 22.6+; the generated file is committed so deployment never needs this.)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const { MENU, COMBO_DELTA } = await import(path.join(here, "..", "src", "lib", "menu.ts"));

const catalog = {
  generatedAt: new Date().toISOString(),
  comboDelta: COMBO_DELTA,
  categories: MENU.map((c) => ({
    id: c.id,
    name: c.name,
    blurb: c.blurb ?? null,
    items: c.items.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description ?? null,
      price: i.price,
      image: i.image,
      combo: Boolean(i.combo),
      options: (i.options ?? []).map((g) => ({
        id: g.id,
        label: g.label,
        type: g.type,
        required: Boolean(g.required),
        choices: g.choices.map((ch) => ({ label: ch.label, priceDelta: ch.priceDelta ?? 0 })),
      })),
    })),
  })),
};

writeFileSync(path.join(here, "..", "menu-catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
console.log(
  `menu-catalog.json written — ${catalog.categories.length} categories, ` +
    `${catalog.categories.reduce((n, c) => n + c.items.length, 0)} items`,
);

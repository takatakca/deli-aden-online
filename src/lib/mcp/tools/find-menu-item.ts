import { MENU } from "@/lib/menu";

export type FindMenuArgs = { query: string; limit?: number };

export function findMenuItem({ query, limit = 20 }: FindMenuArgs) {
  const q = query.trim().toLowerCase();
  const max = Math.min(Math.max(limit, 1), 50);
  const hits: Array<Record<string, unknown>> = [];

  if (!q) return hits;

  for (const c of MENU) {
    for (const i of c.items) {
      const hay = `${i.name} ${i.description ?? ""}`.toLowerCase();
      if (!hay.includes(q)) continue;

      hits.push({
        id: i.id,
        name: i.name,
        description: i.description,
        price: i.price,
        currency: "CAD",
        categoryId: c.id,
        categoryName: c.name,
        options: i.options?.map((g) => ({
          label: g.label,
          type: g.type,
          required: g.required ?? false,
          choices: g.choices.map((ch) => ({
            label: ch.label,
            priceDelta: ch.priceDelta ?? 0,
          })),
        })),
      });

      if (hits.length >= max) return hits;
    }
  }

  return hits;
}

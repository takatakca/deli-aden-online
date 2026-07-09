import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { MENU } from "@/lib/menu";

export default defineTool({
  name: "find_menu_item",
  title: "Find menu item",
  description:
    "Search the public menu by keyword. Matches against item name and description (case-insensitive). Returns matching items with their category, price (CAD), and available options.",
  inputSchema: {
    query: z.string().min(1).describe("Search text, e.g. 'tacos', 'poulet', 'merguez'."),
    limit: z.number().int().min(1).max(50).optional().describe("Max results (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ query, limit }) => {
    const q = query.toLowerCase();
    const max = limit ?? 20;
    const hits: Array<Record<string, unknown>> = [];
    for (const c of MENU) {
      for (const i of c.items) {
        const hay = `${i.name} ${i.description ?? ""}`.toLowerCase();
        if (hay.includes(q)) {
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
              choices: g.choices.map((ch) => ({ label: ch.label, priceDelta: ch.priceDelta ?? 0 })),
            })),
          });
          if (hits.length >= max) break;
        }
      }
      if (hits.length >= max) break;
    }
    return {
      content: [{ type: "text", text: JSON.stringify(hits, null, 2) }],
      structuredContent: { results: hits, count: hits.length },
    };
  },
});

import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { MENU } from "@/lib/menu";

export default defineTool({
  name: "get_menu",
  title: "Get menu",
  description:
    "Return the full public menu for Les Délices d'Aden: all categories, items, prices (CAD), and descriptions. Optionally filter to a single category by id.",
  inputSchema: {
    categoryId: z
      .string()
      .optional()
      .describe("Optional category id to return only that category (e.g. 'tacos', 'grillades')."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ categoryId }) => {
    const cats = categoryId ? MENU.filter((c) => c.id === categoryId) : MENU;
    const data = cats.map((c) => ({
      id: c.id,
      name: c.name,
      blurb: c.blurb,
      items: c.items.map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        price: i.price,
        currency: "CAD",
        combo: i.combo ?? false,
      })),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { categories: data },
    };
  },
});

import { defineTool } from "@lovable.dev/mcp-js";

const INFO = {
  name: "Les Délices d'Aden",
  cuisine: "Algerian",
  description:
    "Cuisine algérienne authentique, grillades, poissons, fast food et desserts faits maison. Ramassage et livraison.",
  website: "https://deli-aden-orders.lovable.app",
  email: "orders@deliaden.ca",
  city: "Québec, QC, Canada",
  currency: "CAD",
  languages: ["fr"],
  services: ["pickup", "delivery"],
  hours: {
    monday_thursday: "11:00–22:00",
    friday_saturday: "11:00–23:00",
    sunday: "12:00–22:00",
  },
  orderOnline: "https://deli-aden-orders.lovable.app/menu",
};

export default defineTool({
  name: "get_restaurant_info",
  title: "Get restaurant info",
  description:
    "Return public information about Les Délices d'Aden restaurant: name, cuisine, contact, opening hours, and ordering links.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [{ type: "text", text: JSON.stringify(INFO, null, 2) }],
    structuredContent: INFO,
  }),
});

import { getMenu } from "./tools/get-menu";
import { findMenuItem } from "./tools/find-menu-item";
import { RESTAURANT_INFO } from "./tools/get-restaurant-info";

export const MCP_TOOLS = [
  {
    name: "get_menu",
    description: "Return the public restaurant menu in CAD.",
    inputSchema: {
      type: "object",
      properties: { categoryId: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "find_menu_item",
    description: "Search the public menu by keyword.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_restaurant_info",
    description: "Return public restaurant information and ordering links.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
] as const;

export function invokeMcpTool(name: string, args: Record<string, unknown> = {}) {
  switch (name) {
    case "get_menu":
      return getMenu({ categoryId: typeof args.categoryId === "string" ? args.categoryId : undefined });
    case "find_menu_item":
      return findMenuItem({
        query: typeof args.query === "string" ? args.query : "",
        limit: typeof args.limit === "number" ? args.limit : 20,
      });
    case "get_restaurant_info":
      return RESTAURANT_INFO;
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

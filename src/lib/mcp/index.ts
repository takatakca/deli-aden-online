import { defineMcp } from "@lovable.dev/mcp-js";
import getMenuTool from "./tools/get-menu";
import findMenuItemTool from "./tools/find-menu-item";
import getRestaurantInfoTool from "./tools/get-restaurant-info";

export default defineMcp({
  name: "deli-aden-mcp",
  title: "Les Délices d'Aden",
  version: "0.1.0",
  instructions:
    "Public tools for Les Délices d'Aden restaurant (Algerian cuisine, Québec). Use `get_menu` to list all categories and items with prices in CAD, `find_menu_item` to search the menu by keyword, and `get_restaurant_info` for hours, contact, and ordering links.",
  tools: [getMenuTool, findMenuItemTool, getRestaurantInfoTool],
});

import { MENU } from "@/lib/menu";

export type MenuToolArgs = { categoryId?: string };

export function getMenu({ categoryId }: MenuToolArgs = {}) {
  const cats = categoryId ? MENU.filter((c) => c.id === categoryId) : MENU;
  return cats.map((c) => ({
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
}

import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/inventory")({ component: InventoryLayout });

const SUB = [
  { to: "/admin/inventory", label: "Aperçu", exact: true },
  { to: "/admin/inventory/ingredients", label: "Ingrédients" },
  { to: "/admin/inventory/recipes", label: "Recettes" },
  { to: "/admin/inventory/suppliers", label: "Fournisseurs" },
  { to: "/admin/inventory/purchases", label: "Achats" },
  { to: "/admin/inventory/waste", label: "Pertes" },
];

function InventoryLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="space-y-5">
      <nav className="no-print flex flex-wrap gap-2">
        {SUB.map((s) => {
          const active = s.exact ? path === s.to : path.startsWith(s.to);
          return (
            <a
              key={s.to}
              href={s.to}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${active ? "border-primary bg-primary/10 font-medium text-primary" : "border-border bg-card hover:border-primary/40"}`}
            >
              {s.label}
            </a>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}

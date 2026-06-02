import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAdminAuth, AdminLogin } from "@/lib/admin-shared";
import { LogOut, LayoutDashboard, ChefHat, KanbanSquare, Settings, ListOrdered, Truck, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — Les Délices d'Aden" }, { name: "robots", content: "noindex" }] }),
  component: AdminLayout,
});

const NAV = [
  { to: "/admin", label: "Commandes", icon: ListOrdered, exact: true },
  { to: "/admin/board", label: "Tableau", icon: LayoutDashboard },
  { to: "/admin/kitchen", label: "Cuisine", icon: ChefHat },
  { to: "/admin/dispatch", label: "Livraison", icon: Truck },
  { to: "/admin/menu", label: "Menu", icon: KanbanSquare },
  { to: "/admin/metrics", label: "Statistiques", icon: BarChart3 },
  { to: "/admin/settings", label: "Réglages", icon: Settings },
] as const;

function AdminLayout() {
  const { authed, ready, login, logout } = useAdminAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (!ready) return <div className="p-12 text-center text-muted-foreground">Chargement…</div>;
  if (!authed) return <AdminLogin onSuccess={login} />;

  // Fullscreen routes (no nav chrome)
  if (path === "/admin/kitchen") return <Outlet />;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Administration</h1>
        <Button onClick={logout} variant="ghost" size="sm" className="gap-1">
          <LogOut className="h-4 w-4" /> Déconnexion
        </Button>
      </header>
      <nav className="no-print mb-6 flex flex-wrap gap-2">
        {NAV.map(({ to, label, icon: Icon, exact }) => {
          const active = exact ? path === to : path.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40"}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import { ShoppingBag, Menu as MenuIcon, X } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/lib/cart-store";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Accueil" },
  { to: "/menu", label: "Menu" },
  { to: "/about", label: "À propos" },
  { to: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const cart = useCart();
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground font-display text-lg font-bold">
            DA
          </div>
          <div className="leading-tight">
            <div className="font-display text-base font-bold text-primary">Les Délices d'Aden</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Restaurant</div>
          </div>
        </Link>
        <nav className="hidden gap-7 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="text-sm font-medium text-foreground/80 transition hover:text-primary"
              activeProps={{ className: "text-primary font-semibold" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/cart">
            <Button variant="default" size="sm" className="relative gap-2">
              <ShoppingBag className="h-4 w-4" />
              <span className="hidden sm:inline">Panier</span>
              {count > 0 && (
                <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
                  {count}
                </span>
              )}
            </Button>
          </Link>
          <button
            onClick={() => setOpen(!open)}
            className="rounded-md p-2 md:hidden"
            aria-label="Menu"
          >
            {open ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-border bg-background md:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 p-3">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-secondary"
                activeProps={{ className: "bg-secondary text-primary" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

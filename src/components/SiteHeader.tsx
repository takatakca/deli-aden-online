import { Link } from "@tanstack/react-router";
import { ShoppingBag, Menu as MenuIcon, X, User } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/lib/cart-store";
import { useCustomer } from "@/lib/customer-auth";
import { Button } from "@/components/ui/button";
import { LANGS, i18n, useT } from "@/lib/i18n";

const NAV = [
  { to: "/", key: "nav.home" as const },
  { to: "/menu", key: "nav.menu" as const },
  { to: "/delivery", key: "nav.delivery" as const },
  { to: "/about", key: "nav.about" as const },
  { to: "/contact", key: "nav.contact" as const },
];

export function SiteHeader() {
  const { t, lang } = useT();
  const cart = useCart();
  const { customer } = useCustomer();
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
              {t(n.key)}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden items-center rounded-full border border-border p-0.5 sm:flex" role="group" aria-label={t("nav.language")}>
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => i18n.set(l.code)}
                aria-pressed={lang === l.code}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${lang === l.code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {l.label}
              </button>
            ))}
          </div>
          <Link to="/account">
            <Button variant="ghost" size="sm" className="gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">{customer ? customer.name.split(" ")[0] : t("nav.account")}</span>
            </Button>
          </Link>
          <Link to="/cart">
            <Button variant="default" size="sm" className="relative gap-2">
              <ShoppingBag className="h-4 w-4" />
              <span className="hidden sm:inline">{t("nav.cart")}</span>
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
                {t(n.key)}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

import { Link } from "@tanstack/react-router";
import { ShoppingBag, Menu as MenuIcon, X, User, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart-store";
import { useCustomer } from "@/lib/customer-auth";
import { Button } from "@/components/ui/button";
import { LANGS, i18n, useT } from "@/lib/i18n";
import { cartSheet } from "@/lib/ui-store";
import { useLiveMenu, isOpenNow } from "@/lib/use-live-menu";

const NAV = [
  { to: "/menu", key: "nav.menu" as const },
  { to: "/delivery", key: "nav.delivery" as const },
  { to: "/track", key: "nav.track" as const },
  { to: "/about", key: "nav.about" as const },
  { to: "/contact", key: "nav.contact" as const },
];

export function SiteHeader() {
  const { t, lang } = useT();
  const cart = useCart();
  const { customer } = useCustomer();
  const { settings } = useLiveMenu();
  const open = isOpenNow(settings);
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (count === 0) return;
    setPulse(true);
    const id = setTimeout(() => setPulse(false), 450);
    return () => clearTimeout(id);
  }, [count]);

  return (
    <header
      className={`sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md transition-all ${
        scrolled ? "border-border shadow-lg shadow-black/40" : "border-border/40"
      }`}
    >
      <div
        className={`mx-auto flex max-w-7xl items-center gap-3 px-4 transition-all ${
          scrolled ? "h-14" : "h-16"
        }`}

      >
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <div
            className={`grid shrink-0 place-items-center rounded-full bg-primary font-display font-bold text-primary-foreground transition-all ${
              scrolled ? "h-8 w-8 text-sm" : "h-9 w-9 text-base"
            }`}
          >
            DA
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-display text-[15px] font-bold text-primary">Les Délices d'Aden</div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-primary" : "bg-destructive"}`} />
              {open ? "Ouvert" : "Fermé"}
            </div>
          </div>
        </Link>

        <nav className="ml-auto hidden items-center gap-6 lg:flex">
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

        <div className="ml-auto flex items-center gap-1.5 lg:ml-4">
          <div
            className="hidden items-center rounded-full border border-border p-0.5 sm:flex"
            role="group"
            aria-label={t("nav.language")}
          >
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => i18n.set(l.code)}
                aria-pressed={lang === l.code}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                  lang === l.code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <Link to="/menu" aria-label={t("search.placeholder")}>
            <Button variant="ghost" size="icon" className="min-h-11 min-w-11" aria-label={t("search.placeholder")}>
              <Search className="h-4 w-4" />
            </Button>
          </Link>

          <Link to="/account">
            <Button variant="ghost" size="sm" className="min-h-11 gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">{customer ? customer.name.split(" ")[0] : t("nav.account")}</span>
            </Button>
          </Link>

          <Button
            variant="default"
            size="sm"
            onClick={() => (count > 0 ? cartSheet.open() : undefined)}
            asChild={count === 0}
            className={`relative min-h-11 gap-2 ${pulse ? "cart-pulse" : ""}`}
          >
            {count === 0 ? (
              <Link to="/cart">
                <ShoppingBag className="h-4 w-4" />
                <span className="hidden sm:inline">{t("nav.cart")}</span>
              </Link>
            ) : (
              <>
                <ShoppingBag className="h-4 w-4" />
                <span className="hidden sm:inline">{t("nav.cart")}</span>
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
                  {count}
                </span>
              </>
            )}
          </Button>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded-md p-2 lg:hidden"
            aria-label="Menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-border bg-background lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col gap-1 p-3">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setMenuOpen(false)}
                className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-secondary"
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

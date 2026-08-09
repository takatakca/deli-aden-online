import { Link } from "@tanstack/react-router";
import { Home, UtensilsCrossed, Truck, MapPin, User } from "lucide-react";
import { useT } from "@/lib/i18n";

const TABS = [
  { to: "/", key: "nav.home" as const, Icon: Home },
  { to: "/menu", key: "nav.menu" as const, Icon: UtensilsCrossed },
  { to: "/delivery", key: "nav.delivery" as const, Icon: Truck },
  { to: "/track", key: "nav.track" as const, Icon: MapPin },
  { to: "/account", key: "nav.account" as const, Icon: User },
];

/** Customer-only mobile tab bar. Never exposes admin, driver or merchant tools. */
export function MobileTabBar() {
  const { t } = useT();
  return (
    <nav
      aria-label={t("nav.primary")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {TABS.map(({ to, key, Icon }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium text-muted-foreground"
              activeProps={{ className: "text-primary" }}
              activeOptions={{ exact: to === "/" }}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="truncate">{t(key)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

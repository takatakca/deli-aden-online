import { useQuery } from "@tanstack/react-query";
import { api, type MenuOverride, type PublicSettings } from "@/lib/api";
import { buildLiveMenu, type LiveItem } from "@/lib/menu-search";

/**
 * Live catalog + restaurant settings for customer-facing surfaces.
 * Never fails hard: if the backend is unreachable we fall back to the static
 * menu so the storefront still sells food (prices/availability from code).
 */
export function useLiveMenu() {
  const settingsQ = useQuery({
    queryKey: ["public-settings"],
    queryFn: () => api.getSettings().then((r) => r.settings),
    staleTime: 60_000,
    retry: 0,
  });
  const overridesQ = useQuery({
    queryKey: ["public-menu-overrides"],
    queryFn: () => api.getMenuOverrides().then((r) => r.overrides),
    staleTime: 60_000,
    retry: 0,
  });

  const settings: PublicSettings | null = settingsQ.data ?? null;
  const overrides: MenuOverride[] = overridesQ.data ?? [];
  const live: LiveItem[] = buildLiveMenu(overrides, settings);

  return { live, settings, overrides, loading: settingsQ.isLoading || overridesQ.isLoading };
}

export function etaLabels(settings: PublicSettings | null) {
  const pickup = settings?.est_pickup_min ?? 25;
  const delivery = settings?.est_delivery_min ?? 45;
  return {
    pickup: `${Math.max(5, pickup - 5)}–${pickup + 5} min`,
    delivery: `${Math.max(10, delivery - 10)}–${delivery} min`,
    pickupEnabled: settings ? settings.pickup_enabled !== false : true,
    deliveryEnabled: settings ? settings.delivery_enabled !== false : true,
  };
}

export function isOpenNow(settings: PublicSettings | null) {
  if (!settings) return true;
  return settings.is_open !== false && settings.orders_paused !== true;
}

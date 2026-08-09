import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * Connectivity guard for the ordering flow. Purely presentational:
 * no service worker is registered, so nothing can serve stale orders,
 * payments, tracking or availability data.
 */
export function OfflineBanner() {
  const { t } = useT();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-16 z-30 flex items-center gap-2 border-b border-destructive/40 bg-destructive/15 px-4 py-2 text-sm text-destructive"
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{t("common.offline")}</span>
    </div>
  );
}

/** True while the browser reports no connectivity (used to block order submission). */
export function useOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return offline;
}

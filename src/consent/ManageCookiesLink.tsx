/**
 * SEO + consent kit: footer link "Gérer mes témoins" (Law 25: change the choice at any time).
 * Hidden when no optional tool is configured.
 */
import { useEffect, useState } from "react";
import { resetConsent } from "@/consent/consent";
import { hasOptionalTags } from "@/tracking/loadTags";

export function ManageCookiesLink({ className }: { className?: string }) {
  // Render after mount only, so server and client HTML match.
  const [show, setShow] = useState(false);
  useEffect(() => setShow(hasOptionalTags()), []);
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={resetConsent}
      className={className ?? "underline-offset-2 hover:underline"}
    >
      Gérer mes témoins
    </button>
  );
}

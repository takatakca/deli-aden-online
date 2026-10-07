/**
 * SEO + consent kit: cookie banner (Québec Law 25). French first.
 * Three buttons of the same size: Tout refuser / Personnaliser / Tout accepter.
 * Optional boxes are NOT ticked by default. Nothing optional loads before a choice.
 * Shown only when at least one optional tool is configured (see src/tracking/loadTags.ts).
 * Mount once at the root of the app.
 */
import { useEffect, useState } from "react";
import { SITE } from "@/site.config";
import { onConsentChange, readConsent, saveConsent, type Consent } from "@/consent/consent";
import { applyConsent, configuredTools, hasOptionalTags } from "@/tracking/loadTags";

const btn =
  "inline-flex min-w-[9.5rem] flex-1 items-center justify-center rounded-md border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none";
const btnOutline = `${btn} border-border bg-background text-foreground hover:bg-muted`;
const btnPrimary = `${btn} border-transparent bg-primary text-primary-foreground hover:bg-primary/90`;

export function CookieBanner() {
  // undefined = not read yet (SSR / first paint): render nothing, avoids a hydration mismatch.
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);
  const [customizing, setCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const existing = readConsent();
    setConsent(existing);
    applyConsent(existing);
    return onConsentChange((next) => {
      setConsent(next);
      setCustomizing(false);
      setAnalytics(false);
      setMarketing(false);
      applyConsent(next);
    });
  }, []);

  if (consent !== null || !hasOptionalTags()) return null;

  const tools = configuredTools();
  const choose = (choice: { analytics: boolean; marketing: boolean }) => saveConsent(choice);

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-banner-title"
      lang="fr-CA"
      className="fixed inset-x-0 bottom-0 z-[1000] border-t border-border bg-background/95 text-foreground shadow-2xl backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl text-sm">
          <p id="cookie-banner-title" className="text-base font-semibold">
            Vos choix de confidentialité
          </p>
          <p className="mt-1 text-muted-foreground">
            Les témoins nécessaires au fonctionnement du site restent actifs. Avec votre accord,
            nous activons aussi la mesure d’audience et les témoins publicitaires. Vous pouvez
            changer d’avis en tout temps avec le lien « Gérer mes témoins ».
          </p>
          <p className="mt-1 text-xs text-muted-foreground" lang="en-CA">
            We use necessary cookies. With your consent, we also use analytics and advertising
            cookies. You can change your choice at any time.
          </p>
          {SITE.privacyPath ? (
            <a
              href={SITE.privacyPath}
              className="mt-1 inline-block text-sm font-medium underline underline-offset-2"
            >
              Politique de confidentialité
            </a>
          ) : null}
        </div>

        {!customizing ? (
          <div className="flex flex-wrap gap-2 lg:flex-nowrap lg:justify-end">
            <button
              type="button"
              className={btnOutline}
              onClick={() => choose({ analytics: false, marketing: false })}
            >
              Tout refuser
            </button>
            <button type="button" className={btnOutline} onClick={() => setCustomizing(true)}>
              Personnaliser
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => choose({ analytics: true, marketing: true })}
            >
              Tout accepter
            </button>
          </div>
        ) : (
          <div className="w-full rounded-lg border border-border bg-background p-4 lg:w-[380px]">
            <p className="flex items-start justify-between gap-4 py-2 text-sm">
              <span>
                <strong className="block">Nécessaires</strong>
                <span className="text-xs text-muted-foreground">
                  Toujours actifs (fonctionnement du site)
                </span>
              </span>
              <span className="text-xs text-muted-foreground">Toujours</span>
            </p>
            {tools.analytics.length > 0 ? (
              <label className="flex cursor-pointer items-start justify-between gap-4 border-t border-border py-2 text-sm">
                <span>
                  <strong className="block">Mesure d’audience</strong>
                  <span className="text-xs text-muted-foreground">
                    {tools.analytics.join(", ")}
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                />
              </label>
            ) : null}
            {tools.marketing.length > 0 ? (
              <label className="flex cursor-pointer items-start justify-between gap-4 border-t border-border py-2 text-sm">
                <span>
                  <strong className="block">Publicité</strong>
                  <span className="text-xs text-muted-foreground">
                    {tools.marketing.join(", ")}
                  </span>
                </span>
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                />
              </label>
            ) : null}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" className={btnOutline} onClick={() => setCustomizing(false)}>
                Retour
              </button>
              <button
                type="button"
                className={btnPrimary}
                onClick={() => choose({ analytics, marketing })}
              >
                Enregistrer mes choix
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

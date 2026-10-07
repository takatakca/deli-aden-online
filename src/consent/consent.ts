/**
 * SEO + consent kit: visitor's cookie choice (Québec Law 25).
 * Stored in this browser only: categories, banner version and date. No name, no email.
 * Nothing optional (analytics, ads, pixels) may run before a choice is saved.
 */
export const CONSENT_VERSION = 1;
export const CONSENT_STORAGE_KEY = "site_consent_v1";
export const CONSENT_EVENT = "site:consent";

export type Consent = {
  version: typeof CONSENT_VERSION;
  /** Mesure d'audience: Google Analytics 4 / Google Tag Manager. */
  analytics: boolean;
  /** Publicité: Google Ads, Meta Pixel, TikTok Pixel, AdSense. */
  marketing: boolean;
  /** ISO date of the choice (proof of consent). */
  decidedAt: string;
};

export function readConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Consent>;
    if (
      parsed.version !== CONSENT_VERSION ||
      typeof parsed.analytics !== "boolean" ||
      typeof parsed.marketing !== "boolean" ||
      typeof parsed.decidedAt !== "string"
    ) {
      return null;
    }
    return parsed as Consent;
  } catch {
    return null;
  }
}

export function saveConsent(choice: { analytics: boolean; marketing: boolean }): Consent {
  const value: Consent = {
    version: CONSENT_VERSION,
    analytics: choice.analytics,
    marketing: choice.marketing,
    decidedAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(value));
    } catch {
      /* private mode: the choice still applies to this page view */
    }
    window.dispatchEvent(new CustomEvent<Consent | null>(CONSENT_EVENT, { detail: value }));
  }
  return value;
}

/** "Gérer mes témoins": forget the choice and show the banner again. */
export function resetConsent() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent<Consent | null>(CONSENT_EVENT, { detail: null }));
}

export function onConsentChange(cb: (consent: Consent | null) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => cb((e as CustomEvent<Consent | null>).detail ?? null);
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
}

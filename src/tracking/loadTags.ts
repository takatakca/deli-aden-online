/**
 * SEO + consent kit: loads analytics / ads / pixels ONLY after consent (Québec Law 25).
 *
 * IDs come from env vars (public IDs, not secrets). Empty = tool off, nothing loads, no banner needed.
 *   VITE_GA4_ID           G-XXXXXXX     -> after "Mesure d'audience"
 *   VITE_GTM_ID           GTM-XXXXXXX   -> after any consent (Consent Mode v2 tells GTM what is allowed)
 *   VITE_META_PIXEL_ID    123456789     -> after "Publicité"
 *   VITE_TIKTOK_PIXEL_ID  CXXXXXXXXX    -> after "Publicité"
 * If GA4 is configured inside GTM, leave VITE_GA4_ID empty (avoids double counting).
 */
import type { Consent } from "@/consent/consent";

type Fn = (...args: unknown[]) => void;
type TagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: Fn;
  fbq?: Fn & { callMethod?: Fn; queue?: unknown[]; push?: Fn; loaded?: boolean; version?: string };
  _fbq?: unknown;
  ttq?: unknown[] & Record<string, unknown>;
  TiktokAnalyticsObject?: string;
};

const env = import.meta.env as Record<string, string | boolean | undefined>;
function id(name: string, pattern: RegExp): string {
  const raw = env[name];
  const value = typeof raw === "string" ? raw.trim() : "";
  return pattern.test(value) ? value : "";
}

/** Public tag IDs. Empty string = off. */
export const TAG_IDS = {
  ga4: id("VITE_GA4_ID", /^G-[A-Z0-9]{4,}$/i),
  gtm: id("VITE_GTM_ID", /^GTM-[A-Z0-9]{4,}$/i),
  metaPixel: id("VITE_META_PIXEL_ID", /^\d{6,20}$/),
  tiktokPixel: id("VITE_TIKTOK_PIXEL_ID", /^[A-Z0-9]{8,30}$/i),
};

/** Other consent-gated tools this site loads itself (e.g. AdSense). Edit per site. */
export const EXTRA_TOOLS: { analytics: string[]; marketing: string[] } = {
  analytics: [],
  marketing: [],
};

/** Tool names per category, for the banner (only tools really configured). */
export function configuredTools() {
  const analytics = [
    ...(TAG_IDS.ga4 ? ["Google Analytics 4"] : []),
    ...(TAG_IDS.gtm ? ["Google Tag Manager"] : []),
    ...EXTRA_TOOLS.analytics,
  ];
  const marketing = [
    ...(TAG_IDS.metaPixel ? ["Meta Pixel"] : []),
    ...(TAG_IDS.tiktokPixel ? ["TikTok Pixel"] : []),
    ...EXTRA_TOOLS.marketing,
  ];
  return { analytics, marketing };
}

/** true when at least one optional tool is configured (otherwise no banner is needed). */
export function hasOptionalTags(): boolean {
  const t = configuredTools();
  return t.analytics.length + t.marketing.length > 0;
}

const loaded = { analytics: false, marketing: false, consentDefault: false };

function addScript(src: string, idAttr: string) {
  if (document.getElementById(idAttr)) return;
  const s = document.createElement("script");
  s.id = idAttr;
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function ensureGtag(w: TagWindow): Fn {
  w.dataLayer = w.dataLayer ?? [];
  if (!w.gtag) {
    w.gtag = function gtag() {
      // gtag.js expects the Arguments object, not an array.
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
  }
  return w.gtag;
}

function consentModeState(analytics: boolean, marketing: boolean) {
  const g = (on: boolean) => (on ? "granted" : "denied");
  return {
    analytics_storage: g(analytics),
    ad_storage: g(marketing),
    ad_user_data: g(marketing),
    ad_personalization: g(marketing),
  };
}

function loadGoogle(w: TagWindow, analytics: boolean, marketing: boolean) {
  if (!TAG_IDS.ga4 && !TAG_IDS.gtm) return;
  const gtag = ensureGtag(w);
  if (!loaded.consentDefault) {
    // Google Consent Mode v2: everything denied by default, then updated from the visitor's choice.
    gtag("consent", "default", { ...consentModeState(false, false), wait_for_update: 500 });
    loaded.consentDefault = true;
  }
  gtag("consent", "update", consentModeState(analytics, marketing));

  if (TAG_IDS.gtm && !document.getElementById("kit-gtm")) {
    w.dataLayer!.push({ "gtm.start": Date.now(), event: "gtm.js" });
    addScript(
      `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(TAG_IDS.gtm)}`,
      "kit-gtm",
    );
  }
  if (TAG_IDS.ga4 && analytics && !document.getElementById("kit-ga4")) {
    addScript(
      `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(TAG_IDS.ga4)}`,
      "kit-ga4",
    );
    gtag("js", new Date());
    gtag("config", TAG_IDS.ga4);
  }
}

function loadMetaPixel(w: TagWindow) {
  if (!TAG_IDS.metaPixel || w.fbq) return;
  type Fbq = NonNullable<TagWindow["fbq"]>;
  const fbq: Fbq = Object.assign(
    (...args: unknown[]) => {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue?.push(args);
    },
    { queue: [] as unknown[], loaded: true, version: "2.0" },
  );
  fbq.push = fbq;
  w.fbq = fbq;
  if (!w._fbq) w._fbq = fbq;
  addScript("https://connect.facebook.net/en_US/fbevents.js", "kit-meta-pixel");
  fbq("init", TAG_IDS.metaPixel);
  fbq("track", "PageView");
}

function loadTikTokPixel(w: TagWindow) {
  if (!TAG_IDS.tiktokPixel || w.ttq) return;
  const methods = [
    "page",
    "track",
    "identify",
    "instances",
    "debug",
    "on",
    "off",
    "once",
    "ready",
    "alias",
    "group",
    "enableCookie",
    "disableCookie",
    "holdConsent",
    "revokeConsent",
    "grantConsent",
  ];
  const ttq = [] as unknown as unknown[] & Record<string, unknown>;
  const defer = (target: unknown[] & Record<string, unknown>, method: string) => {
    target[method] = (...args: unknown[]) => target.push([method, ...args]);
  };
  methods.forEach((m) => defer(ttq, m));
  ttq["instance"] = (pixelId: string) => {
    const all = ttq["_i"] as Record<string, unknown[] & Record<string, unknown>>;
    const inst = all[pixelId] ?? ([] as unknown as unknown[] & Record<string, unknown>);
    methods.forEach((m) => defer(inst, m));
    return inst;
  };
  const sdk = "https://analytics.tiktok.com/i18n/pixel/events.js";
  ttq["_i"] = { [TAG_IDS.tiktokPixel]: Object.assign([], { _u: sdk }) };
  ttq["_t"] = { [TAG_IDS.tiktokPixel]: Date.now() };
  ttq["_o"] = { [TAG_IDS.tiktokPixel]: {} };
  w.TiktokAnalyticsObject = "ttq";
  w.ttq = ttq;
  addScript(`${sdk}?sdkid=${encodeURIComponent(TAG_IDS.tiktokPixel)}&lib=ttq`, "kit-tiktok-pixel");
  (ttq["page"] as Fn)();
}

/**
 * Apply the visitor's choice. Safe to call many times.
 * null or "refuse" = nothing is requested from Google, Meta or TikTok.
 * If a category is withdrawn after its tags ran, the page reloads so no tag keeps running.
 */
export function applyConsent(consent: Consent | null): void {
  if (typeof window === "undefined") return;
  const w = window as TagWindow;
  const analytics = Boolean(consent?.analytics);
  const marketing = Boolean(consent?.marketing);

  if ((loaded.analytics && !analytics) || (loaded.marketing && !marketing)) {
    if (w.gtag) w.gtag("consent", "update", consentModeState(analytics, marketing));
    window.location.reload();
    return;
  }
  if (!analytics && !marketing) return;

  loadGoogle(w, analytics, marketing);
  if (marketing) {
    loadMetaPixel(w);
    loadTikTokPixel(w);
  }
  const google = Boolean(TAG_IDS.ga4 || TAG_IDS.gtm);
  const pixels = Boolean(TAG_IDS.metaPixel || TAG_IDS.tiktokPixel || EXTRA_TOOLS.marketing.length);
  loaded.analytics =
    loaded.analytics || (analytics && (google || EXTRA_TOOLS.analytics.length > 0));
  loaded.marketing = loaded.marketing || (marketing && (pixels || Boolean(TAG_IDS.gtm)));
}

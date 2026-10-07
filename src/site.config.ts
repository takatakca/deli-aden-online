/**
 * SEO + consent kit: the ONE settings file per site.
 *
 * Rules:
 * - Only facts already present in this repo. Never invent an address, hours, phone, rating or review.
 * - Unknown values stay `undefined` with a `TODO(owner)` comment; the JSON-LD builder skips them.
 * - `url` is the real production domain (see foodhubca/private/hosting/MOCHAHOST_DOMAINS.md), never *.lovable.app.
 */

export type SchemaType =
  "Organization" | "LocalBusiness" | "Restaurant" | "NGO" | "SportsOrganization" | "Event";

export type PostalAddress = {
  streetAddress: string;
  addressLocality: string;
  addressRegion: string;
  postalCode?: string | undefined;
  addressCountry: string;
};

export type SiteConfig = {
  /** Public business name. */
  name: string;
  /** Legal name if different (TODO(owner) when unknown). */
  legalName?: string | undefined;
  /** Real production origin, no trailing slash. */
  url: string;
  /** <html lang>. French first (Québec). */
  lang: "fr-CA";
  /** Open Graph locale. */
  locale: "fr_CA";
  defaultTitle: string;
  defaultDescription: string;
  /** Default share image: path under /public or absolute URL. undefined = no og:image. */
  ogImage?: string | undefined;
  /** Logo: path under /public or absolute URL. */
  logo?: string | undefined;
  schemaType: SchemaType;
  email?: string | undefined;
  /** E.164, e.g. "+15145550000". */
  phone?: string | undefined;
  address?: PostalAddress | undefined;
  /** Real social profile URLs only (no "#", no generic facebook.com). */
  sameAs: string[];
  /** Privacy policy route, used by the cookie banner. undefined = no page yet (TODO(owner)). */
  privacyPath?: string | undefined;
  /** Law 25 privacy officer. */
  privacyOfficer: { name?: string | undefined; email?: string | undefined };
};

export const SITE: SiteConfig = {
  name: "Les Délices d'Aden",
  // TODO(owner): legal name of the business (registry), if different.
  legalName: undefined,
  url: "https://deliaden.ca",
  lang: "fr-CA",
  locale: "fr_CA",
  defaultTitle: "Les Délices d'Aden — Restaurant algérien, commander en ligne",
  defaultDescription:
    "Cuisine algérienne authentique, grillades, poissons, fast food et desserts faits maison. Commandez en ligne pour ramassage ou livraison.",
  ogImage: "/icons/icon-512.png",
  logo: "/icons/icon-512.png",
  schemaType: "Restaurant",
  email: "orders@deliaden.ca",
  // TODO(owner): real phone number. The site showed the placeholder "(000) 000-0000".
  phone: undefined,
  // TODO(owner): real street address. The site showed the placeholder "Adresse du restaurant, Québec".
  address: undefined,
  // TODO(owner): real Facebook / Instagram / Google Business profile URLs.
  sameAs: [],
  // TODO(owner): no privacy policy page yet (Law 25). Set "/confidentialite" once the page exists.
  privacyPath: undefined,
  // TODO(owner): name + email of the person responsible for personal information (Law 25).
  privacyOfficer: { name: undefined, email: undefined },
};

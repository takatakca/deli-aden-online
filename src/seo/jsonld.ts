/**
 * SEO + consent kit: schema.org JSON-LD built ONLY from src/site.config.ts.
 * Missing facts are skipped, never invented (no fake address, hours, phone, rating or review).
 */
import { SITE } from "@/site.config";
import { absoluteUrl } from "@/seo/head";

type Json = Record<string, unknown>;

function compact<T extends Json>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(
      ([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0),
    ),
  ) as T;
}

/** Organization / LocalBusiness / Restaurant / NGO / SportsOrganization node for the whole site. */
export function siteJsonLd(extra: Json = {}): Json {
  return compact({
    "@context": "https://schema.org",
    "@type": SITE.schemaType,
    "@id": `${SITE.url}/#organization`,
    name: SITE.name,
    legalName: SITE.legalName,
    url: `${SITE.url}/`,
    logo: SITE.logo ? absoluteUrl(SITE.logo) : undefined,
    image: SITE.ogImage ? absoluteUrl(SITE.ogImage) : undefined,
    description: SITE.defaultDescription,
    email: SITE.email,
    telephone: SITE.phone,
    address: SITE.address ? { "@type": "PostalAddress", ...SITE.address } : undefined,
    sameAs: SITE.sameAs,
    ...extra,
  });
}

/** WebSite node (helps Google show the site name). */
export function websiteJsonLd(): Json {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE.url}/#website`,
    name: SITE.name,
    url: `${SITE.url}/`,
    inLanguage: SITE.lang,
    publisher: { "@id": `${SITE.url}/#organization` },
  };
}

/** TanStack Start head() script entry: scripts: [jsonLdScript(siteJsonLd())] */
export function jsonLdScript(data: Json | Json[]) {
  return { type: "application/ld+json", children: JSON.stringify(data) };
}

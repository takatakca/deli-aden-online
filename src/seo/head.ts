/**
 * SEO + consent kit: per-page head tags (title, description, canonical, Open Graph, Twitter, robots).
 *
 * TanStack Start:  head: () => seoHead({ title, description, path: "/contact" })
 * Vite SPA:        <Seo title="…" description="…" path="/contact" />  (src/seo/Seo.tsx applies the same tags)
 */
import { SITE } from "@/site.config";

export type SeoInput = {
  title?: string | undefined;
  description?: string | undefined;
  /** Route path, e.g. "/contact". Used for the absolute canonical + og:url. */
  path?: string | undefined;
  /** Share image: path under /public or absolute URL. Defaults to SITE.ogImage. */
  image?: string | undefined;
  /** true for account, admin, cart, checkout and other private pages. */
  noindex?: boolean | undefined;
  type?: "website" | "article" | undefined;
};

export type HeadMeta =
  { title: string } | { name: string; content: string } | { property: string; content: string };

export type HeadLink = { rel: string; href: string; hrefLang?: string };

/** Absolute URL on the real production domain. */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  if (path === "/") return `${SITE.url}/`;
  return `${SITE.url}${path.replace(/\/+$/, "")}`;
}

export function seoTags(input: SeoInput = {}): { meta: HeadMeta[]; links: HeadLink[] } {
  const title = input.title ?? SITE.defaultTitle;
  const description = input.description ?? SITE.defaultDescription;
  const image = input.image ?? SITE.ogImage;

  const meta: HeadMeta[] = [
    { title },
    { name: "description", content: description },
    { property: "og:site_name", content: SITE.name },
    { property: "og:locale", content: SITE.locale },
    { property: "og:type", content: input.type ?? "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
  if (image) {
    const abs = absoluteUrl(image);
    meta.push({ property: "og:image", content: abs }, { name: "twitter:image", content: abs });
  }
  if (input.noindex) meta.push({ name: "robots", content: "noindex, nofollow" });

  const links: HeadLink[] = [];
  if (input.path !== undefined && !input.noindex) {
    const canonical = absoluteUrl(input.path);
    meta.push({ property: "og:url", content: canonical });
    links.push({ rel: "canonical", href: canonical });
  }
  return { meta, links };
}

/** TanStack Start `head()` helper: same tags, ready to return from a route's head(). */
export function seoHead(input: SeoInput = {}) {
  return seoTags(input);
}

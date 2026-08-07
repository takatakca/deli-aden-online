import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { FEATURED_CATEGORIES } from "@/lib/menu";
import { SmartSearch } from "@/components/SmartSearch";
import { ArrowRight, Phone, ChefHat, Truck, Award, Clock, MapPin, Star } from "lucide-react";

const HERO_IMAGE =
  "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1600&q=70";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Les Délices d'Aden — Restaurant algérien, commander en ligne" },
      {
        name: "description",
        content:
          "Cuisine algérienne authentique, grillades, poissons, fast food et desserts faits maison. Ramassage et livraison.",
      },
      { property: "og:title", content: "Les Délices d'Aden — Restaurant algérien" },
      { property: "og:description", content: "Cuisine algérienne authentique. Commandez en ligne pour ramassage ou livraison." },
      { property: "og:url", content: "/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Restaurant",
          name: "Les Délices d'Aden",
          image: HERO_IMAGE,
          servesCuisine: ["Algerian", "Mediterranean"],
          priceRange: "$$",
          telephone: "+1-000-000-0000",
          email: "orders@deliaden.ca",
          address: {
            "@type": "PostalAddress",
            streetAddress: "Adresse du restaurant",
            addressLocality: "Québec",
            addressRegion: "QC",
            addressCountry: "CA",
          },
          openingHours: ["Mo-Th 11:00-22:00", "Fr-Sa 11:00-23:00", "Su 12:00-22:00"],
        }),
      },
    ],
  }),
  component: Home,
});

const VALUES = [
  { icon: ChefHat, title: "Faits maison", desc: "Recettes traditionnelles, produits frais du jour." },
  { icon: Truck, title: "Ramassage ou livraison", desc: "Sur place en 20 min ou livré chez vous." },
  { icon: Award, title: "Saveurs du Maghreb", desc: "Épices, grillades et pâtisseries authentiques." },
];

function Home() {
  const cats = FEATURED_CATEGORIES.slice(0, 6);
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:py-12">
      <div className="mb-6">
        <SmartSearch />
      </div>

      {/* BENTO GRID */}
      <section className="grid auto-rows-[minmax(0,auto)] gap-4 md:grid-cols-6">
        {/* Hero tile */}
        <div className="bento-tile md:col-span-4 md:row-span-2">
          <img
            src={HERO_IMAGE}
            alt="Plats algériens servis chez Les Délices d'Aden"
            className="absolute inset-0 h-full w-full object-cover opacity-30"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-background via-background/85 to-background/40" />
          <div className="relative p-7 md:p-12">
            <span className="category-bar text-[10px]">Cuisine algérienne authentique</span>
            <h1 className="mt-6 font-display text-4xl leading-[1.05] md:text-6xl">
              Les Délices <span className="text-gold-gradient">d'Aden</span>
              <span className="block text-foreground/70 italic">la table algérienne du Québec</span>
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base">
              Grillades au charbon, poissons du jour, fast food généreux et pâtisseries orientales
              faites maison. Commandez en ligne pour ramassage ou livraison.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/menu">
                <Button size="lg" className="gap-2">
                  Commander en ligne <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="tel:+10000000000">
                <Button size="lg" variant="outline" className="gap-2">
                  <Phone className="h-4 w-4" /> Appeler
                </Button>
              </a>
            </div>
          </div>
        </div>

        {/* Hours tile */}
        <div className="bento-tile md:col-span-2 p-6">
          <Clock className="h-5 w-5 text-primary" />
          <h2 className="mt-3 font-display text-2xl">Heures d'ouverture</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {[
              ["Lundi — Jeudi", "11h – 22h"],
              ["Vendredi — Samedi", "11h – 23h"],
              ["Dimanche", "12h – 22h"],
            ].map(([d, h]) => (
              <div key={d} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-2">
                <dt className="text-muted-foreground">{d}</dt>
                <dd className="font-medium text-primary">{h}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Rating tile */}
        <div className="bento-tile md:col-span-2 p-6">
          <div className="flex items-center gap-1 text-primary">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} className="h-4 w-4 fill-current" />
            ))}
          </div>
          <p className="mt-4 font-display text-xl italic leading-snug">
            « Le meilleur mechoui que j'ai mangé depuis mon départ d'Alger. »
          </p>
          <p className="mt-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">Client fidèle — Québec</p>
        </div>

        {/* Category tiles */}
        {cats.map((c, i) => (
          <Link
            key={c.id}
            to="/menu"
            hash={c.id}
            className={`bento-tile group ${i === 0 ? "md:col-span-3" : i === 1 ? "md:col-span-3" : "md:col-span-2"}`}
          >
            <div className={`overflow-hidden ${i < 2 ? "aspect-[16/9]" : "aspect-[4/3]"} bg-muted`}>
              <img
                src={c.image}
                alt={`Catégorie ${c.name} — Les Délices d'Aden`}
                loading="lazy"
                className="h-full w-full object-cover opacity-80 transition duration-700 group-hover:scale-105 group-hover:opacity-100"
              />
            </div>
            <div className="flex items-center justify-between gap-2 px-5 py-4">
              <span className="font-display text-xl">{c.name}</span>
              <ArrowRight className="h-4 w-4 text-primary transition group-hover:translate-x-1" />
            </div>
          </Link>
        ))}

        {/* Values tiles */}
        {VALUES.map((v) => (
          <div key={v.title} className="bento-tile md:col-span-2 p-6">
            <div className="grid h-11 w-11 place-items-center rounded-full hairline-gold text-primary">
              <v.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-display text-xl">{v.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{v.desc}</p>
          </div>
        ))}

        {/* Delivery tile */}
        <div className="bento-tile md:col-span-3 p-6">
          <MapPin className="h-5 w-5 text-primary" />
          <h2 className="mt-3 font-display text-2xl">Livraison au Québec</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Zones, frais et délais estimés selon votre code postal.
          </p>
          <Link to="/delivery" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
            Vérifier ma zone <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {/* CTA tile */}
        <div className="bento-tile md:col-span-3 flex flex-col justify-center p-8 text-center">
          <h2 className="font-display text-3xl md:text-4xl">Prêt à passer commande ?</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Menu complet, paiement sécurisé et suivi de commande en direct.
          </p>
          <div className="mt-6">
            <Link to="/menu">
              <Button size="lg" className="gap-2">
                Voir le menu <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

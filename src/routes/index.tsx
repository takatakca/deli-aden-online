import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { FEATURED_CATEGORIES } from "@/lib/menu";
import { ArrowRight, Phone, ChefHat, Truck, Award } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Les Délices d'Aden — Restaurant algérien, commander en ligne" },
      {
        name: "description",
        content:
          "Cuisine algérienne authentique, grillades, poissons, fast food et desserts faits maison. Ramassage et livraison.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10 opacity-25"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=1920&q=70')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background/85 to-background" />
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 md:py-28">
          <div className="max-w-3xl">
            <span className="category-bar text-xs">Cuisine algérienne authentique</span>
            <h1 className="mt-6 font-display text-5xl font-bold leading-tight text-foreground md:text-7xl">
              Les Délices <span className="text-primary">d'Aden</span> — Cuisine algérienne authentique
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              Cuisine algérienne authentique, grillades, poissons, fast food et desserts faits maison.
              Commandez en ligne pour ramassage ou livraison.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/menu">
                <Button size="lg" className="gap-2 text-base">
                  Commander en ligne <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/menu">
                <Button size="lg" variant="outline" className="text-base">Voir le menu</Button>
              </Link>
              <a href="tel:+10000000000">
                <Button size="lg" variant="ghost" className="gap-2 text-base">
                  <Phone className="h-4 w-4" /> Appeler le restaurant
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORIES */}
      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <span className="category-bar text-xs">Notre carte</span>
            <h2 className="mt-4 font-display text-3xl font-bold md:text-4xl">Explorez nos catégories</h2>
          </div>
          <Link to="/menu" className="hidden text-sm font-medium text-primary hover:underline md:inline">
            Voir tout le menu →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {FEATURED_CATEGORIES.map((c) => (
            <Link key={c.id} to="/menu" hash={c.id} className="group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="aspect-square overflow-hidden bg-muted">
                <img src={c.image} alt={c.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
              </div>
              <div className="p-3 text-center">
                <div className="font-display text-base font-semibold text-foreground">{c.name}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* VALUES */}
      <section className="bg-secondary/40">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-16 md:grid-cols-3">
          {[
            { icon: ChefHat, title: "Plats faits maison", desc: "Recettes traditionnelles préparées avec des produits frais." },
            { icon: Truck, title: "Ramassage ou livraison", desc: "Commandez et récupérez sur place ou faites-vous livrer." },
            { icon: Award, title: "Qualité algérienne", desc: "Saveurs authentiques du Maghreb dans chaque assiette." },
          ].map((v) => (
            <div key={v.title} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
                <v.icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-xl font-semibold">{v.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{v.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-20 text-center">
        <h2 className="font-display text-4xl font-bold md:text-5xl">Prêt à passer commande ?</h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Découvrez notre menu complet et faites livrer vos plats préférés.
        </p>
        <div className="mt-8">
          <Link to="/menu">
            <Button size="lg" className="gap-2 text-base">
              Commander en ligne <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

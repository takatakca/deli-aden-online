import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "À propos — Les Délices d'Aden" },
      { name: "description", content: "Notre histoire, notre cuisine algérienne authentique." },
    ],
  }),
  component: About,
});

function About() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <span className="category-bar text-xs">À propos</span>
      <h1 className="mt-4 font-display text-4xl font-bold md:text-5xl">Notre histoire</h1>
      <div className="mt-8 grid gap-10 md:grid-cols-[1fr_1.2fr] md:items-center">
        <img
          src="https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=70"
          alt="Restaurant Les Délices d'Aden — salle de cuisine algérienne"
          className="aspect-square rounded-2xl object-cover shadow-lg"
        />
        <div className="space-y-4 text-lg leading-relaxed text-foreground/85">
          <p>
            Bienvenue chez <strong>Les Délices d'Aden</strong>, votre destination pour une cuisine
            algérienne authentique au cœur du Québec. Nos chefs préparent chaque plat avec passion,
            en suivant les recettes traditionnelles transmises de génération en génération.
          </p>
          <p>
            Du tajine zitoune au couscous royal, en passant par les grillades parfumées et nos
            desserts faits maison, nous célébrons les saveurs riches et généreuses du Maghreb.
          </p>
          <p>
            Que vous veniez sur place ou commandiez en livraison, notre engagement reste le même :
            vous offrir une expérience culinaire mémorable.
          </p>
        </div>
      </div>
    </div>
  );
}

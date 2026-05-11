import { Link } from "@tanstack/react-router";
import { Phone, Mail, MapPin, Clock } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-primary text-primary-foreground">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-4">
        <div>
          <div className="font-display text-xl font-bold">Les Délices d'Aden</div>
          <p className="mt-2 text-sm opacity-80">
            Cuisine algérienne authentique, grillades, poissons, fast food et desserts faits maison.
          </p>
        </div>
        <div>
          <div className="mb-3 font-display font-semibold text-accent">Navigation</div>
          <ul className="space-y-2 text-sm opacity-90">
            <li><Link to="/menu">Menu</Link></li>
            <li><Link to="/about">À propos</Link></li>
            <li><Link to="/contact">Contact</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 font-display font-semibold text-accent">Heures d'ouverture</div>
          <ul className="space-y-1 text-sm opacity-90">
            <li className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> Lun – Jeu : 11h – 22h</li>
            <li className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> Ven – Sam : 11h – 23h</li>
            <li className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> Dim : 12h – 22h</li>
          </ul>
        </div>
        <div>
          <div className="mb-3 font-display font-semibold text-accent">Contact</div>
          <ul className="space-y-2 text-sm opacity-90">
            <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> (000) 000-0000</li>
            <li className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> orders@deliaden.ca</li>
            <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5" /> Adresse du restaurant, Québec</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-primary-foreground/10 py-4 text-center text-xs opacity-70">
        © {new Date().getFullYear()} Les Délices d'Aden Restaurant — Tous droits réservés
      </div>
    </footer>
  );
}

// FR-first i18n for the customer experience (FR / EN / ES).
// Admin, kitchen, dispatch and driver screens stay French — they are staff tools.
import { useSyncExternalStore } from "react";

export type Lang = "fr" | "en" | "es";
export const LANGS: { code: Lang; label: string; speech: string }[] = [
  { code: "fr", label: "FR", speech: "fr-CA" },
  { code: "en", label: "EN", speech: "en-CA" },
  { code: "es", label: "ES", speech: "es-ES" },
];

const DICT = {
  fr: {
    "nav.home": "Accueil",
    "nav.menu": "Menu",
    "nav.delivery": "Livraison",
    "nav.about": "À propos",
    "nav.contact": "Contact",
    "nav.account": "Compte",
    "nav.cart": "Panier",
    "nav.language": "Langue",
    "home.order": "Commander maintenant",
    "home.seeMenu": "Voir le menu",
    "home.popular": "Populaire maintenant",
    "home.recommended": "Vous aimerez peut-être",
    "home.pickup": "Ramassage estimé",
    "home.deliveryEta": "Livraison estimée",
    "home.open": "Ouvert",
    "home.closed": "Fermé",
    "search.title": "Assistant Deli Aden",
    "search.placeholder": "Qu'avez-vous envie de manger ?",
    "search.hint": "Essayez : quelque chose d'épicé avec poulet",
    "search.button": "Rechercher",
    "search.voice": "Rechercher par la voix",
    "search.listening": "Parlez maintenant…",
    "search.heard": "J'ai compris :",
    "search.noResults": "Aucun plat ne correspond. Essayez une autre envie.",
    "search.results": "Suggestions pour vous",
    "search.clear": "Effacer",
    "search.thinking": "Je regarde le menu…",
    "cart.checkout": "Commander",
    "cart.empty": "Votre panier est vide",
    "common.add": "Ajouter au panier",
    "common.customize": "Personnaliser",
    "common.unavailable": "Indisponible",
  },
  en: {
    "nav.home": "Home",
    "nav.menu": "Menu",
    "nav.delivery": "Delivery",
    "nav.about": "About",
    "nav.contact": "Contact",
    "nav.account": "Account",
    "nav.cart": "Cart",
    "nav.language": "Language",
    "home.order": "Order now",
    "home.seeMenu": "See the menu",
    "home.popular": "Popular right now",
    "home.recommended": "You might like",
    "home.pickup": "Pickup est.",
    "home.deliveryEta": "Delivery est.",
    "home.open": "Open",
    "home.closed": "Closed",
    "search.title": "Deli Aden Assistant",
    "search.placeholder": "What are you craving?",
    "search.hint": "Try: something spicy with chicken",
    "search.button": "Search",
    "search.voice": "Search by voice",
    "search.listening": "Speak now…",
    "search.heard": "I heard:",
    "search.noResults": "No dish matches. Try another craving.",
    "search.results": "Suggestions for you",
    "search.clear": "Clear",
    "search.thinking": "Checking the menu…",
    "cart.checkout": "Checkout",
    "cart.empty": "Your cart is empty",
    "common.add": "Add to cart",
    "common.customize": "Customize",
    "common.unavailable": "Unavailable",
  },
  es: {
    "nav.home": "Inicio",
    "nav.menu": "Menú",
    "nav.delivery": "Entrega",
    "nav.about": "Nosotros",
    "nav.contact": "Contacto",
    "nav.account": "Cuenta",
    "nav.cart": "Carrito",
    "nav.language": "Idioma",
    "home.order": "Ordenar ahora",
    "home.seeMenu": "Ver el menú",
    "home.popular": "Popular ahora",
    "home.recommended": "Quizás te guste",
    "home.pickup": "Recogida aprox.",
    "home.deliveryEta": "Entrega aprox.",
    "home.open": "Abierto",
    "home.closed": "Cerrado",
    "search.title": "Asistente Deli Aden",
    "search.placeholder": "¿Qué te apetece comer?",
    "search.hint": "Prueba: algo picante con pollo",
    "search.button": "Buscar",
    "search.voice": "Buscar por voz",
    "search.listening": "Habla ahora…",
    "search.heard": "Entendí:",
    "search.noResults": "Ningún plato coincide. Prueba otra idea.",
    "search.results": "Sugerencias para ti",
    "search.clear": "Borrar",
    "search.thinking": "Revisando el menú…",
    "cart.checkout": "Pagar",
    "cart.empty": "Tu carrito está vacío",
    "common.add": "Añadir al carrito",
    "common.customize": "Personalizar",
    "common.unavailable": "No disponible",
  },
} as const;

export type TKey = keyof typeof DICT.fr;

const KEY = "deliaden_lang";
let current: Lang = "fr";
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  const saved = window.localStorage.getItem(KEY) as Lang | null;
  if (saved && LANGS.some((l) => l.code === saved)) current = saved;
}

export const i18n = {
  get lang(): Lang {
    return current;
  },
  set(lang: Lang) {
    current = lang;
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, lang);
    if (typeof document !== "undefined") document.documentElement.lang = lang;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  t(key: TKey, lang: Lang = current): string {
    const table = DICT[lang] as Record<string, string>;
    return table[key] ?? (DICT.fr as Record<string, string>)[key] ?? key;
  },
  speechLocale(lang: Lang = current) {
    return LANGS.find((l) => l.code === lang)?.speech ?? "fr-CA";
  },
};

export function useLang(): Lang {
  return useSyncExternalStore(
    i18n.subscribe,
    () => current,
    () => "fr" as Lang,
  );
}

export function useT() {
  const lang = useLang();
  return { lang, t: (key: TKey) => i18n.t(key, lang) };
}

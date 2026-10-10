const INFO = {
  name: "Les Délices d'Aden",
  cuisine: "Algerian",
  description:
    "Cuisine algérienne authentique, grillades, poissons, fast food et desserts faits maison. Ramassage et livraison.",
  website: "https://deliaden.ca",
  email: "orders@deliaden.ca",
  city: "Québec, QC, Canada",
  currency: "CAD",
  languages: ["fr"],
  services: ["pickup", "delivery"],
  hours: {
    monday_thursday: "11:00–22:00",
    friday_saturday: "11:00–23:00",
    sunday: "12:00–22:00",
  },
  orderOnline: "https://deliaden.ca/menu",
};

export default function getRestaurantInfo() {
  return INFO;
}

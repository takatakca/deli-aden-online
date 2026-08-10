// ============================================================================
// MENU DATA — Easy to edit. Replace `image` URLs with your real photos later.
// To use a local image: put it in src/assets/ and import it at the top of this
// file, then reference the import. e.g. import tajine from "@/assets/tajine.jpg"
// ============================================================================

export type OptionChoice = { label: string; priceDelta?: number };
export type OptionGroup = {
  id: string;
  label: string;
  type: "single" | "multi";
  required?: boolean;
  choices: OptionChoice[];
};

export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  image: string;
  options?: OptionGroup[];
  combo?: boolean; // adds a Classique / Trio (+$4) toggle
};

export type MenuCategory = {
  id: string;
  name: string;
  blurb?: string;
  items: MenuItem[];
};

const img = (q: string) =>
  `https://images.unsplash.com/${q}?auto=format&fit=crop&w=800&q=70`;

const garnitureGroup: OptionGroup = {
  id: "garniture",
  label: "Garniture",
  type: "single",
  required: true,
  choices: [
    { label: "Frites" },
    { label: "Riz" },
    { label: "Salade" },
    { label: "Frites + Riz" },
    { label: "Frites + Salade" },
  ],
};
const sauceGroup: OptionGroup = {
  id: "sauce",
  label: "Sauce",
  type: "single",
  required: true,
  choices: [
    { label: "Sauce Fromage" },
    { label: "Sauce Poivrée" },
    { label: "Sauce Maison" },
    { label: "Sauce à la crème" },
  ],
};
const tacosOptions: OptionGroup[] = [
  {
    id: "size",
    label: "Taille",
    type: "single",
    required: true,
    choices: [{ label: "S" }, { label: "L", priceDelta: 2 }, { label: "XL", priceDelta: 4 }],
  },
  {
    id: "viande",
    label: "Viande",
    type: "single",
    required: true,
    choices: [{ label: "Poulet" }, { label: "Viande Hachée" }, { label: "Merguez" }],
  },
  {
    id: "sauces",
    label: "Sauces",
    type: "multi",
    choices: [
      { label: "Algérienne" },
      { label: "Mayonnaise" },
      { label: "Harissa" },
      { label: "Ketchup" },
      { label: "Cocktail" },
      { label: "Sauce à l'ail" },
    ],
  },
];

export const COMBO_DELTA = 4;

export const MENU: MenuCategory[] = [
  {
    id: "plats-algeriens",
    name: "Plats Algériens",
    blurb: "Spécialités traditionnelles, mijotées avec amour.",
    items: [
      {
        id: "rechta",
        name: "Rechta",
        description:
          "Fines pâtes en nouilles servies avec viande tendre, poulet ou légumes. Un plat traditionnel réconfortant et raffiné.",
        price: 14.99,
        image: img("photo-1612929633738-8fe44f7ec841"),
      },
      {
        id: "tajine-zitoun",
        name: "Tajine Zitoun",
        description: "Plat mijoté de viande ou poulet avec olives vertes et sauce parfumée.",
        price: 12.99,
        image: img("photo-1547592180-85f173990554"),
      },
      {
        id: "dolma",
        name: "Dolma",
        description: "Légumes farcis savoureux dans une sauce maison.",
        price: 14.99,
        image: img("photo-1601050690597-df0568f70950"),
      },
      {
        id: "chakchoukha",
        name: "Chakchoukha Biskria",
        description: "Plat traditionnel avec msemen, sauce rouge, légumes et viande.",
        price: 14.99,
        image: img("photo-1574484284002-952d92456975"),
      },
      {
        id: "couscous-royal",
        name: "Couscous Royal",
        description: "Semoule légère avec légumes, pois chiches et viande dans une sauce parfumée.",
        price: 12.99,
        image: img("photo-1541518763669-27fef04b14ea"),
      },
      {
        id: "mtewem",
        name: "Mtewem",
        description: "Viande marinée et boulettes dans une sauce riche à base de tomate et d'épices.",
        price: 14.99,
        image: img("photo-1546069901-ba9599a7e63c"),
      },
      {
        id: "zfiti",
        name: "Zfiti Bou-Saada",
        description: "Plat traditionnel épicé avec galette émiettée, tomate, piment et huile d'olive.",
        price: 14.99,
        image: img("photo-1504674900247-0877df9cc836"),
      },
    ],
  },
  {
    id: "grillades",
    name: "Grillades",
    blurb: "Grillées à la perfection, servies avec garniture et sauce au choix.",
    items: [
      { id: "mix-grill", name: "Mix Grill", description: "Assortiment savoureux de poulet, veau et merguez épicées.", price: 19.99, image: img("photo-1544025162-d76694265947"), options: [garnitureGroup, sauceGroup] },
      { id: "kebda", name: "Kebda Mchermla", description: "Foie tendre mijoté dans une sauce épicée à base de tomates, ail et citron.", price: 17.99, image: img("photo-1555939594-58d7cb561ad1"), options: [garnitureGroup, sauceGroup] },
      { id: "chich-taouk", name: "Chich Taouk Poulet", description: "Morceaux de poulet marinés au yaourt, citron et épices.", price: 16.99, image: img("photo-1633237308525-cd587cf71926"), options: [garnitureGroup, sauceGroup] },
      { id: "chich-kebab", name: "Chich Kebab", description: "Brochettes de viande hachée finement épicée et grillée à la perfection.", price: 17.99, image: img("photo-1529193591184-b1d58069ecdd"), options: [garnitureGroup, sauceGroup] },
      { id: "supreme", name: "Suprême de Poulet Grillé", description: "Filet de poulet tendre et juteux, délicatement assaisonné.", price: 16.99, image: img("photo-1598103442097-8b74394b95c6"), options: [garnitureGroup, sauceGroup] },
      { id: "poulet-roti", name: "Poulet Rôti au Four", description: "Poulet tendre et juteux, assaisonné d'herbes et d'épices, peau dorée et croustillante.", price: 18.99, image: img("photo-1600891964092-4316c288032e"), options: [garnitureGroup, sauceGroup] },
      { id: "mechoui", name: "Mechoui / Mhamer (Rôti au four)", description: "Viande tendre et parfumée, rôtie lentement avec épices et touche d'ail.", price: 22.99, image: img("photo-1558030006-450675393462"), options: [garnitureGroup, sauceGroup] },
    ],
  },
  {
    id: "fast-food",
    name: "Fast Food",
    blurb: "Pizza, chawarma, paninis, burgers, tacos.",
    items: [
      { id: "pizza-couverte", name: "Pizza Couverte", description: "Pizza couverte, pâte moelleuse et garniture généreuse.", price: 14.99, image: img("photo-1574071318508-1cdbab80d002"), combo: true },
      { id: "mini-pizza", name: "Mini Pizza", description: "Format individuel, parfait pour une pause gourmande.", price: 8.99, image: img("photo-1565299624946-b28f40a0ae38") },
      { id: "souffle", name: "Soufflé", description: "Soufflé doré, croustillant et fondant à l'intérieur.", price: 9.99, image: img("photo-1513104890138-7c749659a591") },
      { id: "pizza-carre", name: "Pizza Carré", description: "Pizza carrée style maison, généreuse en garniture.", price: 13.99, image: img("photo-1571407970349-bc81e7e96d47") },
      { id: "chawarma-poulet", name: "Chawarma Poulet", description: "Chawarma poulet mariné, sauces maison.", price: 11.99, image: img("photo-1561651823-34feb02250e4"), combo: true },
      { id: "sandwich-vh", name: "Sandwich Viande Hachée", description: "Sandwich généreux de viande hachée épicée.", price: 11.99, image: img("photo-1414235077428-338989a2e8c0"), combo: true },
      { id: "sandwich-poulet-roti", name: "Sandwich Poulet Rôti", description: "Sandwich poulet rôti, salade et sauces.", price: 11.99, image: img("photo-1539252554453-80ab65ce3586"), combo: true },
      { id: "panini-vh", name: "Panini Viande Hachée", price: 10.99, image: img("photo-1559181567-c3190ca9959b"), combo: true },
      { id: "panini-poulet", name: "Panini Poulet Mariné", price: 10.99, image: img("photo-1521305916504-4a1121188589"), combo: true },
      { id: "panini-thon", name: "Panini Thon", price: 10.99, image: img("photo-1509440159596-0249088772ff"), combo: true },
      { id: "panini-3f", name: "Panini 3 Fromages", price: 10.99, image: img("photo-1528736235302-52922df5c122"), combo: true },
      { id: "cheese-burger", name: "Cheese Burger", price: 10.99, image: img("photo-1568901346375-23c9450c58cd"), combo: true },
      { id: "chicken-burger", name: "Chicken Burger", price: 11.99, image: img("photo-1550547660-d9450f859349"), combo: true },
      { id: "double-burger", name: "Double Burger", price: 13.99, image: img("photo-1572802419224-296b0aeee0d9"), combo: true },
      { id: "big-burger", name: "Big Burger", price: 14.99, image: img("photo-1571091718767-18b5b1457add"), combo: true },
      { id: "tacos-classique", name: "Tacos Classique", description: "Composez votre tacos en 4 étapes.", price: 9.99, image: img("photo-1565299585323-38d6b0865b47"), options: tacosOptions, combo: true },
      { id: "tacos-gratine", name: "Tacos Gratiné", description: "Tacos gratiné au fromage fondu.", price: 11.99, image: img("photo-1599974579688-8dbdd335c77f"), options: tacosOptions, combo: true },
    ],
  },
  {
    id: "poissons",
    name: "Poissons",
    blurb: "Poissons frais, grillés ou poêlés, servis avec accompagnement.",
    items: [
      { id: "sardine", name: "Plat Sardine", description: "Sardines grillées ou poêlées, relevées d'épices, servies avec salade fraîche, riz parfumé ou pommes de terre.", price: 15.99, image: img("photo-1595295333158-4742f28fbd85"), options: [garnitureGroup] },
      { id: "merlan", name: "Plat Merlan", description: "Filet de merlan tendre, délicatement grillé ou poêlé, accompagné de votre choix.", price: 17.99, image: img("photo-1519708227418-c8fd9a32b7a2"), options: [garnitureGroup] },
      { id: "dorade", name: "Plat Dorade", description: "Dorade grillée à la perfection, accompagnée de salade fraîche, riz parfumé ou pommes de terre dorées.", price: 22.99, image: img("photo-1559847844-5315695dadae"), options: [garnitureGroup] },
    ],
  },
  {
    id: "plats-sales",
    name: "Plats Salés",
    blurb: "Spécialités salées maison.",
    items: [
      { id: "mhadjeb", name: "Mhadjeb", description: "Délicieuses crêpes fines à base de semoule, farcies de légumes épicés.", price: 3.99, image: img("photo-1516684669134-de6f7c473a2a") },
      { id: "frites-omlette", name: "Frites + Omlettes", price: 8.0, image: img("photo-1623238913973-21e45cced554") },
      { id: "frites", name: "Frites", price: 4.0, image: img("photo-1573080496219-bb080dd4f877") },
      { id: "brik", name: "Brik Annabi", description: "Feuilleté croustillant farci de viande ou de thon, parfumé aux épices et herbes traditionnelles.", price: 8.0, image: img("photo-1466978913421-dad2ebd01d17") },
      { id: "hmiss", name: "Hmiss", description: "Salade cuite de poivrons, tomates et épices.", price: 7.99, image: img("photo-1604152135912-04a022e23696") },
      { id: "bourek", name: "Bourek", description: "Feuilletés croustillants garnis de viande, épices et herbes fraîches.", price: 3.0, image: img("photo-1563245372-f21724e3856d") },
      { id: "msemen", name: "Msemen", description: "Crêpes feuilletées dorées à base de semoule et d'huile végétale.", price: 2.5, image: img("photo-1565299543923-37dd37887442") },
      { id: "macedoine", name: "Salade Macédoine", description: "Mélange coloré de légumes croquants et de pommes de terre, sauce crémeuse.", price: 7.99, image: img("photo-1505253758473-96b7015fcd40") },
    ],
  },
  {
    id: "desserts",
    name: "Desserts",
    blurb: "Douceurs maison pour finir en beauté.",
    items: [
      { id: "tiramisu", name: "Tiramisu au café", description: "Biscuits imbibés de café, crème onctueuse au mascarpone et cacao.", price: 6.99, image: img("photo-1571877227200-a0d98ea607e9") },
      { id: "flan", name: "Flan au caramel", description: "Crème délicate à la vanille, nappée d'un caramel doré et fondant.", price: 5.99, image: img("photo-1488477181946-6428a0291777") },
      { id: "kalb-el-louz", name: "Kalb El Louz", description: "Gâteau traditionnel à base de semoule, parfumé à l'amande, imbibé de sirop de fleur d'oranger.", price: 5.99, image: img("photo-1519915028121-7d3463d20b13") },
      { id: "tarte-pecan", name: "Tarte Pécan", description: "Pâte sablée garnie d'un mélange sucré et crémeux de noix de pécan, caramel et sirop d'érable.", price: 6.99, image: img("photo-1568571780765-9276ac8b75a2") },
    ],
  },
  {
    id: "boissons-chaudes",
    name: "Boissons Chaudes",
    blurb: "Cafés, laits, thés.",
    items: [
      { id: "espresso", name: "Espresso", description: "Court ou allongé.", price: 2.99, image: img("photo-1510707577719-ae7c14805e3a") },
      { id: "latte", name: "Latté", price: 2.99, image: img("photo-1572442388796-11668a67e53d") },
      { id: "mochaccino", name: "Mochaccino", price: 2.99, image: img("photo-1517701604599-bb29b565090c") },
      { id: "americano", name: "Americano", price: 2.99, image: img("photo-1497935586351-b67a49e012bf") },
      { id: "cappuccino", name: "Cappuccino", price: 2.99, image: img("photo-1572442388796-11668a67e53d") },
      { id: "arabica", name: "Arabica", price: 2.99, image: img("photo-1497636577773-f1231844b336") },
      { id: "lait-choco", name: "Lait Choco Milk", price: 2.49, image: img("photo-1542990253-0d0f5be5f0ed") },
      { id: "original-milk", name: "Original Milk", price: 2.49, image: img("photo-1550583724-b2692b85b150") },
      { id: "green-tea", name: "Green Tea", price: 2.0, image: img("photo-1556679343-c7306c1976bc") },
      { id: "thai-tea", name: "Thai Tea", price: 2.0, image: img("photo-1558160074-4d7d8bdf4256") },
      { id: "milk-tea", name: "Milk Tea", price: 2.0, image: img("photo-1558160074-4d7d8bdf4256") },
      { id: "lemon-tea", name: "Lemon Tea", price: 2.0, image: img("photo-1556881286-fc6915169721") },
      { id: "black-tea", name: "Black Tea", price: 2.0, image: img("photo-1597481499750-3e6b22637e12") },
    ],
  },
  {
    id: "soupes",
    name: "Soupes",
    blurb: "Soupes traditionnelles, généreuses et parfumées.",
    items: [
      { id: "loubia", name: "Soupe Loubia", description: "Soupe traditionnelle aux haricots blancs, tomate et épices.", price: 7.99, image: img("photo-1512058564366-18510be2db19") },
      { id: "lentilles", name: "Soupe Lentilles", description: "Soupe veloutée de lentilles, parfumée aux épices.", price: 7.99, image: img("photo-1476718406336-bb5a9690ee2a") },
      { id: "chorba", name: "Chorba Frik", description: "Soupe traditionnelle algérienne au blé concassé et viande.", price: 7.99, image: img("photo-1547592166-23ac45744acd") },
    ],
  },
];

export const FEATURED_CATEGORIES = MENU.map((c) => ({
  id: c.id,
  name: c.name,
  image: c.items[0]?.image ?? "",
}));

export function findItem(id: string): MenuItem | undefined {
  for (const c of MENU) {
    const it = c.items.find((i) => i.id === id);
    if (it) return it;
  }
  return undefined;
}

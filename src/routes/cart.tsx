import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useCart, cartStore, computeTotals, fmt } from "@/lib/cart-store";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Panier — Les Délices d'Aden" },
      { name: "description", content: "Vérifiez vos plats sélectionnés et passez à la caisse pour finaliser votre commande chez Les Délices d'Aden." },
      { property: "og:title", content: "Votre panier — Les Délices d'Aden" },
      { property: "og:description", content: "Récapitulatif de votre commande chez Les Délices d'Aden." },
      { property: "og:url", content: "/cart" },
    ],
    links: [{ rel: "canonical", href: "/cart" }],
  }),
  component: CartPage,
});

function CartPage() {
  const cart = useCart();
  const totals = computeTotals(cart);

  if (cart.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <ShoppingBag className="mx-auto h-16 w-16 text-muted-foreground/50" />
        <h1 className="mt-4 font-display text-3xl font-bold">Votre panier est vide</h1>
        <p className="mt-2 text-muted-foreground">Ajoutez des plats à partir de notre menu.</p>
        <Link to="/menu" className="mt-6 inline-block">
          <Button size="lg">Voir le menu</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-6 font-display text-3xl font-bold">Panier</h1>
      <div className="grid gap-8 md:grid-cols-[1fr_360px]">
        <ul className="space-y-3">
          {cart.map((line) => (
            <li key={line.uid} className="flex gap-4 rounded-xl border border-border bg-card p-3 shadow-sm">
              <img src={line.image} alt={line.name} className="h-24 w-24 rounded-lg object-cover" />
              <div className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-base font-semibold">{line.name}</h2>
                  <span className="font-display font-bold text-primary">{fmt(line.unitPrice * line.quantity)}</span>
                </div>
                {line.options && line.options.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {line.options.map((o) => (
                      <li key={o.groupLabel}>
                        <span className="font-medium">{o.groupLabel}:</span> {o.values.join(", ")}
                      </li>
                    ))}
                  </ul>
                )}
                {line.notes && (
                  <p className="mt-1 text-xs italic text-muted-foreground">Note: {line.notes}</p>
                )}
                <div className="mt-auto flex items-center justify-between pt-2">
                  <div className="flex items-center gap-1 rounded-full border border-border">
                    <button aria-label={`Diminuer la quantité de ${line.name}`} onClick={() => cartStore.updateQty(line.uid, line.quantity - 1)} className="p-1.5"><Minus className="h-3.5 w-3.5" /></button>
                    <span className="w-7 text-center text-sm font-semibold">{line.quantity}</span>
                    <button aria-label={`Augmenter la quantité de ${line.name}`} onClick={() => cartStore.updateQty(line.uid, line.quantity + 1)} className="p-1.5"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                  <button onClick={() => cartStore.remove(line.uid)} className="text-xs text-destructive hover:underline">
                    <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Retirer
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="h-fit rounded-2xl border border-border bg-card p-5 shadow-sm md:sticky md:top-24">
          <h2 className="font-display text-lg font-semibold">Récapitulatif</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Sous-total</dt><dd>{fmt(totals.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">TPS (5%)</dt><dd>{fmt(totals.gst)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">TVQ (9.975%)</dt><dd>{fmt(totals.qst)}</dd></div>
            <div className="my-2 border-t border-border" />
            <div className="flex justify-between text-base font-bold">
              <dt>Total</dt><dd className="text-primary">{fmt(totals.total)}</dd>
            </div>
          </dl>
          <Link to="/checkout"><Button className="mt-5 w-full" size="lg">Finaliser la commande</Button></Link>
          <Link to="/menu" className="mt-2 block text-center text-xs text-muted-foreground hover:underline">Continuer mes achats</Link>
        </aside>
      </div>
    </div>
  );
}

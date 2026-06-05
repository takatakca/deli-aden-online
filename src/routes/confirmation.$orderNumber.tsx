import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type AdminOrder, type PublicSettings } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Phone } from "lucide-react";
import { fmt } from "@/lib/cart-store";

export const Route = createFileRoute("/confirmation/$orderNumber")({
  head: ({ params }) => ({
    meta: [
      { title: `Commande ${params.orderNumber} — Les Délices d'Aden` },
      { name: "description", content: `Confirmation de la commande ${params.orderNumber} chez Les Délices d'Aden. Merci de votre confiance !` },
      { property: "og:title", content: `Commande ${params.orderNumber} confirmée` },
      { property: "og:description", content: "Votre commande est bien enregistrée chez Les Délices d'Aden." },
      { property: "og:url", content: `/confirmation/${params.orderNumber}` },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: `/confirmation/${params.orderNumber}` }],
  }),
  component: ConfirmationPage,
});

function ConfirmationPage() {
  const { orderNumber } = Route.useParams();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getOrder(orderNumber).then((r) => setOrder(r.order)).catch(() => setOrder(null)),
      api.getSettings().then((r) => setSettings(r.settings)).catch(() => setSettings(null)),
    ]).finally(() => setLoading(false));
  }, [orderNumber]);

  if (loading) return <div className="p-20 text-center text-muted-foreground">Chargement...</div>;
  if (!order)
    return (
      <div className="p-20 text-center">
        <h1 className="font-display text-2xl">Commande introuvable</h1>
        <Link to="/" className="mt-4 inline-block"><Button>Accueil</Button></Link>
      </div>
    );

  const paymentLabel = {
    pay_at_restaurant: "Au restaurant",
    cash: "Comptant",
    card_on_arrival: "Carte à l'arrivée",
  }[order.payment_method] ?? order.payment_method;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-16 w-16 text-primary" />
        <h1 className="mt-4 font-display text-3xl font-bold">Commande reçue !</h1>
        <p className="mt-2 text-muted-foreground">Merci {order.customer_name}, nous préparons votre commande.</p>
        <div className="mt-4 inline-block rounded-full bg-primary px-5 py-2 font-display text-lg font-bold text-primary-foreground">
          N° {order.order_number}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="font-display text-xl font-semibold">Détails</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <Item label="Type" value={order.order_type === "pickup" ? "Ramassage" : "Livraison"} />
          <Item label="Heure" value={order.preferred_time} />
          <Item label="Téléphone" value={order.customer_phone} />
          {order.customer_email && <Item label="Email" value={order.customer_email} />}
          {order.delivery_address && <Item label="Adresse" value={order.delivery_address} />}
          <Item label="Paiement" value={paymentLabel} />
        </dl>
        {order.special_notes && (
          <p className="mt-4 rounded-lg bg-secondary p-3 text-sm">
            <strong>Instructions:</strong> {order.special_notes}
          </p>
        )}

        <h3 className="mt-6 font-display text-lg font-semibold">Articles</h3>
        <ul className="mt-2 divide-y divide-border">
          {order.items.map((it, i) => (
            <li key={i} className="flex justify-between gap-3 py-3 text-sm">
              <div>
                <div className="font-medium">{it.quantity}× {it.name}</div>
                {it.options && it.options.length > 0 && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {it.options.map((o) => `${o.groupLabel}: ${o.values.join(", ")}`).join(" • ")}
                  </div>
                )}
                {it.notes && <div className="mt-0.5 text-xs italic text-muted-foreground">Note: {it.notes}</div>}
              </div>
              <div className="font-semibold">{fmt(it.unitPrice * it.quantity)}</div>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">Sous-total</dt><dd>{fmt(order.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">TPS</dt><dd>{fmt(order.gst)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">TVQ</dt><dd>{fmt(order.qst)}</dd></div>
          <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold">
            <dt>Total</dt><dd className="text-primary">{fmt(order.total)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/track/$orderNumber" params={{ orderNumber: order.order_number }}>
          <Button>Suivre ma commande en direct</Button>
        </Link>
        <Link to="/"><Button variant="outline">Retour à l'accueil</Button></Link>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

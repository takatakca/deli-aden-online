import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useCart, cartStore, computeTotals, fmt } from "@/lib/cart-store";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Finaliser la commande — Les Délices d'Aden" }] }),
  component: CheckoutPage,
});

function CheckoutPage() {
  const cart = useCart();
  const totals = computeTotals(cart);
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [orderType, setOrderType] = useState<"pickup" | "delivery">("pickup");
  const [address, setAddress] = useState("");
  const [time, setTime] = useState("ASAP");
  const [scheduledTime, setScheduledTime] = useState("");
  const [payment, setPayment] = useState<"pay_at_restaurant" | "cash" | "card_on_arrival">("pay_at_restaurant");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  if (cart.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl font-bold">Votre panier est vide</h1>
        <Link to="/menu" className="mt-4 inline-block"><Button>Voir le menu</Button></Link>
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error("Nom et téléphone requis");
      return;
    }
    if (orderType === "delivery" && !address.trim()) {
      toast.error("Adresse de livraison requise");
      return;
    }
    setLoading(true);
    try {
      const res = await api.createOrder({
        customer: { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined },
        orderType,
        deliveryAddress: orderType === "delivery" ? address.trim() : "",
        preferredTime: time === "scheduled" ? scheduledTime || "Programmé" : "ASAP",
        paymentMethod: payment,
        specialNotes: notes.trim(),
        items: cart.map((c) => ({
          itemId: c.itemId,
          name: c.name,
          unitPrice: c.unitPrice,
          quantity: c.quantity,
          options: c.options,
          combo: c.combo,
          notes: c.notes,
        })),
        subtotal: totals.subtotal,
        gst: totals.gst,
        qst: totals.qst,
        total: totals.total,
      });
      cartStore.clear();
      toast.success("Commande envoyée !");
      navigate({ to: "/confirmation/$orderNumber", params: { orderNumber: res.orderNumber } });
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'envoi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-6 font-display text-3xl font-bold">Finaliser la commande</h1>
      <form onSubmit={onSubmit} className="grid gap-8 md:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Section title="Vos coordonnées">
            <Field label="Nom complet *"><Input required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
            <Field label="Téléphone *"><Input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} /></Field>
            <Field label="Email (optionnel)"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} /></Field>
          </Section>

          <Section title="Mode de récupération">
            <RadioGroup value={orderType} onValueChange={(v) => setOrderType(v as "pickup" | "delivery")} className="grid grid-cols-2 gap-3">
              <RadioCard value="pickup" current={orderType} label="Ramassage" desc="Récupérer au restaurant" />
              <RadioCard value="delivery" current={orderType} label="Livraison" desc="Livré à votre adresse" />
            </RadioGroup>
            {orderType === "delivery" && (
              <Field label="Adresse de livraison *">
                <Textarea required value={address} onChange={(e) => setAddress(e.target.value)} maxLength={400} />
              </Field>
            )}
          </Section>

          <Section title="Heure préférée">
            <RadioGroup value={time} onValueChange={setTime} className="grid grid-cols-2 gap-3">
              <RadioCard value="ASAP" current={time} label="Dès que possible" desc="Préparé immédiatement" />
              <RadioCard value="scheduled" current={time} label="Programmé" desc="Choisir une heure" />
            </RadioGroup>
            {time === "scheduled" && (
              <Field label="Heure souhaitée">
                <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
              </Field>
            )}
          </Section>

          <Section title="Mode de paiement">
            <RadioGroup value={payment} onValueChange={(v) => setPayment(v as typeof payment)} className="grid gap-3 sm:grid-cols-3">
              <RadioCard value="pay_at_restaurant" current={payment} label="Au restaurant" desc="Sur place" />
              <RadioCard value="cash" current={payment} label="Comptant" desc="À la livraison" />
              <RadioCard value="card_on_arrival" current={payment} label="Carte" desc="À l'arrivée" />
            </RadioGroup>
          </Section>

          <Section title="Instructions spéciales">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Allergies, préférences..." />
          </Section>
        </div>

        <aside className="h-fit rounded-2xl border border-border bg-card p-5 shadow-sm md:sticky md:top-24">
          <h2 className="font-display text-lg font-semibold">Votre commande</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {cart.map((c) => (
              <li key={c.uid} className="flex justify-between gap-2">
                <span>{c.quantity}× {c.name}</span>
                <span className="font-medium">{fmt(c.unitPrice * c.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Sous-total</dt><dd>{fmt(totals.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">TPS (5%)</dt><dd>{fmt(totals.gst)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">TVQ (9.975%)</dt><dd>{fmt(totals.qst)}</dd></div>
            <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold">
              <dt>Total</dt><dd className="text-primary">{fmt(totals.total)}</dd>
            </div>
          </dl>
          <Button type="submit" size="lg" className="mt-5 w-full" disabled={loading}>
            {loading ? "Envoi..." : "Confirmer la commande"}
          </Button>
        </aside>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-4 font-display text-lg font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-sm">{label}</Label>
      {children}
    </div>
  );
}

function RadioCard({ value, current, label, desc }: { value: string; current: string; label: string; desc: string }) {
  const selected = value === current;
  return (
    <Label
      className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition ${selected ? "border-primary bg-primary/5" : "border-border bg-background hover:border-primary/40"}`}
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem value={value} />
        <span className="font-medium">{label}</span>
      </div>
      <span className="pl-6 text-xs text-muted-foreground">{desc}</span>
    </Label>
  );
}

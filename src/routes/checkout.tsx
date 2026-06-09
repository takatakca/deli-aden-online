import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCart, cartStore, computeTotals, fmt } from "@/lib/cart-store";
import { api, type PublicSettings, type PaymentQuote, type CreateOrderPayload } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  Trash2,
  Phone,
  MapPin,
  ShoppingBag,
  Truck,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Clock,
  AlertTriangle,
  CreditCard,
  Tag,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Finaliser la commande — Les Délices d'Aden" },
      { name: "description", content: "Renseignez vos coordonnées et confirmez votre commande pour ramassage ou livraison chez Les Délices d'Aden." },
      { property: "og:title", content: "Finaliser la commande — Les Délices d'Aden" },
      { property: "og:description", content: "Confirmez votre commande pour ramassage ou livraison." },
      { property: "og:url", content: "/checkout" },
    ],
    links: [{ rel: "canonical", href: "/checkout" }],
  }),
  component: CheckoutPage,
});

type Step = 1 | 2 | 3;

function formatCAPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  const d = digits.startsWith("1") ? digits.slice(1) : digits;
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
}
function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

function CheckoutPage() {
  const cart = useCart();
  const baseTotals = computeTotals(cart);
  const navigate = useNavigate();

  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  useEffect(() => {
    api.getSettings()
      .then((r) => { setSettings(r.settings); setSettingsError(null); })
      .catch((e) => { setSettings(null); setSettingsError(e instanceof Error ? e.message : "Erreur"); });
  }, []);

  const allowPickup = settings?.pickup_enabled !== false;
  const allowDelivery = settings?.delivery_enabled !== false;
  const closed = settings ? !settings.is_open : false;
  const paused = settings?.orders_paused === true;

  // Step state
  const [step, setStep] = useState<Step>(1);
  useEffect(() => { console.info("[checkout]", "step_view", { step }); }, [step]);

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [orderType, setOrderType] = useState<"pickup" | "delivery">("pickup");
  const [address, setAddress] = useState("");
  const [unit, setUnit] = useState("");
  const [doorCode, setDoorCode] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [time, setTime] = useState("ASAP");
  const [scheduledTime, setScheduledTime] = useState("");
  const [payment, setPayment] = useState<"pay_at_restaurant" | "cash" | "card_on_arrival" | "online">("pay_at_restaurant");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Phase 3 — coupon + online payment
  const [couponInput, setCouponInput] = useState("");
  const [couponApplied, setCouponApplied] = useState<PaymentQuote["coupon"] | null>(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponFreeDelivery, setCouponFreeDelivery] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  useEffect(() => {
    api.paymentsConfig().then((r) => {
      setPaymentsEnabled(!!r.enabled);
      setPublishableKey(r.publishableKey);
    }).catch(() => { setPaymentsEnabled(false); });
  }, []);

  useEffect(() => {
    if (!settings) return;
    if (orderType === "pickup" && !allowPickup && allowDelivery) setOrderType("delivery");
    if (orderType === "delivery" && !allowDelivery && allowPickup) setOrderType("pickup");
  }, [settings, allowPickup, allowDelivery, orderType]);

  const baseDeliveryFee = useMemo(() => {
    if (!settings || orderType !== "delivery") return 0;
    if (settings.free_delivery_threshold > 0 && baseTotals.subtotal >= settings.free_delivery_threshold) return 0;
    return settings.delivery_fee || 0;
  }, [settings, orderType, baseTotals.subtotal]);

  const deliveryFee = couponFreeDelivery ? 0 : baseDeliveryFee;

  const totals = useMemo(() => {
    const taxable = Math.max(0, baseTotals.subtotal - couponDiscount);
    const gstRate = settings?.gst_rate ?? 0.05;
    const qstRate = settings?.qst_rate ?? 0.09975;
    const gst = +(taxable * gstRate).toFixed(2);
    const qst = +(taxable * qstRate).toFixed(2);
    const total = +(taxable + gst + qst + deliveryFee).toFixed(2);
    return { subtotal: baseTotals.subtotal, gst, qst, total };
  }, [baseTotals.subtotal, couponDiscount, deliveryFee, settings?.gst_rate, settings?.qst_rate]);

  const minOrder = settings?.min_order || 0;
  const belowMin = minOrder > 0 && baseTotals.subtotal < minOrder;
  const estimatedMin = orderType === "delivery"
    ? (settings?.est_delivery_min || 0)
    : (settings?.est_pickup_min || 0);
  const freeThreshold = settings?.free_delivery_threshold || 0;
  const freeProgress = freeThreshold > 0
    ? Math.min(100, (baseTotals.subtotal / freeThreshold) * 100)
    : 0;
  const remainingForFree = Math.max(0, freeThreshold - baseTotals.subtotal);

  // Validation per step
  const validateStep1 = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Nom requis";
    const d = phoneDigits(phone);
    if (!d) e.phone = "Téléphone requis";
    else if (d.length < 10) e.phone = "Numéro invalide (10 chiffres requis)";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "Email invalide";
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const validateStep2 = (): boolean => {
    const e: Record<string, string> = {};
    if (orderType === "delivery") {
      if (!allowDelivery) e.orderType = "Livraison non disponible";
      if (!address.trim()) e.address = "Adresse requise";
    }
    if (orderType === "pickup" && !allowPickup) e.orderType = "Ramassage non disponible";
    if (time === "scheduled" && !scheduledTime) e.scheduledTime = "Heure requise";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const goNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep(((step + 1) as Step));
  };
  const goBack = () => setStep(((step - 1) as Step));

  const canSubmit =
    !loading && !closed && !paused && !belowMin && cart.length > 0 &&
    name.trim() && phoneDigits(phone).length >= 10 &&
    (orderType === "pickup" ? allowPickup : allowDelivery && address.trim());

  // Build the API payload from current form state (used for coupon quote and online intent).
  const buildPayload = (): CreateOrderPayload & { couponCode?: string } => ({
    customer: { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined },
    orderType,
    deliveryAddress: orderType === "delivery" ? address.trim() : "",
    deliveryUnit: orderType === "delivery" ? unit.trim() : undefined,
    deliveryDoorCode: orderType === "delivery" ? doorCode.trim() : undefined,
    deliveryInstructions: orderType === "delivery" ? deliveryInstructions.trim() : undefined,
    preferredTime: time === "scheduled" ? scheduledTime || "Programmé" : "ASAP",
    paymentMethod: payment,
    specialNotes: notes.trim(),
    items: cart.map((c) => ({
      itemId: c.itemId, name: c.name, unitPrice: c.unitPrice,
      quantity: c.quantity, options: c.options, combo: c.combo, notes: c.notes,
    })),
    subtotal: totals.subtotal, gst: totals.gst, qst: totals.qst, total: totals.total,
    couponCode: couponApplied ? couponApplied.code : undefined,
  });

  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) { setCouponApplied(null); setCouponDiscount(0); setCouponFreeDelivery(false); return; }
    if (!validateStep1() || !validateStep2()) { toast.error("Complétez d'abord vos coordonnées."); return; }
    setCouponLoading(true);
    try {
      const q = await api.paymentsQuote({ ...buildPayload(), couponCode: code });
      if (!q.coupon) throw new Error("Code invalide");
      setCouponApplied(q.coupon);
      setCouponDiscount(q.discount);
      setCouponFreeDelivery(q.coupon.free_delivery);
      toast.success(`Code ${q.coupon.code} appliqué`);
    } catch (err) {
      setCouponApplied(null); setCouponDiscount(0); setCouponFreeDelivery(false);
      toast.error(err instanceof Error ? err.message : "Code invalide");
    } finally { setCouponLoading(false); }
  };

  const removeCoupon = () => {
    setCouponInput(""); setCouponApplied(null); setCouponDiscount(0); setCouponFreeDelivery(false);
  };

  if (cart.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <ShoppingBag className="mx-auto mb-3 h-12 w-12 text-muted-foreground" />
        <h1 className="font-display text-2xl font-bold">Votre panier est vide</h1>
        <p className="mt-2 text-muted-foreground">Ajoutez des articles depuis le menu pour commencer.</p>
        <Link to="/menu" className="mt-4 inline-block"><Button>Voir le menu</Button></Link>
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep1() || !validateStep2()) {
      toast.error("Merci de corriger les champs en rouge.");
      return;
    }
    console.info("[checkout]", "order_submit_attempt");
    setLoading(true);
    try {
      const res = await api.createOrder({
        customer: { name: name.trim(), phone: phone.trim(), email: email.trim() || undefined },
        orderType,
        deliveryAddress: orderType === "delivery" ? address.trim() : "",
        deliveryUnit: orderType === "delivery" ? unit.trim() : undefined,
        deliveryDoorCode: orderType === "delivery" ? doorCode.trim() : undefined,
        deliveryInstructions: orderType === "delivery" ? deliveryInstructions.trim() : undefined,
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
      console.info("[checkout]", "order_submit_success", { orderNumber: res.orderNumber });
      cartStore.clear();
      toast.success("Commande envoyée !");
      navigate({ to: "/confirmation/$orderNumber", params: { orderNumber: res.orderNumber } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'envoi";
      console.info("[checkout]", "order_submit_error", { message });
      toast.error(message, {
        action: { label: "Réessayer", onClick: () => onSubmit(e) },
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 pb-32 md:pb-10">
      <div className="mb-2 flex items-center gap-2">
        <Link to="/cart" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Panier
        </Link>
      </div>
      <h1 className="mb-6 font-display text-3xl font-bold">Finaliser la commande</h1>

      {/* Status banners */}
      {closed && (
        <BannerCard tone="destructive" icon={<AlertTriangle className="h-5 w-5" />}
          title="Restaurant fermé"
          body={settings?.closed_message || "Le restaurant n'accepte pas de commandes actuellement."}
        />
      )}
      {!closed && paused && (
        <BannerCard tone="warning" icon={<Clock className="h-5 w-5" />}
          title="Commandes temporairement suspendues"
          body={settings?.order_pause_message || "Merci de réessayer dans quelques minutes."}
        />
      )}
      {settingsError && (
        <BannerCard tone="warning" icon={<AlertTriangle className="h-5 w-5" />}
          title="Connexion limitée"
          body="Impossible de charger les paramètres du restaurant. Vous pouvez continuer, les frais seront calculés côté serveur."
        />
      )}

      {/* Progress stepper */}
      <Stepper step={step} />

      <form onSubmit={onSubmit} className="mt-6 grid gap-8 md:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* STEP 1 — CONTACT */}
          {step === 1 && (
            <Section title="Vos coordonnées" icon={<Phone className="h-5 w-5 text-primary" />}>
              <Field label="Nom complet *" error={errors.name}>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" placeholder="Jean Tremblay" />
              </Field>
              <Field label="Téléphone *" error={errors.phone}>
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatCAPhone(e.target.value))}
                  placeholder="(514) 555-1234"
                />
              </Field>
              <Field label="Email (optionnel)" error={errors.email}>
                <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} placeholder="vous@exemple.com" />
              </Field>
              <p className="text-xs text-muted-foreground">Nous utilisons votre numéro uniquement pour confirmer la commande.</p>
            </Section>
          )}

          {/* STEP 2 — FULFILLMENT */}
          {step === 2 && (
            <Section title="Mode de récupération" icon={<Truck className="h-5 w-5 text-primary" />}>
              {errors.orderType && <p className="text-sm text-destructive">{errors.orderType}</p>}
              <RadioGroup value={orderType} onValueChange={(v) => setOrderType(v as "pickup" | "delivery")} className="grid grid-cols-2 gap-3">
                <RadioCard value="pickup" current={orderType} label="Ramassage" desc="Récupérer au restaurant" disabled={!allowPickup} />
                <RadioCard value="delivery" current={orderType} label="Livraison" desc="Livré à votre adresse" disabled={!allowDelivery} />
              </RadioGroup>

              {orderType === "pickup" && (
                <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm space-y-2">
                  <div className="flex items-center gap-2 font-medium">
                    <Clock className="h-4 w-4 text-primary" />
                    Prêt dans environ {settings?.est_pickup_min ?? 20} minutes
                  </div>
                  {settings?.restaurant_address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <span>{settings.restaurant_address}</span>
                    </div>
                  )}
                  {settings?.restaurant_phone && (
                    <a href={`tel:${settings.restaurant_phone}`} className="inline-flex items-center gap-2 text-primary hover:underline">
                      <Phone className="h-4 w-4" /> Appeler le restaurant
                    </a>
                  )}
                </div>
              )}

              {orderType === "delivery" && (
                <>
                  <Field label="Adresse de livraison *" error={errors.address}>
                    <Textarea
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      maxLength={400}
                      placeholder="123 Rue Exemple, Montréal, QC"
                      rows={2}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Appartement / Unité (optionnel)">
                      <Input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={80} placeholder="App. 12" />
                    </Field>
                    <Field label="Code de porte (optionnel)">
                      <Input value={doorCode} onChange={(e) => setDoorCode(e.target.value)} maxLength={40} placeholder="#1234" />
                    </Field>
                  </div>
                  <Field label="Instructions pour le livreur (optionnel)">
                    <Textarea value={deliveryInstructions} onChange={(e) => setDeliveryInstructions(e.target.value)} maxLength={500} placeholder="Sonner deux fois, laisser à la porte..." rows={2} />
                  </Field>
                  <div className="rounded-xl border border-border bg-secondary/40 p-3 text-sm space-y-1">
                    <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Livraison estimée : ~{settings?.est_delivery_min ?? 45} min</div>
                    {settings?.delivery_zone_text && (
                      <div className="flex items-start gap-2 text-muted-foreground"><MapPin className="mt-0.5 h-4 w-4" /> {settings.delivery_zone_text}</div>
                    )}
                    <p className="text-xs text-muted-foreground">Le restaurant peut vous appeler pour confirmer l'adresse.</p>
                  </div>
                </>
              )}

              <div className="border-t border-border pt-4">
                <Label className="mb-2 block text-sm font-medium">Heure préférée</Label>
                <RadioGroup value={time} onValueChange={setTime} className="grid grid-cols-2 gap-3">
                  <RadioCard value="ASAP" current={time} label="Dès que possible" desc="Préparé immédiatement" />
                  <RadioCard value="scheduled" current={time} label="Programmé" desc="Choisir une heure" />
                </RadioGroup>
                {time === "scheduled" && (
                  <div className="mt-3">
                    <Field label="Heure souhaitée" error={errors.scheduledTime}>
                      <Input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
                    </Field>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* STEP 3 — REVIEW & PAYMENT */}
          {step === 3 && (
            <>
              <Section title="Mode de paiement" icon={<ShieldCheck className="h-5 w-5 text-primary" />}>
                <RadioGroup value={payment} onValueChange={(v) => setPayment(v as typeof payment)} className="grid gap-3 sm:grid-cols-2">
                  {paymentsEnabled && (
                    <RadioCard value="online" current={payment} label="Payer en ligne" desc="Carte • Apple Pay • Google Pay" />
                  )}
                  <RadioCard value="pay_at_restaurant" current={payment} label="Au restaurant" desc="Sur place" />
                  <RadioCard value="cash" current={payment} label="Comptant" desc="À la livraison" />
                  <RadioCard value="card_on_arrival" current={payment} label="Carte à l'arrivée" desc="Sur place ou livraison" />
                </RadioGroup>
                {payment === "online" ? (
                  <p className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Paiement sécurisé traité par Stripe.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary" /> Votre commande est envoyée directement au restaurant.</li>
                    <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary" /> {orderType === "delivery" ? "Le restaurant confirme la livraison." : "Vous récupérez votre commande sur place."}</li>
                  </ul>
                )}
              </Section>

              {/* Coupon */}
              <Section title="Code promo" icon={<Tag className="h-5 w-5 text-primary" />}>
                {couponApplied ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
                    <div className="text-sm">
                      <strong>{couponApplied.code}</strong> appliqué
                      <div className="text-xs text-muted-foreground">
                        {couponApplied.kind === "free_delivery" ? "Livraison gratuite" :
                          couponApplied.kind === "percent" ? `-${couponApplied.value}%` :
                          `-${fmt(couponApplied.value)}`}
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={removeCoupon}>Retirer</Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      placeholder="CODE10"
                      maxLength={40}
                      className="uppercase"
                    />
                    <Button type="button" onClick={applyCoupon} disabled={couponLoading || !couponInput.trim()}>
                      {couponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Appliquer"}
                    </Button>
                  </div>
                )}
              </Section>

              <Section title="Instructions spéciales">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Allergies, préférences..." />
              </Section>

              <Section title="Vérification finale">
                <ReviewRow label="Nom" value={name} />
                <ReviewRow label="Téléphone" value={phone} />
                {email && <ReviewRow label="Email" value={email} />}
                <ReviewRow label="Mode" value={orderType === "pickup" ? "Ramassage" : "Livraison"} />
                {orderType === "delivery" && (
                  <>
                    <ReviewRow label="Adresse" value={[address, unit].filter(Boolean).join(" — ")} />
                    {doorCode && <ReviewRow label="Code" value={doorCode} />}
                  </>
                )}
                <ReviewRow label="Heure" value={time === "scheduled" ? (scheduledTime || "Programmé") : "Dès que possible"} />
              </Section>

              {payment === "online" && publishableKey && canSubmit && (
                <OnlinePaymentBox
                  publishableKey={publishableKey}
                  buildPayload={buildPayload}
                  total={totals.total}
                  onSuccess={(orderNumber) => {
                    cartStore.clear();
                    navigate({ to: "/confirmation/$orderNumber", params: { orderNumber } });
                  }}
                />
              )}
            </>
          )}

          {/* Cart items editor (always visible on desktop in summary; here on mobile-friendly inline) */}
          {step === 1 && (
            <Section title="Votre panier" icon={<ShoppingBag className="h-5 w-5 text-primary" />}>
              <CartEditor />
              <div className="pt-2">
                <Link to="/menu" className="text-sm text-primary hover:underline">+ Ajouter d'autres articles</Link>
              </div>
            </Section>
          )}

          {/* Step nav */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {step > 1 ? (
              <Button type="button" variant="outline" onClick={goBack}>
                <ArrowLeft className="h-4 w-4" /> Retour
              </Button>
            ) : <span />}
            {step < 3 ? (
              <Button type="button" onClick={goNext} disabled={closed || paused}>
                Continuer <ArrowRight className="h-4 w-4" />
              </Button>
            ) : payment !== "online" ? (
              <Button type="submit" size="lg" disabled={!canSubmit} className="hidden md:inline-flex">
                {loading ? "Envoi..." : "Confirmer la commande"}
              </Button>
            ) : <span />}
          </div>
        </div>

        {/* Order summary */}
        <aside className="md:sticky md:top-24 h-fit">
          <div className="hidden md:block rounded-2xl border border-border bg-card p-5 shadow-sm">
            <OrderSummary
              cart={cart}
              baseTotals={baseTotals}
              deliveryFee={deliveryFee}
              total={totals.total}
              orderType={orderType}
              estimatedMin={estimatedMin}
              minOrder={minOrder}
              belowMin={belowMin}
              freeThreshold={freeThreshold}
              freeProgress={freeProgress}
              remainingForFree={remainingForFree}
            />
          </div>

          {/* Mobile collapsible summary */}
          <div className="md:hidden rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setSummaryOpen((s) => !s)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="font-medium">Récapitulatif ({cart.length})</span>
              <span className="flex items-center gap-2 text-sm">
                <strong>{fmt(totals.total)}</strong>
                {summaryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </button>
            {summaryOpen && (
              <div className="border-t border-border p-4">
                <OrderSummary
                  cart={cart}
                  baseTotals={baseTotals}
                  deliveryFee={deliveryFee}
                  total={totals.total}
                  orderType={orderType}
                  estimatedMin={estimatedMin}
                  minOrder={minOrder}
                  belowMin={belowMin}
                  freeThreshold={freeThreshold}
                  freeProgress={freeProgress}
                  remainingForFree={remainingForFree}
                />
              </div>
            )}
          </div>
        </aside>
      </form>

      {/* Mobile sticky bottom bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur px-4 py-3 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="font-bold text-primary">{fmt(totals.total)}</div>
          </div>
          {step < 3 ? (
            <Button type="button" onClick={goNext} disabled={closed || paused} className="flex-1">
              Continuer <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={(e) => onSubmit(e as unknown as React.FormEvent)} disabled={!canSubmit} className="flex-1">
              {loading ? "Envoi..." : "Confirmer"}
            </Button>
          )}
        </div>
        {belowMin && (
          <p className="mt-2 text-xs text-destructive">
            Minimum {fmt(minOrder)}. Ajoutez {fmt(minOrder - baseTotals.subtotal)}.
          </p>
        )}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const items = [
    { n: 1, label: "Contact" },
    { n: 2, label: "Mode" },
    { n: 3, label: "Confirmation" },
  ] as const;
  return (
    <div className="sticky top-16 z-30 -mx-4 mb-2 bg-background/95 px-4 py-3 backdrop-blur md:static md:mx-0 md:bg-transparent md:p-0">
      <ol className="flex items-center gap-2">
        {items.map((it, idx) => {
          const done = step > it.n;
          const active = step === it.n;
          return (
            <li key={it.n} className="flex flex-1 items-center gap-2">
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                done ? "bg-primary text-primary-foreground" :
                active ? "bg-primary/15 text-primary ring-2 ring-primary" :
                "bg-secondary text-muted-foreground"
              }`}>
                {done ? <Check className="h-4 w-4" /> : it.n}
              </div>
              <span className={`text-xs sm:text-sm font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>
                {it.label}
              </span>
              {idx < items.length - 1 && <div className={`h-px flex-1 ${done ? "bg-primary" : "bg-border"}`} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CartEditor() {
  const cart = useCart();
  if (cart.length === 0) return <p className="text-sm text-muted-foreground">Panier vide.</p>;
  return (
    <ul className="divide-y divide-border">
      {cart.map((c) => (
        <li key={c.uid} className="flex items-start gap-3 py-3">
          <div className="flex-1 min-w-0">
            <div className="font-medium">{c.name}</div>
            {c.options && c.options.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {c.options.map((o) => `${o.groupLabel}: ${o.values.join(", ")}`).join(" • ")}
              </div>
            )}
            {c.notes && <div className="text-xs italic text-muted-foreground">Note: {c.notes}</div>}
            <div className="mt-1 text-sm font-semibold text-primary">{fmt(c.unitPrice * c.quantity)}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button type="button" size="icon" variant="outline" className="h-7 w-7"
              onClick={() => cartStore.updateQty(c.uid, c.quantity - 1)} aria-label="Diminuer">
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="w-6 text-center text-sm font-medium">{c.quantity}</span>
            <Button type="button" size="icon" variant="outline" className="h-7 w-7"
              onClick={() => cartStore.updateQty(c.uid, c.quantity + 1)} aria-label="Augmenter">
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive"
              onClick={() => cartStore.remove(c.uid)} aria-label="Retirer">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function OrderSummary({
  cart, baseTotals, deliveryFee, total, orderType, estimatedMin,
  minOrder, belowMin, freeThreshold, freeProgress, remainingForFree,
}: {
  cart: ReturnType<typeof useCart>;
  baseTotals: ReturnType<typeof computeTotals>;
  deliveryFee: number;
  total: number;
  orderType: "pickup" | "delivery";
  estimatedMin: number;
  minOrder: number;
  belowMin: boolean;
  freeThreshold: number;
  freeProgress: number;
  remainingForFree: number;
}) {
  return (
    <>
      <h2 className="font-display text-lg font-semibold">Votre commande</h2>
      <ul className="mt-3 space-y-2 text-sm max-h-56 overflow-auto pr-1">
        {cart.map((c) => (
          <li key={c.uid} className="flex justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate">{c.quantity}× {c.name}</div>
              {c.options && c.options.length > 0 && (
                <div className="truncate text-[11px] text-muted-foreground">
                  {c.options.map((o) => o.values.join(", ")).join(" • ")}
                </div>
              )}
              {c.notes && <div className="truncate text-[11px] italic text-muted-foreground">{c.notes}</div>}
            </div>
            <span className="shrink-0 font-medium">{fmt(c.unitPrice * c.quantity)}</span>
          </li>
        ))}
      </ul>
      {estimatedMin > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-xs">
          <Clock className="h-3.5 w-3.5 text-primary" />
          ~{estimatedMin} min ({orderType === "delivery" ? "livraison" : "ramassage"})
        </div>
      )}
      <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
        <div className="flex justify-between"><dt className="text-muted-foreground">Sous-total</dt><dd>{fmt(baseTotals.subtotal)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">TPS</dt><dd>{fmt(baseTotals.gst)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted-foreground">TVQ</dt><dd>{fmt(baseTotals.qst)}</dd></div>
        {orderType === "delivery" && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Livraison</dt>
            <dd>{deliveryFee === 0 ? <span className="text-primary">Gratuit</span> : fmt(deliveryFee)}</dd>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-bold">
          <dt>Total</dt><dd className="text-primary">{fmt(total)}</dd>
        </div>
      </dl>
      {orderType === "delivery" && freeThreshold > 0 && (
        <div className="mt-3">
          {remainingForFree > 0 ? (
            <>
              <p className="text-xs text-muted-foreground mb-1">
                Ajoutez <strong>{fmt(remainingForFree)}</strong> pour la livraison gratuite.
              </p>
              <Progress value={freeProgress} className="h-1.5" />
            </>
          ) : (
            <p className="text-xs text-primary font-medium">🚚 Livraison gratuite débloquée !</p>
          )}
        </div>
      )}
      {belowMin && (
        <p className="mt-3 text-xs text-destructive">
          Minimum de commande : {fmt(minOrder)}. Ajoutez {fmt(minOrder - baseTotals.subtotal)} pour continuer.
        </p>
      )}
    </>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
        {icon} {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-sm">{label}</Label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function RadioCard({ value, current, label, desc, disabled }: { value: string; current: string; label: string; desc: string; disabled?: boolean }) {
  const selected = value === current;
  return (
    <Label
      className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition ${
        disabled ? "opacity-50 cursor-not-allowed" :
        selected ? "border-primary bg-primary/5" :
        "border-border bg-background hover:border-primary/40"
      }`}
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem value={value} disabled={disabled} />
        <span className="font-medium">{label}</span>
      </div>
      <span className="pl-6 text-xs text-muted-foreground">{desc}</span>
    </Label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function BannerCard({ tone, icon, title, body }: { tone: "destructive" | "warning"; icon: React.ReactNode; title: string; body: string }) {
  const cls = tone === "destructive"
    ? "border-destructive bg-destructive/10 text-destructive"
    : "border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  return (
    <div className={`mb-6 rounded-2xl border p-4 ${cls}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div>
          <strong className="block">{title}</strong>
          <p className="mt-0.5 text-sm">{body}</p>
        </div>
      </div>
    </div>
  );
}

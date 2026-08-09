import { useMemo, useRef, useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, type CreateOrderPayload } from "@/lib/api";
import { fmt } from "@/lib/cart-store";

/**
 * Card payment surface, kept in its own chunk so Stripe's SDK is downloaded
 * only when the customer actually reaches step 3 with "pay online" selected.
 */
const stripePromiseCache = new Map<string, Promise<StripeJs | null>>();
function getStripePromise(key: string) {
  let p = stripePromiseCache.get(key);
  if (!p) {
    p = loadStripe(key);
    stripePromiseCache.set(key, p);
  }
  return p;
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

export default function StripePaymentBox({
  publishableKey,
  buildPayload,
  total,
  onSuccess,
}: {
  publishableKey: string;
  buildPayload: () => CreateOrderPayload & { couponCode?: string };
  total: number;
  onSuccess: (orderNumber: string) => void;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stripePromise = useMemo(() => getStripePromise(publishableKey), [publishableKey]);

  const prepare = async () => {
    setPreparing(true);
    setError(null);
    try {
      const r = await api.createPaymentIntent(buildPayload());
      setClientSecret(r.clientSecret);
      setOrderNumber(r.orderNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur paiement");
    } finally {
      setPreparing(false);
    }
  };

  return (
    <Section title="Paiement par carte" icon={<CreditCard className="h-5 w-5 text-primary" />}>
      {!clientSecret ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Cliquez sur « Préparer le paiement » pour réserver votre commande et afficher le formulaire sécurisé.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="button" size="lg" disabled={preparing} onClick={prepare} className="min-h-12 w-full">
            {preparing ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Préparation…</>
            ) : (
              <>Préparer le paiement — {fmt(total)}</>
            )}
          </Button>
        </div>
      ) : (
        <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
          <StripeCheckoutForm orderNumber={orderNumber!} total={total} onSuccess={onSuccess} />
        </Elements>
      )}
    </Section>
  );
}

function StripeCheckoutForm({
  orderNumber,
  total,
  onSuccess,
}: {
  orderNumber: string;
  total: number;
  onSuccess: (orderNumber: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const submittedRef = useRef(false);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setMsg(null);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/confirmation/${orderNumber}` },
      redirect: "if_required",
    });
    if (error) {
      setMsg(error.message || "Paiement refusé");
      submittedRef.current = false;
      setSubmitting(false);
      return;
    }
    if (paymentIntent && (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")) {
      toast.success("Paiement confirmé");
      onSuccess(orderNumber);
      return;
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {msg && <p className="text-sm text-destructive">{msg}</p>}
      <Button type="submit" size="lg" disabled={!stripe || submitting} className="min-h-12 w-full">
        {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Traitement…</> : <>Payer {fmt(total)}</>}
      </Button>
    </form>
  );
}

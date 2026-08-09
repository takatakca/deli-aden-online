import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2, ShoppingBag, X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useCart, cartStore, fmt, GST_RATE, QST_RATE } from "@/lib/cart-store";
import { useCartSheetOpen, cartSheet } from "@/lib/ui-store";
import { useT } from "@/lib/i18n";
import { api, type PublicSettings } from "@/lib/api";
import { DishImage } from "@/components/DishImage";

/**
 * Mobile-first cart bottom sheet (vaul drawer: draggable, Escape-close,
 * body-scroll lock and focus trap handled by the primitive).
 * The full /cart route stays available and untouched.
 */
export function CartSheet() {
  const open = useCartSheetOpen();
  const cart = useCart();
  const { t, tf } = useT();
  const [settings, setSettings] = useState<PublicSettings | null>(null);

  useEffect(() => {
    if (!open || settings) return;
    api.getSettings().then((r) => setSettings(r.settings)).catch(() => {});
  }, [open, settings]);

  const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const gst = +(subtotal * (settings?.gst_rate ?? GST_RATE)).toFixed(2);
  const qst = +(subtotal * (settings?.qst_rate ?? QST_RATE)).toFixed(2);
  const threshold = settings?.free_delivery_threshold ?? 0;
  const fee =
    settings && settings.delivery_fee > 0 && (threshold <= 0 || subtotal < threshold)
      ? settings.delivery_fee
      : 0;
  const total = +(subtotal + gst + qst).toFixed(2);
  const remaining = Math.max(0, threshold - subtotal);
  const progress = threshold > 0 ? Math.min(100, (subtotal / threshold) * 100) : 0;
  const count = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <Drawer open={open} onOpenChange={(v) => (v ? cartSheet.open() : cartSheet.close())}>
      <DrawerContent className="max-h-[92dvh] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <DrawerTitle className="truncate font-display text-lg">{t("cart.title")}</DrawerTitle>
            <DrawerDescription className="text-xs">
              {count} {t("cart.items")}
            </DrawerDescription>
          </div>
          <button
            type="button"
            onClick={() => cartSheet.close()}
            aria-label={t("common.close")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {cart.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-3 font-display text-lg">{t("cart.empty")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("cart.emptyHint")}</p>
            <Link to="/menu" onClick={() => cartSheet.close()} className="mt-5 inline-block">
              <Button size="lg" className="min-h-11">{t("nav.menu")}</Button>
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-border overflow-y-auto overscroll-contain px-4">
              {cart.map((line) => (
                <li key={line.uid} className="flex gap-3 py-3">
                  <div className="w-20 shrink-0 overflow-hidden rounded-lg">
                    <DishImage src={line.image} name={line.name} ratio="aspect-square" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 font-medium leading-tight">{line.name}</p>
                      <span className="shrink-0 font-display font-bold text-primary">
                        {fmt(line.unitPrice * line.quantity)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{fmt(line.unitPrice)} / u.</p>
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
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        {t("cart.note")}: {line.notes}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 rounded-full border border-border">
                        <button
                          type="button"
                          aria-label={`${t("common.quantity")} -1 ${line.name}`}
                          onClick={() => cartStore.updateQty(line.uid, line.quantity - 1)}
                          className="grid h-11 w-11 place-items-center rounded-full"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-7 text-center text-sm font-semibold">{line.quantity}</span>
                        <button
                          type="button"
                          aria-label={`${t("common.quantity")} +1 ${line.name}`}
                          onClick={() => cartStore.updateQty(line.uid, line.quantity + 1)}
                          className="grid h-11 w-11 place-items-center rounded-full"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => cartStore.remove(line.uid)}
                        className="inline-flex min-h-11 items-center gap-1 px-2 text-xs text-destructive"
                      >
                        <Trash2 className="h-4 w-4" /> {t("cart.remove")}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="border-t border-border px-4 pt-3">
              {threshold > 0 && (
                <div className="mb-3">
                  <p className="mb-1 text-xs text-muted-foreground">
                    {remaining > 0
                      ? tf("cart.freeDeliveryLeft", { amount: fmt(remaining) })
                      : t("cart.freeDelivery")}
                  </p>
                  <Progress value={progress} className="h-1.5" />
                </div>
              )}
              <dl className="space-y-1 text-sm">
                <Row label={t("cart.subtotal")} value={fmt(subtotal)} />
                <Row label={t("cart.gst")} value={fmt(gst)} />
                <Row label={t("cart.qst")} value={fmt(qst)} />
                {fee > 0 && <Row label={t("cart.deliveryFee")} value={fmt(fee)} />}
                <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                  <dt>{t("cart.total")}</dt>
                  <dd className="text-primary">{fmt(total)}</dd>
                </div>
              </dl>
              <p className="mt-1 text-[11px] text-muted-foreground">{t("cart.couponAtCheckout")}</p>
            </div>

            <div className="sticky bottom-0 space-y-2 border-t border-border bg-background/95 p-4 backdrop-blur">
              <Link to="/checkout" onClick={() => cartSheet.close()} className="block">
                <Button size="lg" className="min-h-12 w-full text-base">
                  {t("cart.checkout")} • {fmt(total)}
                </Button>
              </Link>
              <div className="flex gap-2">
                <Link to="/menu" onClick={() => cartSheet.close()} className="flex-1">
                  <Button variant="outline" className="min-h-11 w-full">{t("cart.continue")}</Button>
                </Link>
                <Link to="/cart" onClick={() => cartSheet.close()} className="flex-1">
                  <Button variant="ghost" className="min-h-11 w-full">{t("cart.viewFull")}</Button>
                </Link>
              </div>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Persistent mobile cart CTA — opens the sheet, hidden on cart/checkout routes. */
export function CartStickyCta({ hidden = false }: { hidden?: boolean }) {
  const cart = useCart();
  const { t } = useT();
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const total = +(subtotal * (1 + GST_RATE + QST_RATE)).toFixed(2);
  if (hidden || count === 0) return null;
  return (
    <button
      type="button"
      onClick={() => cartSheet.open()}
      className="fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 mx-auto flex min-h-12 max-w-md items-center justify-between gap-3 rounded-full bg-primary px-5 text-primary-foreground shadow-2xl md:bottom-5"
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <ShoppingBag className="h-4 w-4" /> {count} {t("cart.items")}
      </span>
      <span className="text-sm font-bold">
        {t("cart.checkout")} • {fmt(total)}
      </span>
    </button>
  );
}

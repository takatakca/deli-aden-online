import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import type { MenuItem } from "@/lib/menu";
import { COMBO_DELTA } from "@/lib/menu";
import { cartStore, fmt } from "@/lib/cart-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { DishImage } from "@/components/DishImage";
import { useIsMobile } from "@/hooks/use-mobile";
import { useT } from "@/lib/i18n";
import { cartSheet } from "@/lib/ui-store";

export type MenuItemOverride = {
  available?: boolean;
  priceOverride?: number | null;
  descriptionOverride?: string | null;
  imageOverride?: string | null;
};

export function MenuItemCard({
  item,
  override,
  eagerImage = false,
}: {
  item: MenuItem;
  override?: MenuItemOverride;
  eagerImage?: boolean;
}) {
  const { t } = useT();
  const available = override?.available !== false;
  const price = override?.priceOverride ?? item.price;
  const description = override?.descriptionOverride ?? item.description;
  const image = override?.imageOverride ?? item.image;
  const effective: MenuItem = { ...item, price, description, image };
  const hasOptions = (item.options && item.options.length > 0) || item.combo;
  return (
    <article className={`group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${!available ? "opacity-60" : ""}`}>
      <DishImage
        src={image}
        name={item.name}
        eager={eagerImage}
        className="transition duration-500 group-hover:scale-105"
      />
      {!available && (
        <span className="absolute right-3 top-3 rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground shadow">
          {t("common.unavailable")}
        </span>
      )}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 font-display text-lg font-semibold leading-tight text-foreground">{item.name}</h3>
          <span className="shrink-0 font-display text-base font-bold text-primary">{fmt(price)}</span>
        </div>
        {description && (
          <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
        <div className="mt-auto pt-2">
          {!available ? (
            <Button className="min-h-11 w-full" disabled>{t("common.unavailable")}</Button>
          ) : hasOptions ? (
            <Customizer item={effective} />
          ) : (
            <Button
              className="min-h-11 w-full"
              onClick={() => {
                cartStore.add({
                  itemId: item.id,
                  name: item.name,
                  unitPrice: price,
                  quantity: 1,
                  image,
                });
                toast.success(`${item.name} — ${t("common.add")}`);
                cartSheet.open();
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> {t("common.add")}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

/** Bottom sheet on mobile (draggable, thumb-reachable CTA), dialog on desktop. */
function Customizer({ item }: { item: MenuItem }) {
  const isMobile = useIsMobile();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [combo, setCombo] = useState(false);
  const [notes, setNotes] = useState("");
  const [selections, setSelections] = useState<Record<string, string[]>>({});

  const setSingle = (groupId: string, val: string) =>
    setSelections((s) => ({ ...s, [groupId]: [val] }));
  const toggleMulti = (groupId: string, val: string) =>
    setSelections((s) => {
      const cur = s[groupId] ?? [];
      return { ...s, [groupId]: cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val] };
    });

  let unitPrice = item.price;
  if (combo) unitPrice += COMBO_DELTA;
  for (const g of item.options ?? []) {
    for (const v of selections[g.id] ?? []) {
      const choice = g.choices.find((c) => c.label === v);
      if (choice?.priceDelta) unitPrice += choice.priceDelta;
    }
  }

  const missing = (item.options ?? []).filter(
    (g) => g.required && !(selections[g.id]?.length ?? 0),
  );

  const onAdd = () => {
    if (missing.length > 0) {
      toast.error(`${t("common.customize")}: ${missing.map((g) => g.label).join(", ")}`);
      return;
    }
    const opts = (item.options ?? [])
      .map((g) => ({ groupLabel: g.label, values: selections[g.id] ?? [] }))
      .filter((o) => o.values.length > 0);
    if (combo) opts.push({ groupLabel: "Formule", values: [`Trio (+${fmt(COMBO_DELTA)})`] });
    cartStore.add({
      itemId: item.id,
      name: item.name,
      unitPrice,
      quantity: qty,
      image: item.image,
      options: opts,
      combo,
      notes: notes.trim() || undefined,
    });
    toast.success(`${item.name} — ${t("common.add")}`);
    setOpen(false);
    setQty(1);
    setCombo(false);
    setNotes("");
    setSelections({});
    cartSheet.open();
  };

  const body = (
    <div className="space-y-5">
      {item.combo && (
        <div className="rounded-lg border border-border bg-secondary/50 p-3">
          <Label className="font-semibold">Formule</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCombo(false)}
              aria-pressed={!combo}
              className={`min-h-11 rounded-md border px-3 text-sm transition ${!combo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
            >
              Classique
            </button>
            <button
              type="button"
              onClick={() => setCombo(true)}
              aria-pressed={combo}
              className={`min-h-11 rounded-md border px-3 text-sm transition ${combo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
            >
              Trio (+{fmt(COMBO_DELTA)})
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Trio = Sandwich + Soda + Frites</p>
        </div>
      )}
      {(item.options ?? []).map((g) => (
        <div key={g.id}>
          <Label className="font-semibold">
            {g.label} {g.required && <span className="text-primary">*</span>}
          </Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {g.choices.map((c) => {
              const selected = (selections[g.id] ?? []).includes(c.label);
              return (
                <button
                  type="button"
                  key={c.label}
                  aria-pressed={selected}
                  onClick={() =>
                    g.type === "single" ? setSingle(g.id, c.label) : toggleMulti(g.id, c.label)
                  }
                  className={`min-h-11 rounded-full border px-4 text-sm transition ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50"}`}
                >
                  {c.label}
                  {c.priceDelta ? ` (+${fmt(c.priceDelta)})` : ""}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div>
        <Label className="font-semibold" htmlFor={`notes-${item.id}`}>Instructions spéciales</Label>
        <Textarea
          id={`notes-${item.id}`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Allergies, préférences de cuisson..."
          maxLength={500}
          className="mt-2"
        />
      </div>
      <div className="flex items-center justify-between">
        <Label className="font-semibold">{t("common.quantity")}</Label>
        <div className="flex items-center gap-2">
          <Button aria-label={`${t("common.quantity")} -1`} variant="outline" size="icon" className="min-h-11 min-w-11" onClick={() => setQty((q) => Math.max(1, q - 1))}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-8 text-center font-semibold">{qty}</span>
          <Button aria-label={`${t("common.quantity")} +1`} variant="outline" size="icon" className="min-h-11 min-w-11" onClick={() => setQty((q) => Math.min(20, q + 1))}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  const cta = (
    <Button onClick={onAdd} className="min-h-12 w-full text-base" size="lg">
      {t("common.add")} — {fmt(unitPrice * qty)}
    </Button>
  );

  const trigger = (
    <Button className="min-h-11 w-full">
      <Plus className="mr-1 h-4 w-4" /> {t("common.customize")}
    </Button>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="max-h-[92dvh] pb-[env(safe-area-inset-bottom)]">
          <div className="border-b border-border px-4 py-3">
            <DrawerTitle className="font-display text-lg">{item.name}</DrawerTitle>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">{body}</div>
          <div className="sticky bottom-0 border-t border-border bg-background/95 p-4 backdrop-blur">{cta}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{item.name}</DialogTitle>
        </DialogHeader>
        {body}
        <div className="pt-2">{cta}</div>
      </DialogContent>
    </Dialog>
  );
}

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
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function MenuItemCard({ item }: { item: MenuItem }) {
  const hasOptions = (item.options && item.options.length > 0) || item.combo;
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={item.image}
          alt={item.name}
          loading="lazy"
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-semibold leading-tight text-foreground">{item.name}</h3>
          <span className="shrink-0 font-display text-base font-bold text-primary">{fmt(item.price)}</span>
        </div>
        {item.description && (
          <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
        )}
        <div className="mt-auto pt-2">
          {hasOptions ? (
            <CustomizeDialog item={item} />
          ) : (
            <Button
              className="w-full"
              onClick={() => {
                cartStore.add({
                  itemId: item.id,
                  name: item.name,
                  unitPrice: item.price,
                  quantity: 1,
                  image: item.image,
                });
                toast.success(`${item.name} ajouté au panier`);
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Ajouter au panier
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function CustomizeDialog({ item }: { item: MenuItem }) {
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
    const vals = selections[g.id] ?? [];
    for (const v of vals) {
      const choice = g.choices.find((c) => c.label === v);
      if (choice?.priceDelta) unitPrice += choice.priceDelta;
    }
  }

  const validate = () => {
    for (const g of item.options ?? []) {
      if (g.required && !(selections[g.id]?.length ?? 0)) {
        toast.error(`Veuillez sélectionner: ${g.label}`);
        return false;
      }
    }
    return true;
  };

  const onAdd = () => {
    if (!validate()) return;
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
    toast.success(`${item.name} ajouté au panier`);
    setOpen(false);
    setQty(1);
    setCombo(false);
    setNotes("");
    setSelections({});
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full"><Plus className="mr-1 h-4 w-4" /> Personnaliser</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{item.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          {item.combo && (
            <div className="rounded-lg border border-border bg-secondary/50 p-3">
              <Label className="font-semibold">Formule</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCombo(false)}
                  className={`rounded-md border px-3 py-2 text-sm transition ${!combo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
                >
                  Classique
                </button>
                <button
                  type="button"
                  onClick={() => setCombo(true)}
                  className={`rounded-md border px-3 py-2 text-sm transition ${combo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"}`}
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
                      onClick={() =>
                        g.type === "single" ? setSingle(g.id, c.label) : toggleMulti(g.id, c.label)
                      }
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary/50"}`}
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
            <Label className="font-semibold">Instructions spéciales</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Allergies, préférences de cuisson..."
              maxLength={500}
              className="mt-2"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="font-semibold">Quantité</Label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus className="h-4 w-4" /></Button>
              <span className="w-8 text-center font-semibold">{qty}</span>
              <Button variant="outline" size="icon" onClick={() => setQty((q) => Math.min(20, q + 1))}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onAdd} className="w-full" size="lg">
            Ajouter au panier — {fmt(unitPrice * qty)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

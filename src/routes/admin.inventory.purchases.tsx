import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, type Ingredient, type PurchaseOrder, type PurchaseOrderItem, type Supplier } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, money, num, useAdminPassword, UNIT_LABELS } from "@/lib/inventory-ui";

export const Route = createFileRoute("/admin/inventory/purchases")({ component: PurchasesPage });

type Line = { ingredient_id: number | ""; quantity: number; unit_cost: number };

const PO_STATUS: Record<string, string> = {
  draft: "Brouillon", ordered: "Commandé", partial: "Partiel", received: "Reçu", cancelled: "Annulé",
};

function PurchasesPage() {
  const password = useAdminPassword();
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [tax, setTax] = useState(0);
  const [lines, setLines] = useState<Line[]>([{ ingredient_id: "", quantity: 0, unit_cost: 0 }]);
  const [open, setOpen] = useState<{ purchase: PurchaseOrder; items: PurchaseOrderItem[] } | null>(null);
  const [received, setReceived] = useState<Record<number, number>>({});

  const load = useCallback(() => {
    if (!password) return;
    api.invPurchases(password).then((r) => setPurchases(r.purchases)).catch((e) => toast.error(e.message));
  }, [password]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!password) return;
    api.invIngredients(password, { active: true }).then((r) => setIngredients(r.ingredients)).catch(() => {});
    api.invSuppliers(password).then((r) => setSuppliers(r.suppliers)).catch(() => {});
  }, [password]);

  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0);

  const create = async () => {
    const items = lines.filter((l) => l.ingredient_id && l.quantity > 0)
      .map((l) => ({ ingredient_id: Number(l.ingredient_id), quantity: Number(l.quantity), unit_cost: Number(l.unit_cost) }));
    if (!items.length) return toast.error("Ajoutez au moins une ligne");
    try {
      await api.invCreatePurchase(password, { supplier_id: supplierId ? Number(supplierId) : null, tax, items });
      setLines([{ ingredient_id: "", quantity: 0, unit_cost: 0 }]); setTax(0);
      toast.success("Bon de commande créé"); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  const openPo = async (id: number) => {
    try {
      const r = await api.invPurchase(password, id);
      setOpen(r);
      setReceived(Object.fromEntries(r.items.map((i) => [i.id, Number(i.quantity)])));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  return (
    <div className="space-y-5">
      <Panel title="Nouveau bon de commande">
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Fournisseur…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div className="text-sm">Taxes : <Input type="number" step="0.01" className="ml-1 inline-flex h-9 w-24" value={tax} onChange={(e) => setTax(Number(e.target.value))} /></div>
          <div className="text-sm">Sous-total : <strong>{money(subtotal)}</strong> — Total : <strong>{money(subtotal + tax)}</strong></div>
        </div>
        <div className="space-y-2">
          {lines.map((l, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2">
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={l.ingredient_id}
                onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, ingredient_id: e.target.value ? Number(e.target.value) : "" } : x))}>
                <option value="">Ingrédient…</option>
                {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({UNIT_LABELS[i.unit] ?? i.unit})</option>)}
              </select>
              <Input type="number" step="0.001" placeholder="Qté" className="h-10 w-28" value={l.quantity}
                onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) } : x))} />
              <Input type="number" step="0.0001" placeholder="Coût unit." className="h-10 w-32" value={l.unit_cost}
                onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, unit_cost: Number(e.target.value) } : x))} />
              <Button size="sm" variant="ghost" onClick={() => setLines(lines.filter((_, i) => i !== idx))}>Retirer</Button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" onClick={() => setLines([...lines, { ingredient_id: "", quantity: 0, unit_cost: 0 }])}>+ Ligne</Button>
          <Button onClick={create}>Créer le bon</Button>
        </div>
      </Panel>

      <Panel title={`Bons de commande (${purchases.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">#</th><th>Date</th><th>Fournisseur</th><th>Total</th><th>Statut</th><th /></tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="py-2">#{p.id}</td>
                  <td>{p.created_at}</td>
                  <td>{p.supplier_name || "—"}</td>
                  <td>{money(p.total)}</td>
                  <td>{PO_STATUS[p.status] ?? p.status}</td>
                  <td className="text-right"><Button size="sm" variant="ghost" onClick={() => openPo(p.id)}>Réceptionner</Button></td>
                </tr>
              ))}
              {purchases.length === 0 && <tr><td colSpan={6} className="py-4 text-muted-foreground">Aucun bon de commande.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {open && (
        <Panel title={`Réception BC #${open.purchase.id}`} action={<Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Fermer</Button>}>
          <div className="space-y-2">
            {open.items.map((it) => (
              <div key={it.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="min-w-40 font-medium">{it.ingredient_name}</span>
                <span className="text-muted-foreground">commandé {num(it.quantity)} {UNIT_LABELS[it.unit ?? ""] ?? it.unit}</span>
                <span className="text-muted-foreground">déjà reçu {num(it.received_quantity)}</span>
                <Input type="number" step="0.001" className="h-9 w-28"
                  value={received[it.id] ?? 0}
                  onChange={(e) => setReceived({ ...received, [it.id]: Number(e.target.value) })} />
              </div>
            ))}
          </div>
          <Button className="mt-4" onClick={async () => {
            try {
              const r = await api.invReceivePurchase(password, open.purchase.id,
                open.items.map((it) => ({ item_id: it.id, received_quantity: received[it.id] ?? 0 })));
              toast.success(`Réception enregistrée (${PO_STATUS[r.status] ?? r.status})`);
              setOpen(null); load();
            } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
          }}>Confirmer la réception</Button>
        </Panel>
      )}
    </div>
  );
}

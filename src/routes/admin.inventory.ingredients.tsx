import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, type Ingredient, type InventoryTransaction, type Supplier } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Panel, money, num, stockStatus, useAdminPassword, UNITS, UNIT_LABELS, TX_LABELS,
} from "@/lib/inventory-ui";

export const Route = createFileRoute("/admin/inventory/ingredients")({ component: IngredientsPage });

const EMPTY = {
  name: "", sku: "", unit: "g", current_stock: 0, minimum_stock: 0,
  reorder_quantity: 0, average_unit_cost: 0, supplier_id: null as number | null,
};

function IngredientsPage() {
  const password = useAdminPassword();
  const [items, setItems] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [txFor, setTxFor] = useState<Ingredient | null>(null);
  const [txs, setTxs] = useState<InventoryTransaction[]>([]);

  const load = useCallback(() => {
    if (!password) return;
    api.invIngredients(password, { search, low: lowOnly })
      .then((r) => setItems(r.ingredients)).catch((e) => toast.error(e.message));
  }, [password, search, lowOnly]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (password) api.invSuppliers(password).then((r) => setSuppliers(r.suppliers)).catch(() => {});
  }, [password]);

  const openTx = async (ing: Ingredient) => {
    setTxFor(ing);
    try { setTxs((await api.invTransactions(password, ing.id)).transactions); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Nom requis");
    try {
      if (editing) await api.invUpdateIngredient(password, editing.id, form);
      else await api.invCreateIngredient(password, form);
      toast.success(editing ? "Ingrédient mis à jour" : "Ingrédient créé");
      setForm({ ...EMPTY }); setEditing(null); load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  const adjust = async (ing: Ingredient) => {
    const raw = window.prompt(`Ajustement pour ${ing.name} (${UNIT_LABELS[ing.unit] ?? ing.unit}) — positif pour ajouter, négatif pour retirer :`, "0");
    if (raw == null) return;
    const qty = Number(raw.replace(",", "."));
    if (!qty) return;
    try {
      await api.invAdjust(password, ing.id, {
        quantity: Math.abs(qty),
        transaction_type: qty > 0 ? "manual_add" : "manual_remove",
        note: "Ajustement manuel",
      });
      toast.success("Stock ajusté");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  return (
    <div className="space-y-5">
      <Panel title={editing ? `Modifier « ${editing.name} »` : "Nouvel ingrédient"}
        action={editing ? <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setForm({ ...EMPTY }); }}>Annuler</Button> : null}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Nom">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="SKU">
            <Input value={form.sku ?? ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </Field>
          <Field label="Unité">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              {UNITS.map((u) => <option key={u} value={u}>{UNIT_LABELS[u] ?? u}</option>)}
            </select>
          </Field>
          <Field label="Fournisseur">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.supplier_id ?? ""}
              onChange={(e) => setForm({ ...form, supplier_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">—</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          {!editing && (
            <Field label="Stock actuel">
              <Input type="number" step="0.001" value={form.current_stock}
                onChange={(e) => setForm({ ...form, current_stock: Number(e.target.value) })} />
            </Field>
          )}
          <Field label="Stock minimum">
            <Input type="number" step="0.001" value={form.minimum_stock}
              onChange={(e) => setForm({ ...form, minimum_stock: Number(e.target.value) })} />
          </Field>
          <Field label="Quantité de réappro">
            <Input type="number" step="0.001" value={form.reorder_quantity}
              onChange={(e) => setForm({ ...form, reorder_quantity: Number(e.target.value) })} />
          </Field>
          <Field label="Coût unitaire moyen ($)">
            <Input type="number" step="0.0001" value={form.average_unit_cost}
              onChange={(e) => setForm({ ...form, average_unit_cost: Number(e.target.value) })} />
          </Field>
        </div>
        <Button className="mt-4" onClick={submit}>{editing ? "Enregistrer" : "Ajouter"}</Button>
      </Panel>

      <Panel title={`Ingrédients (${items.length})`}
        action={
          <div className="flex items-center gap-2">
            <Input placeholder="Recherche…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-40" />
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} /> Stock bas
            </label>
          </div>
        }>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Nom</th><th>Stock</th><th>Min</th><th>Coût moyen</th><th>Fournisseur</th><th>État</th><th /></tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const st = stockStatus(i.current_stock, i.minimum_stock);
                return (
                  <tr key={i.id} className="border-t border-border">
                    <td className="py-2">
                      <div className="font-medium">{i.name}</div>
                      {i.sku ? <div className="text-xs text-muted-foreground">{i.sku}</div> : null}
                    </td>
                    <td>{num(i.current_stock)} {UNIT_LABELS[i.unit] ?? i.unit}</td>
                    <td>{num(i.minimum_stock)}</td>
                    <td>{money(i.average_unit_cost)}</td>
                    <td className="text-muted-foreground">{i.supplier_name || "—"}</td>
                    <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span></td>
                    <td className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => adjust(i)}>Ajuster</Button>
                      <Button size="sm" variant="ghost" onClick={() => openTx(i)}>Historique</Button>
                      <Button size="sm" variant="ghost" onClick={() => {
                        setEditing(i);
                        setForm({
                          name: i.name, sku: i.sku ?? "", unit: i.unit, current_stock: Number(i.current_stock),
                          minimum_stock: Number(i.minimum_stock), reorder_quantity: Number(i.reorder_quantity),
                          average_unit_cost: Number(i.average_unit_cost), supplier_id: i.supplier_id,
                        });
                      }}>Modifier</Button>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        try {
                          await api.invUpdateIngredient(password, i.id, { active: !(i.active ? true : false) });
                          load();
                        } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
                      }}>{i.active ? "Désactiver" : "Activer"}</Button>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && <tr><td colSpan={7} className="py-4 text-muted-foreground">Aucun ingrédient.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      {txFor && (
        <Panel title={`Historique — ${txFor.name}`} action={<Button size="sm" variant="ghost" onClick={() => setTxFor(null)}>Fermer</Button>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2">Date</th><th>Type</th><th>Quantité</th><th>Coût unit.</th><th>Référence</th><th>Note</th></tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="py-2 whitespace-nowrap">{t.created_at}</td>
                    <td>{TX_LABELS[t.transaction_type] ?? t.transaction_type}</td>
                    <td className={Number(t.quantity) < 0 ? "text-destructive" : "text-emerald-600"}>{num(t.quantity)}</td>
                    <td>{t.unit_cost != null ? money(t.unit_cost) : "—"}</td>
                    <td className="text-muted-foreground">{t.reference_type ? `${t.reference_type} ${t.reference_id ?? ""}` : "—"}</td>
                    <td className="text-muted-foreground">{t.note || "—"}</td>
                  </tr>
                ))}
                {txs.length === 0 && <tr><td colSpan={6} className="py-4 text-muted-foreground">Aucune transaction.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

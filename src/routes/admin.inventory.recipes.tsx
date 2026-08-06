import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, type Ingredient, type RecipeLine } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MENU } from "@/lib/menu";
import { Panel, money, num, useAdminPassword, UNITS, UNIT_LABELS, foodCostClass } from "@/lib/inventory-ui";

export const Route = createFileRoute("/admin/inventory/recipes")({ component: RecipesPage });

const ALL_ITEMS = MENU.flatMap((c) => c.items.map((i) => ({ id: i.id, name: i.name, price: i.price, category: c.name })));

function RecipesPage() {
  const password = useAdminPassword();
  const [itemId, setItemId] = useState(ALL_ITEMS[0]?.id ?? "");
  const [recipes, setRecipes] = useState<RecipeLine[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingId, setIngId] = useState<number | "">("");
  const [qty, setQty] = useState(0);
  const [unit, setUnit] = useState("g");

  const item = ALL_ITEMS.find((i) => i.id === itemId);

  const load = useCallback(() => {
    if (!password || !itemId) return;
    api.invRecipes(password, itemId).then((r) => setRecipes(r.recipes)).catch((e) => toast.error(e.message));
  }, [password, itemId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (password) api.invIngredients(password, { active: true }).then((r) => setIngredients(r.ingredients)).catch(() => {});
  }, [password]);

  const cost = recipes.reduce((s, r) => s + Number(r.line_cost || 0), 0);
  const price = item?.price ?? 0;
  const pct = price > 0 ? (cost / price) * 100 : 0;

  return (
    <div className="space-y-5">
      <Panel title="Recette par article">
        <div className="grid gap-3 sm:grid-cols-2">
          <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={itemId} onChange={(e) => setItemId(e.target.value)}>
            {ALL_ITEMS.map((i) => <option key={i.id} value={i.id}>{i.category} — {i.name}</option>)}
          </select>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span>Prix : <strong>{money(price)}</strong></span>
            <span>Coût matière : <strong>{money(cost)}</strong></span>
            <span>Marge brute : <strong>{money(price - cost)}</strong></span>
            <span>Coût % : <strong className={foodCostClass(pct)}>{pct.toFixed(1)} %</strong></span>
          </div>
        </div>
      </Panel>

      <Panel title="Ingrédients de la recette">
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={ingId} onChange={(e) => setIngId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Choisir un ingrédient…</option>
            {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <Input type="number" step="0.001" className="h-10 w-28" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map((u) => <option key={u} value={u}>{UNIT_LABELS[u] ?? u}</option>)}
          </select>
          <Button onClick={async () => {
            if (!ingId || !qty) return toast.error("Ingrédient et quantité requis");
            try {
              await api.invSaveRecipe(password, { menu_item_id: itemId, ingredient_id: Number(ingId), quantity_required: qty, unit });
              setIngId(""); setQty(0); load(); toast.success("Recette mise à jour");
            } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
          }}>Ajouter</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Ingrédient</th><th>Quantité</th><th>Coût ligne</th><th /></tr>
            </thead>
            <tbody>
              {recipes.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-2 font-medium">{r.ingredient_name}</td>
                  <td>{num(r.quantity_required)} {UNIT_LABELS[r.unit] ?? r.unit}</td>
                  <td>{money(r.line_cost)}</td>
                  <td className="text-right">
                    <Button size="sm" variant="ghost" onClick={async () => {
                      const raw = window.prompt("Nouvelle quantité :", String(r.quantity_required));
                      if (raw == null) return;
                      try {
                        await api.invUpdateRecipe(password, r.id, { quantity_required: Number(raw.replace(",", ".")) });
                        load();
                      } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
                    }}>Modifier</Button>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      try { await api.invDeleteRecipe(password, r.id); load(); }
                      catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
                    }}>Retirer</Button>
                  </td>
                </tr>
              ))}
              {recipes.length === 0 && <tr><td colSpan={4} className="py-4 text-muted-foreground">Aucune recette pour cet article.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

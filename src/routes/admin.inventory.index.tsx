import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, type Ingredient, type InventoryMetrics } from "@/lib/api";
import { toast } from "sonner";
import { MENU } from "@/lib/menu";
import {
  Panel, StatCard, money, num, stockStatus, foodCostClass, useAdminPassword, UNIT_LABELS,
} from "@/lib/inventory-ui";
import { connectAdminEvents } from "@/lib/realtime";

export const Route = createFileRoute("/admin/inventory/")({ component: InventoryOverview });

const ALL_ITEMS = MENU.flatMap((c) => c.items.map((i) => ({ ...i, category: c.name })));

function InventoryOverview() {
  const password = useAdminPassword();
  const [metrics, setMetrics] = useState<InventoryMetrics | null>(null);
  const [low, setLow] = useState<Ingredient[]>([]);

  const load = useCallback(() => {
    if (!password) return;
    api.invMetrics(password).then(setMetrics).catch((e) => toast.error(e.message));
    api.invLowStock(password).then((r) => setLow(r.ingredients)).catch(() => {});
  }, [password]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!password) return;
    const c = connectAdminEvents(password, (ev) => {
      if (["inventory_low_stock", "inventory_adjusted", "purchase_received", "waste_recorded", "recipe_updated"].includes(ev)) load();
    }, { fallbackPoll: load, pollIntervalMs: 30000 });
    return () => c.close();
  }, [password, load]);

  const costs = metrics?.item_costs ?? {};
  const rows = ALL_ITEMS
    .map((i) => {
      const cost = Number(costs[i.id] ?? 0);
      const pct = i.price > 0 ? (cost / i.price) * 100 : 0;
      return { ...i, cost, pct, profit: i.price - cost, hasRecipe: costs[i.id] != null };
    })
    .filter((r) => r.hasRecipe);
  const highCost = [...rows].sort((a, b) => b.pct - a.pct).slice(0, 5);
  const bestMargin = [...rows].sort((a, b) => b.profit - a.profit).slice(0, 5);
  const worstMargin = [...rows].sort((a, b) => a.profit - b.profit).slice(0, 5);
  const theoretical = rows.length ? rows.reduce((s, r) => s + r.pct, 0) / rows.length : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Valeur du stock" value={money(metrics?.inventory_value ?? 0)} />
        <StatCard label="Ingrédients actifs" value={metrics?.ingredient_count ?? 0} />
        <StatCard label="Stock bas" value={metrics?.low_stock_count ?? 0} hint="≤ minimum" />
        <StatCard label="Coût matière théorique" value={`${theoretical.toFixed(1)} %`} hint="moyenne des recettes" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Pertes aujourd'hui" value={money(metrics?.waste_today ?? 0)} />
        <StatCard label="Pertes 7 jours" value={money(metrics?.waste_week ?? 0)} />
        <StatCard label="Pertes 30 jours" value={money(metrics?.waste_month ?? 0)} />
      </div>

      <Panel title={`Stock bas (${low.length})`}>
        {low.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun ingrédient sous le seuil minimum.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2">Ingrédient</th><th>Stock</th><th>Min</th><th>Réappro</th><th>Fournisseur</th><th>État</th></tr>
              </thead>
              <tbody>
                {low.map((i) => {
                  const st = stockStatus(i.current_stock, i.minimum_stock);
                  return (
                    <tr key={i.id} className="border-t border-border">
                      <td className="py-2 font-medium">{i.name}</td>
                      <td>{num(i.current_stock)} {UNIT_LABELS[i.unit] ?? i.unit}</td>
                      <td>{num(i.minimum_stock)}</td>
                      <td>{num(i.reorder_quantity)}</td>
                      <td className="text-muted-foreground">{i.supplier_name || "—"}</td>
                      <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Coût matière le plus élevé">
          <CostList rows={highCost} mode="pct" />
        </Panel>
        <Panel title="Meilleures marges">
          <CostList rows={bestMargin} mode="profit" />
        </Panel>
        <Panel title="Marges les plus faibles">
          <CostList rows={worstMargin} mode="profit" />
        </Panel>
      </div>

      <Panel title="Exports CSV">
        <div className="flex flex-wrap gap-2 text-sm">
          <CsvLink path="ingredients.csv" label="Stock" password={password} />
          <CsvLink path="transactions.csv" label="Transactions" password={password} />
          <CsvLink path="waste.csv" label="Pertes" password={password} />
          <CsvLink path="purchases.csv" label="Achats" password={password} />
        </div>
      </Panel>
    </div>
  );
}

function CostList({ rows, mode }: { rows: Array<{ id: string; name: string; price: number; cost: number; pct: number; profit: number }>; mode: "pct" | "profit" }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Aucune recette définie.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2">
          <span className="truncate">{r.name}</span>
          {mode === "pct" ? (
            <span className={`font-medium ${foodCostClass(r.pct)}`}>{r.pct.toFixed(1)} %</span>
          ) : (
            <span className="font-medium">{money(r.profit)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function CsvLink({ path, label, password }: { path: string; label: string; password: string }) {
  return (
    <button
      type="button"
      className="rounded-full border border-border px-3 py-1.5 hover:border-primary/40"
      onClick={async () => {
        try {
          const res = await fetch(`/api/admin/inventory/${path}`, { headers: { "X-Admin-Password": password } });
          if (!res.ok) throw new Error("Export impossible");
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = path; a.click();
          URL.revokeObjectURL(url);
        } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
      }}
    >
      {label}
    </button>
  );
}

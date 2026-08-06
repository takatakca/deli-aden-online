import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, type Ingredient, type WasteLog } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel, money, num, useAdminPassword, UNIT_LABELS, WASTE_REASONS } from "@/lib/inventory-ui";

export const Route = createFileRoute("/admin/inventory/waste")({ component: WastePage });

function WastePage() {
  const password = useAdminPassword();
  const [rows, setRows] = useState<WasteLog[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [ingId, setIngId] = useState<number | "">("");
  const [qty, setQty] = useState(0);
  const [reason, setReason] = useState("expired");
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    if (!password) return;
    api.invWaste(password).then((r) => setRows(r.waste)).catch((e) => toast.error(e.message));
  }, [password]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (password) api.invIngredients(password, { active: true }).then((r) => setIngredients(r.ingredients)).catch(() => {});
  }, [password]);

  const selected = ingredients.find((i) => i.id === Number(ingId));
  const estimate = selected ? qty * Number(selected.average_unit_cost) : 0;

  return (
    <div className="space-y-5">
      <Panel title="Enregistrer une perte">
        <div className="flex flex-wrap items-end gap-2">
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={ingId} onChange={(e) => setIngId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Ingrédient…</option>
            {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({UNIT_LABELS[i.unit] ?? i.unit})</option>)}
          </select>
          <Input type="number" step="0.001" className="h-10 w-28" placeholder="Qté" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
            {WASTE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <Input className="h-10 w-52" placeholder="Note (optionnel)" value={note} onChange={(e) => setNote(e.target.value)} />
          <span className="text-sm text-muted-foreground">Coût estimé : <strong>{money(estimate)}</strong></span>
          <Button onClick={async () => {
            if (!ingId || !qty) return toast.error("Ingrédient et quantité requis");
            try {
              const r = await api.invRecordWaste(password, { ingredient_id: Number(ingId), quantity: qty, reason, note });
              toast.success(`Perte enregistrée (${money(r.estimated_cost)})`);
              setQty(0); setNote(""); load();
            } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
          }}>Enregistrer</Button>
        </div>
      </Panel>

      <Panel title={`Historique des pertes (${rows.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Date</th><th>Ingrédient</th><th>Quantité</th><th>Raison</th><th>Coût</th><th>Note</th></tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id} className="border-t border-border">
                  <td className="py-2 whitespace-nowrap">{w.created_at}</td>
                  <td className="font-medium">{w.ingredient_name || "—"}</td>
                  <td>{num(w.quantity)} {UNIT_LABELS[w.unit ?? ""] ?? w.unit ?? ""}</td>
                  <td>{WASTE_REASONS.find((r) => r.value === w.reason)?.label ?? w.reason}</td>
                  <td>{money(w.estimated_cost)}</td>
                  <td className="text-muted-foreground">{w.note || "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="py-4 text-muted-foreground">Aucune perte enregistrée.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

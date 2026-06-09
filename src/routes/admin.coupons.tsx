import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type Coupon } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PASSWORD_KEY } from "@/lib/admin-shared";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/coupons")({ component: CouponsPage });

function CouponsPage() {
  const password = typeof window !== "undefined" ? localStorage.getItem(PASSWORD_KEY) || "" : "";
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount" | "free_delivery">("percent");
  const [value, setValue] = useState("");
  const [minSubtotal, setMinSubtotal] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expires, setExpires] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try { setCoupons((await api.adminListCoupons(password)).coupons); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const create = async () => {
    if (!code.trim()) { toast.error("Code requis"); return; }
    setLoading(true);
    try {
      await api.adminCreateCoupon(password, {
        code: code.trim().toUpperCase(),
        kind, value: Number(value) || 0,
        min_subtotal: Number(minSubtotal) || 0,
        max_uses: maxUses ? Number(maxUses) : null,
        expires_at: expires || null,
      });
      setCode(""); setValue(""); setMinSubtotal(""); setMaxUses(""); setExpires("");
      toast.success("Code créé");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  };

  const remove = async (id: number) => {
    if (!window.confirm("Supprimer ce code ?")) return;
    try { await api.adminDeleteCoupon(password, id); load(); toast.success("Supprimé"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  const toggle = async (c: Coupon) => {
    try {
      await api.adminUpdateCoupon(password, c.id, { active: !c.active });
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  return (
    <div>
      <h2 className="mb-4 font-display text-xl font-bold">Codes promo</h2>

      <section className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-3 font-medium">Nouveau code</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <Label className="mb-1 block text-xs">Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME10" maxLength={40} className="uppercase" />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">% de remise</SelectItem>
                <SelectItem value="amount">Montant ($)</SelectItem>
                <SelectItem value="free_delivery">Livraison gratuite</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Valeur</Label>
            <Input type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "percent" ? "10" : "5.00"} disabled={kind === "free_delivery"} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Sous-total min ($)</Label>
            <Input type="number" min="0" step="0.01" value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} placeholder="0" />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Max utilisations</Label>
            <Input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="illimité" />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Expire le</Label>
            <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={create} disabled={loading} className="gap-1"><Plus className="h-4 w-4" /> Créer</Button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-3 font-medium">Codes existants ({coupons.length})</h3>
        {coupons.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun code créé.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th>Code</th><th>Type</th><th>Valeur</th><th>Min</th><th>Utilisations</th><th>Expire</th><th>Actif</th><th></th></tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="py-2 font-mono font-semibold">{c.code}</td>
                  <td>{c.kind === "percent" ? "%" : c.kind === "amount" ? "$" : "Livraison"}</td>
                  <td>{c.kind === "free_delivery" ? "—" : c.kind === "percent" ? `${c.value}%` : `${c.value} $`}</td>
                  <td>{c.min_subtotal ? `${c.min_subtotal} $` : "—"}</td>
                  <td>{c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ""}</td>
                  <td>{c.expires_at ? new Date(c.expires_at).toLocaleDateString("fr-CA") : "—"}</td>
                  <td>
                    <button onClick={() => toggle(c)} className={`rounded-full px-2 py-0.5 text-xs ${c.active ? "bg-emerald-600 text-white" : "bg-muted"}`}>
                      {c.active ? "Actif" : "Inactif"}
                    </button>
                  </td>
                  <td><Button variant="ghost" size="icon" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

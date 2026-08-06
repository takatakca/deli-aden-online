import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { api, type Supplier } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel, useAdminPassword } from "@/lib/inventory-ui";

export const Route = createFileRoute("/admin/inventory/suppliers")({ component: SuppliersPage });

const EMPTY = { name: "", contact_name: "", phone: "", email: "", address: "" };

function SuppliersPage() {
  const password = useAdminPassword();
  const [rows, setRows] = useState<Supplier[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editing, setEditing] = useState<Supplier | null>(null);

  const load = useCallback(() => {
    if (!password) return;
    api.invSuppliers(password).then((r) => setRows(r.suppliers)).catch((e) => toast.error(e.message));
  }, [password]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.name.trim()) return toast.error("Nom requis");
    try {
      if (editing) await api.invUpdateSupplier(password, editing.id, form);
      else await api.invCreateSupplier(password, form);
      setForm({ ...EMPTY }); setEditing(null); load();
      toast.success("Fournisseur enregistré");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
  };

  return (
    <div className="space-y-5">
      <Panel title={editing ? `Modifier « ${editing.name} »` : "Nouveau fournisseur"}
        action={editing ? <Button size="sm" variant="ghost" onClick={() => { setEditing(null); setForm({ ...EMPTY }); }}>Annuler</Button> : null}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {([["name", "Nom"], ["contact_name", "Contact"], ["phone", "Téléphone"], ["email", "Courriel"], ["address", "Adresse"]] as const).map(([k, label]) => (
            <div key={k} className="space-y-1">
              <Label className="text-xs">{label}</Label>
              <Input value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
        </div>
        <Button className="mt-4" onClick={submit}>{editing ? "Enregistrer" : "Ajouter"}</Button>
      </Panel>

      <Panel title={`Fournisseurs (${rows.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Nom</th><th>Contact</th><th>Téléphone</th><th>Courriel</th><th>Ingrédients</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="py-2 font-medium">{s.name}{!s.active && <span className="ml-2 text-xs text-muted-foreground">(inactif)</span>}</td>
                  <td>{s.contact_name || "—"}</td>
                  <td>{s.phone || "—"}</td>
                  <td>{s.email || "—"}</td>
                  <td>{s.ingredient_count ?? 0}</td>
                  <td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => {
                      setEditing(s);
                      setForm({
                        name: s.name, contact_name: s.contact_name ?? "", phone: s.phone ?? "",
                        email: s.email ?? "", address: s.address ?? "",
                      });
                    }}>Modifier</Button>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      if (!window.confirm(`Supprimer ${s.name} ?`)) return;
                      try { await api.invDeleteSupplier(password, s.id); load(); }
                      catch (e) { toast.error(e instanceof Error ? e.message : "Erreur"); }
                    }}>Supprimer</Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="py-4 text-muted-foreground">Aucun fournisseur.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { api, type MenuOverride } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DishImage } from "@/components/DishImage";
import { MENU } from "@/lib/menu";
import { PASSWORD_KEY } from "@/lib/admin-shared";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/menu")({ component: MenuAdminPage });

type Draft = Record<string, MenuOverride>;

function defaultOverride(itemId: string): MenuOverride {
  return { item_id: itemId, available: true, price_override: null, description_override: null, image_override: null };
}

function MenuAdminPage() {
  const password = typeof window !== "undefined" ? localStorage.getItem(PASSWORD_KEY) || "" : "";
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.adminGetMenu(password).then((r) => {
      const d: Draft = {};
      for (const cat of MENU) for (const it of cat.items) d[it.id] = defaultOverride(it.id);
      for (const o of r.overrides) d[o.item_id] = { ...defaultOverride(o.item_id), ...o };
      setDraft(d);
    }).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [password]);

  const setField = (itemId: string, patch: Partial<MenuOverride>) =>
    setDraft((d) => ({ ...d, [itemId]: { ...d[itemId], ...patch } }));

  const saveItem = async (itemId: string) => {
    try { await api.adminUpsertMenuOverride(password, itemId, draft[itemId]); toast.success("Enregistré"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  const bulkCategory = async (catId: string, available: boolean) => {
    const cat = MENU.find((c) => c.id === catId); if (!cat) return;
    const items = cat.items.map((i) => i.id);
    try {
      await api.adminBulkMenu(password, items, available);
      setDraft((d) => {
        const nd = { ...d };
        for (const id of items) nd[id] = { ...nd[id], available };
        return nd;
      });
      toast.success(`${cat.name} : ${available ? "activés" : "désactivés"}`);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  const counts = useMemo(() => {
    let on = 0, off = 0;
    for (const k in draft) (draft[k].available ? on++ : off++);
    return { on, off };
  }, [draft]);

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Menu</h2>
        <span className="text-xs text-muted-foreground">{counts.on} disponibles • {counts.off} indisponibles</span>
      </div>

      {MENU.map((cat) => (
        <section key={cat.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold">{cat.name}</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => bulkCategory(cat.id, true)}>Tout activer</Button>
              <Button size="sm" variant="outline" onClick={() => bulkCategory(cat.id, false)}>Tout désactiver</Button>
            </div>
          </div>
          <div className="divide-y divide-border">
            {cat.items.map((it) => {
              const ov = draft[it.id] ?? defaultOverride(it.id);
              return (
                <div key={it.id} className="grid gap-3 py-3 md:grid-cols-[64px_1fr_120px_1fr_auto] md:items-center">
                  <div className="w-16 shrink-0 overflow-hidden rounded-md border border-border">
                    <DishImage src={ov.image_override || it.image} name={it.name} ratio="aspect-square" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{it.name}</span>
                      <span className="text-xs text-muted-foreground">{it.price.toFixed(2)}$</span>
                    </div>
                    {it.description && <div className="text-xs text-muted-foreground line-clamp-1">{it.description}</div>}
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Prix</Label>
                    <Input type="number" step="0.01" placeholder={it.price.toFixed(2)} value={ov.price_override ?? ""}
                      onChange={(e) => setField(it.id, { price_override: e.target.value === "" ? null : Number(e.target.value) })}
                      className="h-8" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Image (URL)</Label>
                    <div className="flex gap-1">
                      <Input placeholder={it.image} value={ov.image_override ?? ""}
                        onChange={(e) => setField(it.id, { image_override: e.target.value || null })}
                        className="h-8" />
                      <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 px-2 text-xs"
                        onClick={() => setField(it.id, { image_override: null })}>
                        Défaut
                      </Button>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Texte alternatif généré automatiquement à partir du nom du plat (traduit).
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch checked={!!ov.available} onCheckedChange={(v) => setField(it.id, { available: v })} />
                    <Button size="sm" onClick={() => saveItem(it.id)}>OK</Button>
                  </div>
                  <div className="md:col-span-5">
                    <Input placeholder="Description (laisser vide pour défaut)" value={ov.description_override ?? ""}
                      onChange={(e) => setField(it.id, { description_override: e.target.value || null })}
                      className="h-8 text-xs" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

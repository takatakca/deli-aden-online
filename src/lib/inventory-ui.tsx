import { useEffect, useState } from "react";
import { PASSWORD_KEY } from "@/lib/admin-shared";
import { INVENTORY_UNITS } from "@/lib/api";

export function useAdminPassword() {
  const [pwd, setPwd] = useState("");
  useEffect(() => { setPwd(localStorage.getItem(PASSWORD_KEY) || ""); }, []);
  return pwd;
}

export const money = (n: number) =>
  new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(Number(n) || 0);

export const num = (n: unknown, digits = 2) => {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(digits).replace(/\.?0+$/, "") || "0" : "0";
};

export const UNIT_LABELS: Record<string, string> = {
  g: "g", kg: "kg", ml: "ml", l: "L", unit: "unité", portion: "portion",
};

export const UNITS = INVENTORY_UNITS;

export const TX_LABELS: Record<string, string> = {
  purchase: "Achat",
  manual_add: "Ajout manuel",
  manual_remove: "Retrait manuel",
  order_consumption: "Consommation commande",
  waste: "Perte",
  correction: "Correction",
  return_to_supplier: "Retour fournisseur",
};

export const WASTE_REASONS = [
  { value: "expired", label: "Périmé" },
  { value: "spoiled", label: "Abîmé" },
  { value: "prep_error", label: "Erreur de préparation" },
  { value: "spillage", label: "Renversé" },
  { value: "other", label: "Autre" },
];

export function stockStatus(current: number, min: number): { label: string; cls: string } {
  const c = Number(current) || 0;
  const m = Number(min) || 0;
  if (c <= 0) return { label: "Épuisé", cls: "bg-destructive/15 text-destructive" };
  if (c <= m) return { label: "Critique", cls: "bg-destructive/15 text-destructive" };
  if (c <= m * 1.5) return { label: "Bas", cls: "bg-amber-500/15 text-amber-600" };
  return { label: "OK", cls: "bg-emerald-500/15 text-emerald-600" };
}

export function foodCostClass(pct: number): string {
  if (pct <= 30) return "text-emerald-600";
  if (pct <= 40) return "text-amber-600";
  return "text-destructive";
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-display text-2xl font-bold">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

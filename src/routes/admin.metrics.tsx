import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type Metrics } from "@/lib/api";
import { PASSWORD_KEY, STATUS_LABELS } from "@/lib/admin-shared";
import { toast } from "sonner";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/admin/metrics")({ component: MetricsPage });

const fmtMoney = (n: number) => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(n);

function MetricsPage() {
  const password = typeof window !== "undefined" ? localStorage.getItem(PASSWORD_KEY) || "" : "";
  const [m, setM] = useState<Metrics | null>(null);

  useEffect(() => {
    const load = () => api.adminMetrics(password).then(setM).catch((e) => toast.error(e.message));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [password]);

  if (!m) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">Statistiques</h2>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Nouvelles" value={m.by_status.new || 0} />
        <Card label="En préparation" value={m.by_status.preparing || 0} />
        <Card label="Prêtes" value={m.by_status.ready || 0} />
        <Card label="Expédiées" value={m.by_status.dispatched || 0} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Commandes aujourd'hui" value={m.today.orders} />
        <Card label="Revenus aujourd'hui" value={fmtMoney(m.today.revenue)} />
        <Card label="Revenus 7 jours" value={fmtMoney(m.week_revenue)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card label="Revenus 30 jours" value={fmtMoney(m.month_revenue)} />
        <Card label="Terminées (total)" value={m.by_status.completed || 0} />
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-3 font-semibold">Commandes par jour (14 derniers)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={m.series}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Bar dataKey="orders" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-3 font-semibold">Revenus par jour (14 derniers)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={m.series}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v: number) => fmtMoney(v)} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-3 font-semibold">Répartition par statut</h3>
        <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {Object.entries(m.by_status).map(([k, v]) => (
            <li key={k} className="rounded-lg border border-border p-2">
              <div className="text-xs text-muted-foreground">{STATUS_LABELS[k] ?? k}</div>
              <div className="font-display text-xl font-bold">{v}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-display text-2xl font-bold">{value}</div>
    </div>
  );
}

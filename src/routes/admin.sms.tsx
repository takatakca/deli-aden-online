import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, type SmsLog } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PASSWORD_KEY } from "@/lib/admin-shared";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/admin/sms")({ component: SmsPage });

function SmsPage() {
  const password = typeof window !== "undefined" ? localStorage.getItem(PASSWORD_KEY) || "" : "";
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [config, setConfig] = useState<{ enabled: boolean; configured: boolean; from: string | null; admin_phone: string | null } | null>(null);

  const load = async () => {
    try {
      const r = await api.adminSmsLogs(password, { status: status === "all" ? undefined : status, search: search || undefined });
      setLogs(r.logs); setConfig(r.config);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  const retry = async (id: number) => {
    try { const r = await api.adminSmsRetry(password, id); toast[r.ok ? "success" : "error"](r.ok ? "SMS renvoyé" : "Échec"); load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
  };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">Journal SMS</h2>
      {config && (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          <div>SMS activé : <strong>{config.enabled ? "Oui" : "Non"}</strong></div>
          <div>Twilio configuré : <strong>{config.configured ? "Oui" : "Non"}</strong></div>
          <div>Numéro : <strong>{config.from || "—"}</strong></div>
          <div>Admin SMS : <strong>{config.admin_phone || "—"}</strong></div>
          <div className="mt-1 text-xs text-muted-foreground">Les secrets Twilio sont configurés uniquement par variables d'environnement.</div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="sent">Envoyés</SelectItem>
            <SelectItem value="failed">Échec</SelectItem>
            <SelectItem value="skipped">Ignorés</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Recherche téléphone ou #commande" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        <Button variant="outline" onClick={load}><RefreshCw className="mr-1 h-4 w-4" /> Rafraîchir</Button>
      </div>
      <div className="rounded-2xl border border-border bg-card">
        {logs.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Aucun journal SMS.</div>
        ) : (
          <ul className="divide-y divide-border">
            {logs.map((l) => (
              <li key={l.id} className="grid gap-1 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${l.status === "sent" ? "bg-emerald-100 text-emerald-800" : l.status === "failed" ? "bg-red-100 text-red-800" : "bg-muted text-muted-foreground"}`}>{l.status}</span>
                  <strong>{l.message_type}</strong>
                  <span className="text-muted-foreground">→ {l.phone}</span>
                  {l.order_id && <span className="text-xs text-muted-foreground">#{l.order_id}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString("fr-CA")}</span>
                </div>
                <div className="text-xs text-muted-foreground">{l.body}</div>
                {l.error && <div className="text-xs text-red-600">Erreur : {l.error}</div>}
                {(l.status === "failed" || l.status === "skipped") && (
                  <div><Button size="sm" variant="outline" onClick={() => retry(l.id)}>Réessayer</Button></div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

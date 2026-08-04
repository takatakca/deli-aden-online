// Turn 5 — Shared customer account panels, reused by /account and /customer/* routes.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  customerApi, useCustomer,
  type SavedAddress, type FavoriteOrder, type CustomerOrder,
} from "@/lib/customer-auth";
import { reorderItems, reorderMessage } from "@/lib/reorder";
import { fmt } from "@/lib/cart-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Star, Repeat } from "lucide-react";

export function LoginForm({ onDone }: { onDone?: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        try { await customerApi.login(email.trim(), password); toast.success("Connecté"); onDone?.(); }
        catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
        finally { setLoading(false); }
      }}
      className="space-y-3"
    >
      <div><Label>Email</Label><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div><Label>Mot de passe</Label><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <Button type="submit" disabled={loading} className="w-full">{loading ? "Connexion…" : "Se connecter"}</Button>
    </form>
  );
}

export function SignupForm({ onDone }: { onDone?: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
          await customerApi.signup({ name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, password });
          toast.success("Compte créé");
          onDone?.();
        }
        catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
        finally { setLoading(false); }
      }}
      className="space-y-3"
    >
      <div><Label>Nom complet</Label><Input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div><Label>Email</Label><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div><Label>Téléphone (optionnel)</Label><Input type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <div><Label>Mot de passe (min. 8 caractères)</Label><Input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <Button type="submit" disabled={loading} className="w-full">{loading ? "Création…" : "Créer mon compte"}</Button>
    </form>
  );
}

export function ForgotForm({ onDone }: { onDone?: () => void }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        try { await customerApi.forgot(email.trim()); toast.success("Si un compte existe, un lien a été envoyé."); onDone?.(); }
        catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
        finally { setLoading(false); }
      }}
      className="space-y-3"
    >
      <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <Button type="submit" disabled={loading} className="w-full">{loading ? "Envoi…" : "Envoyer le lien"}</Button>
    </form>
  );
}

async function runReorder(items: FavoriteOrder["items"], navigateToCart: () => void) {
  try {
    const r = await reorderItems(items, { clear: true });
    const msg = reorderMessage(r);
    if (r.added === 0) toast.error(msg.title, { description: msg.detail });
    else toast.success(msg.title, { description: msg.detail });
    if (r.added > 0) navigateToCart();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Erreur");
  }
}

export function OrdersList() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  useEffect(() => {
    customerApi.orders().then((r) => setOrders(r.orders)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return <p className="text-muted-foreground">Chargement…</p>;
  if (orders.length === 0) return <p className="text-muted-foreground">Aucune commande pour le moment.</p>;
  return (
    <ul className="space-y-3">
      {orders.map((o) => (
        <li key={o.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-display text-lg font-semibold">{o.order_number}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(o.created_at).toLocaleString("fr-CA")} • {o.order_type === "delivery" ? "Livraison" : "Ramassage"} • {o.status}
              </div>
            </div>
            <div className="text-right"><div className="font-bold text-primary">{fmt(o.total)}</div></div>
          </div>
          <div className="mt-2 text-sm text-muted-foreground line-clamp-2">
            {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/track/$orderNumber" params={{ orderNumber: o.order_number }}>
              <Button variant="outline" size="sm">Suivre</Button>
            </Link>
            <Button
              variant="secondary" size="sm"
              onClick={() => runReorder(o.items, () => navigate({ to: "/cart" }))}
            >
              <Repeat className="mr-2 h-4 w-4" /> Recommander
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={async () => {
                try { await customerApi.createFavorite(`Commande ${o.order_number}`, o.items); toast.success("Ajoutée aux favoris"); }
                catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
              }}
            >
              <Star className="mr-2 h-4 w-4" /> Favori
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AddressesList() {
  const [list, setList] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ label: "Maison", address: "", unit: "", door_code: "", instructions: "", is_default: false });
  const load = () => { setLoading(true); customerApi.addresses().then((r) => setList(r.addresses)).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  return (
    <div>
      {loading ? <p className="text-muted-foreground">Chargement…</p> : list.length === 0 ? (
        <p className="text-muted-foreground">Aucune adresse enregistrée.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 rounded-xl border border-border bg-card p-3">
              <div>
                <div className="font-semibold">{a.label}{a.is_default && <span className="ml-2 rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">par défaut</span>}</div>
                <div className="text-sm">{a.address}{a.unit ? ` — ${a.unit}` : ""}</div>
                {a.instructions && <div className="text-xs text-muted-foreground">{a.instructions}</div>}
              </div>
              <Button variant="ghost" size="sm" onClick={async () => { await customerApi.deleteAddress(a.id); load(); }}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.address.trim()) return;
          try {
            await customerApi.createAddress({
              label: form.label, address: form.address, unit: form.unit || null,
              door_code: form.door_code || null, instructions: form.instructions || null,
              is_default: form.is_default,
            });
            setForm({ label: "Maison", address: "", unit: "", door_code: "", instructions: "", is_default: false });
            load();
            toast.success("Adresse ajoutée");
          } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
        }}
        className="mt-4 space-y-2 rounded-xl border border-dashed border-border p-4"
      >
        <div className="font-semibold">Nouvelle adresse</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Étiquette (Maison, Bureau…)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <Input placeholder="Adresse complète" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
          <Input placeholder="App./Unité" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          <Input placeholder="Code de porte" value={form.door_code} onChange={(e) => setForm({ ...form, door_code: e.target.value })} />
        </div>
        <Input placeholder="Instructions pour le livreur" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
          Définir par défaut
        </label>
        <Button type="submit"><Plus className="mr-2 h-4 w-4" /> Ajouter</Button>
      </form>
    </div>
  );
}

export function FavoritesList() {
  const [list, setList] = useState<FavoriteOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const load = () => { setLoading(true); customerApi.favorites().then((r) => setList(r.favorites)).catch(() => {}).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  if (loading) return <p className="text-muted-foreground">Chargement…</p>;
  if (list.length === 0) return <p className="text-muted-foreground">Aucun favori. Marquez une commande passée comme favorite.</p>;
  return (
    <ul className="space-y-2">
      {list.map((f) => (
        <li key={f.id} className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold">{f.label}</div>
            <Button variant="ghost" size="sm" onClick={async () => { await customerApi.deleteFavorite(f.id); load(); }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">{f.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</div>
          <Button
            className="mt-2" size="sm" variant="secondary"
            onClick={() => runReorder(f.items, () => navigate({ to: "/cart" }))}
          >
            <Repeat className="mr-2 h-4 w-4" /> Commander
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function ProfileForm() {
  const { customer } = useCustomer();
  const [name, setName] = useState(customer?.name || "");
  const [phone, setPhone] = useState(customer?.phone || "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
          await customerApi.updateProfile({ name, phone, password: password || undefined });
          setPassword("");
          toast.success("Profil mis à jour");
        } catch (err) { toast.error(err instanceof Error ? err.message : "Erreur"); }
        finally { setLoading(false); }
      }}
      className="max-w-md space-y-3"
    >
      <div><Label>Nom</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div><Label>Téléphone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
      <div><Label>Nouveau mot de passe (laisser vide pour ne pas changer)</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" disabled={loading}>{loading ? "Enregistrement…" : "Enregistrer"}</Button>
    </form>
  );
}

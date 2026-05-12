import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Phone, Mail, MapPin } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/contact")({
  head: () => ({ meta: [{ title: "Contact — Les Délices d'Aden" }] }),
  component: Contact,
});

function Contact() {
  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "" });
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.submitContact(form);
      toast.success("Message envoyé !");
      setForm({ name: "", phone: "", email: "", message: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <header className="text-center">
        <span className="category-bar text-xs">Contact</span>
        <h1 className="mt-4 font-display text-4xl font-bold md:text-5xl">Nous contacter</h1>
        <p className="mt-2 text-muted-foreground">Une question ? Une réservation ? Écrivez-nous.</p>
      </header>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div>
            <Label className="mb-1.5 block text-sm">Nom *</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">Téléphone</Label>
            <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40} />
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">Email *</Label>
            <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={200} />
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">Message *</Label>
            <Textarea required rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={3000} />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "Envoi..." : "Envoyer le message"}
          </Button>
        </form>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="font-display text-lg font-semibold">Coordonnées</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex items-center gap-3"><Phone className="h-4 w-4 text-primary" /> (000) 000-0000</li>
              <li className="flex items-center gap-3"><Mail className="h-4 w-4 text-primary" /> orders@deliaden.ca</li>
              <li className="flex items-start gap-3"><MapPin className="mt-0.5 h-4 w-4 text-primary" /> Adresse du restaurant, Québec</li>
            </ul>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="aspect-video w-full bg-muted">
              <iframe
                title="Localisation"
                src="https://www.google.com/maps/embed/v1/place?key=&q=Quebec+Canada"
                className="h-full w-full"
                loading="lazy"
              />
            </div>
            <p className="p-3 text-xs text-muted-foreground">Carte Google (placeholder — ajoutez votre adresse exacte).</p>
          </div>
        </div>
      </div>
    </div>
  );
}

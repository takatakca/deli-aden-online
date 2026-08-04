import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useCustomer, signOutRemote } from "@/lib/customer-auth";
import { ProfileForm, FavoritesList } from "@/components/customer/panels";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { LogOut, MapPin, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/customer/account")({
  head: () => ({
    meta: [
      { title: "Mon espace client — Les Délices d'Aden" },
      { name: "description", content: "Votre profil, vos adresses, vos commandes et vos favoris." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CustomerAccountPage,
});

function CustomerAccountPage() {
  const { customer } = useCustomer();
  const navigate = useNavigate();
  useEffect(() => {
    if (!customer) navigate({ to: "/customer/login", replace: true });
  }, [customer, navigate]);
  if (!customer) return null;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Bonjour, {customer.name.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground">{customer.email}</p>
        </div>
        <Button
          variant="outline"
          onClick={async () => { await signOutRemote(); toast.success("Déconnecté"); navigate({ to: "/customer/login" }); }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Se déconnecter
        </Button>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <Link to="/customer/orders" className="rounded-xl border border-border bg-card p-4 hover:border-primary">
          <div className="flex items-center gap-2 font-semibold"><ShoppingBag className="h-4 w-4 text-primary" /> Mes commandes</div>
          <p className="mt-1 text-sm text-muted-foreground">Historique, suivi et recommander en un clic.</p>
        </Link>
        <Link to="/customer/addresses" className="rounded-xl border border-border bg-card p-4 hover:border-primary">
          <div className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4 text-primary" /> Mes adresses</div>
          <p className="mt-1 text-sm text-muted-foreground">Adresses de livraison enregistrées.</p>
        </Link>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 font-display text-lg font-semibold">Mes favoris</h2>
        <FavoritesList />
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Mon profil</h2>
        <ProfileForm />
      </section>
    </div>
  );
}

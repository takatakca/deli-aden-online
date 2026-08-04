import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useCustomer } from "@/lib/customer-auth";
import { SignupForm } from "@/components/customer/panels";

export const Route = createFileRoute("/customer/register")({
  head: () => ({
    meta: [
      { title: "Créer un compte — Les Délices d'Aden" },
      { name: "description", content: "Créez votre compte pour commander plus vite et suivre vos commandes." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CustomerRegisterPage,
});

function CustomerRegisterPage() {
  const { customer } = useCustomer();
  const navigate = useNavigate();
  useEffect(() => {
    if (customer) navigate({ to: "/customer/account", replace: true });
  }, [customer, navigate]);
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-4 font-display text-2xl font-bold">Créer un compte</h1>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <SignupForm onDone={() => navigate({ to: "/customer/account" })} />
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Déjà inscrit ?{" "}
          <Link to="/customer/login" className="text-primary underline">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}

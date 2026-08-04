import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useCustomer } from "@/lib/customer-auth";
import { LoginForm, ForgotForm } from "@/components/customer/panels";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/customer/login")({
  head: () => ({
    meta: [
      { title: "Connexion client — Les Délices d'Aden" },
      { name: "description", content: "Connectez-vous pour retrouver vos commandes, adresses et favoris." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CustomerLoginPage,
});

function CustomerLoginPage() {
  const { customer } = useCustomer();
  const navigate = useNavigate();
  useEffect(() => {
    if (customer) navigate({ to: "/customer/account", replace: true });
  }, [customer, navigate]);
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-4 font-display text-2xl font-bold">Connexion</h1>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <Tabs defaultValue="login">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Connexion</TabsTrigger>
            <TabsTrigger value="forgot">Mot de passe oublié</TabsTrigger>
          </TabsList>
          <TabsContent value="login" className="pt-4">
            <LoginForm onDone={() => navigate({ to: "/customer/account" })} />
          </TabsContent>
          <TabsContent value="forgot" className="pt-4"><ForgotForm /></TabsContent>
        </Tabs>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Pas encore de compte ?{" "}
          <Link to="/customer/register" className="text-primary underline">Créer un compte</Link>
        </p>
      </div>
    </div>
  );
}

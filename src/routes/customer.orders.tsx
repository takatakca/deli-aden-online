import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useCustomer } from "@/lib/customer-auth";
import { OrdersList } from "@/components/customer/panels";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/customer/orders")({
  head: () => ({
    meta: [
      { title: "Mes commandes — Les Délices d'Aden" },
      { name: "description", content: "Historique de vos commandes, suivi en direct et recommande rapide." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CustomerOrdersPage,
});

function CustomerOrdersPage() {
  const { customer } = useCustomer();
  const navigate = useNavigate();
  useEffect(() => {
    if (!customer) navigate({ to: "/customer/login", replace: true });
  }, [customer, navigate]);
  if (!customer) return null;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/customer/account" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Mon compte
      </Link>
      <h1 className="mb-4 font-display text-2xl font-bold">Mes commandes</h1>
      <OrdersList />
    </div>
  );
}

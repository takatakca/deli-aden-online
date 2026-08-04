import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useCustomer, signOutRemote } from "@/lib/customer-auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { LogOut, MapPin, ShoppingBag, Star } from "lucide-react";
import {
  LoginForm, SignupForm, ForgotForm,
  OrdersList, AddressesList, FavoritesList, ProfileForm,
} from "@/components/customer/panels";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Mon compte — Les Délices d'Aden" },
      { name: "description", content: "Gérez votre compte, vos adresses, vos commandes et vos favoris." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { customer } = useCustomer();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {customer ? <ProfileArea /> : <AuthArea />}
    </div>
  );
}

function AuthArea() {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h1 className="mb-4 font-display text-2xl font-bold">Mon compte</h1>
      <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="login">Connexion</TabsTrigger>
          <TabsTrigger value="signup">Créer un compte</TabsTrigger>
          <TabsTrigger value="forgot">Oublié</TabsTrigger>
        </TabsList>
        <TabsContent value="login" className="pt-4"><LoginForm /></TabsContent>
        <TabsContent value="signup" className="pt-4"><SignupForm /></TabsContent>
        <TabsContent value="forgot" className="pt-4"><ForgotForm onDone={() => setMode("login")} /></TabsContent>
      </Tabs>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Vous pouvez aussi commander sans compte —{" "}
        <Link to="/menu" className="text-primary underline">voir le menu</Link>.
      </p>
    </div>
  );
}

function ProfileArea() {
  const { customer } = useCustomer();
  if (!customer) return null;
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Bonjour, {customer.name.split(" ")[0]}</h1>
          <p className="text-sm text-muted-foreground">{customer.email}</p>
        </div>
        <Button variant="outline" onClick={async () => { await signOutRemote(); toast.success("Déconnecté"); }}>
          <LogOut className="mr-2 h-4 w-4" /> Se déconnecter
        </Button>
      </div>
      <Tabs defaultValue="orders">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="orders"><ShoppingBag className="mr-2 h-4 w-4 hidden sm:inline" />Commandes</TabsTrigger>
          <TabsTrigger value="addresses"><MapPin className="mr-2 h-4 w-4 hidden sm:inline" />Adresses</TabsTrigger>
          <TabsTrigger value="favorites"><Star className="mr-2 h-4 w-4 hidden sm:inline" />Favoris</TabsTrigger>
          <TabsTrigger value="profile">Profil</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="pt-4"><OrdersList /></TabsContent>
        <TabsContent value="addresses" className="pt-4"><AddressesList /></TabsContent>
        <TabsContent value="favorites" className="pt-4"><FavoritesList /></TabsContent>
        <TabsContent value="profile" className="pt-4"><ProfileForm /></TabsContent>
      </Tabs>
    </div>
  );
}

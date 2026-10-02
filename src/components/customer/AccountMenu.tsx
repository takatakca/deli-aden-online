import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, LogOut, Mail, MapPin, ReceiptText, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ForgotForm, LoginForm } from "@/components/customer/panels";
import { signOutRemote, useCustomer } from "@/lib/customer-auth";
import { cn } from "@/lib/utils";

type AccountMenuProps = {
  compact?: boolean;
};

export function AccountMenu({ compact = false }: AccountMenuProps) {
  const { customer } = useCustomer();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"choices" | "login" | "forgot">("choices");

  function close() {
    setOpen(false);
    window.setTimeout(() => setMode("choices"), 180);
  }

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) window.setTimeout(() => setMode("choices"), 180); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon" : "sm"}
          className={cn(
            "min-h-11 border border-border/70 bg-card/70 text-foreground hover:border-primary/60 hover:bg-card hover:text-primary",
            compact ? "min-w-11 rounded-full" : "gap-2 rounded-full px-3",
          )}
          aria-label={customer ? `Compte de ${customer.name}` : "Ouvrir la connexion client"}
        >
          <User className="h-4 w-4" />
          {!compact && <span className="hidden sm:inline">{customer ? customer.name.split(" ")[0] : "Compte"}</span>}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={10}
        collisionPadding={12}
        className="w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border-primary/25 bg-popover p-0 shadow-2xl shadow-background/80"
      >
        <div className="border-b border-border px-6 pb-4 pt-6 text-center">
          <p className="font-display text-2xl text-primary">Espace client</p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">Les Délices d’Aden</p>
        </div>

        {customer ? (
          <div className="p-3">
            <div className="px-3 pb-3 pt-1">
              <p className="font-semibold">Bonjour, {customer.name.split(" ")[0]}</p>
              <p className="truncate text-xs text-muted-foreground">{customer.email}</p>
            </div>
            <AccountLink to="/customer/account" icon={User} label="Mon profil" onSelect={close} />
            <AccountLink to="/customer/orders" icon={ReceiptText} label="Mes commandes" onSelect={close} />
            <AccountLink to="/customer/addresses" icon={MapPin} label="Mes adresses" onSelect={close} />
            <div className="my-2 h-px bg-border" />
            <Button
              variant="ghost"
              className="min-h-11 w-full justify-start text-muted-foreground hover:text-foreground"
              onClick={async () => {
                await signOutRemote();
                close();
                toast.success("Déconnecté");
                navigate({ to: "/" });
              }}
            >
              <LogOut className="h-4 w-4" /> Se déconnecter
            </Button>
          </div>
        ) : (
          <div className="p-5">
            {mode === "choices" && (
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="min-h-12 w-full justify-start gap-3 border-border bg-card text-foreground hover:border-primary/60 hover:text-primary"
                  onClick={() => setMode("login")}
                >
                  <Mail className="h-5 w-5 text-primary" />
                  Continuer par courriel
                  <ChevronRight className="ml-auto h-4 w-4" />
                </Button>
                <div className="flex items-center gap-3 py-1" aria-hidden="true">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[10px] uppercase text-muted-foreground">ou</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <Button asChild className="min-h-12 w-full font-semibold">
                  <Link to="/customer/register" onClick={close}>Créer un compte</Link>
                </Button>
                <p className="text-center text-xs leading-relaxed text-muted-foreground">
                  Commandez plus vite et retrouvez facilement vos commandes.
                </p>
              </div>
            )}

            {mode === "login" && (
              <div>
                <button type="button" onClick={() => setMode("choices")} className="mb-4 text-xs text-muted-foreground hover:text-primary">
                  ← Retour
                </button>
                <LoginForm onDone={close} />
                <button type="button" onClick={() => setMode("forgot")} className="mt-4 w-full text-center text-xs text-primary hover:underline">
                  Mot de passe oublié?
                </button>
              </div>
            )}

            {mode === "forgot" && (
              <div>
                <button type="button" onClick={() => setMode("login")} className="mb-4 text-xs text-muted-foreground hover:text-primary">
                  ← Retour à la connexion
                </button>
                <ForgotForm onDone={() => setMode("login")} />
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function AccountLink({
  to,
  icon: Icon,
  label,
  onSelect,
}: {
  to: "/customer/account" | "/customer/orders" | "/customer/addresses";
  icon: typeof User;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Button asChild variant="ghost" className="min-h-11 w-full justify-start">
      <Link to={to} onClick={onSelect}>
        <Icon className="h-4 w-4 text-primary" /> {label}
        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
      </Link>
    </Button>
  );
}
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { seoHead } from "@/seo/head";

export const Route = createFileRoute("/track/")({
  head: () => {
    const seo = seoHead({
      title: "Suivre ma commande — Les Délices d'Aden",
      description:
        "Entrez votre numéro de commande pour suivre en direct la préparation et la livraison de votre repas chez Les Délices d'Aden.",
      path: "/track",
    });
    return {
      meta: [
        ...seo.meta,
        {
          property: "og:description",
          content: "Suivi en direct de votre commande, minute par minute.",
        },
      ],
      links: seo.links,
    };
  },
  component: TrackIndexPage,
});

function TrackIndexPage() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const orderNumber = value.trim().toUpperCase();

  return (
    <div className="mx-auto max-w-md px-4 py-12 pb-28">
      <div className="text-center">
        <MapPin className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-3 font-display text-3xl font-bold">Suivre ma commande</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Le numéro figure sur votre confirmation et dans vos courriels/SMS.
        </p>
      </div>
      <form
        className="mt-8 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!orderNumber) return;
          navigate({ to: "/track/$orderNumber", params: { orderNumber } });
        }}
      >
        <Label htmlFor="orderNumber">Numéro de commande</Label>
        <Input
          id="orderNumber"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ex. DA-10245"
          autoComplete="off"
          inputMode="text"
          className="min-h-12 text-base"
        />
        <Button type="submit" size="lg" className="min-h-12 w-full" disabled={!orderNumber}>
          <Search className="mr-1 h-4 w-4" /> Suivre
        </Button>
      </form>
    </div>
  );
}

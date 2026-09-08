// Single entry point for "add to cart" so the confirmation feels the same everywhere.
import { toast } from "sonner";
import { cartStore, fmt, type CartItem } from "@/lib/cart-store";
import { cartSheet } from "@/lib/ui-store";

type AddOptions = {
  /** Open the cart sheet right after adding (default: true). */
  openSheet?: boolean;
};

/**
 * Adds a line, shows a short confirmation ("Ajouté à votre commande")
 * and opens the cart sheet. Never throws.
 */
export function addToCart(line: Omit<CartItem, "uid">, opts: AddOptions = {}) {
  cartStore.add(line);
  toast.success("Ajouté à votre commande", {
    description: `${line.quantity} × ${line.name} — ${fmt(line.unitPrice * line.quantity)}`,
    duration: 2200,
  });
  if (opts.openSheet !== false) cartSheet.open();
}

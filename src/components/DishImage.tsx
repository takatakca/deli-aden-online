import { useState } from "react";
import placeholder from "@/assets/dish-placeholder.jpg";

/**
 * Menu/dish image with guaranteed coverage:
 * - branded Deli Aden placeholder when the URL is missing or fails to load
 * - explicit aspect ratio (no layout shift), object-cover, async decoding
 * - lazy by default; pass `eager` for above-the-fold hero products
 */
export function DishImage({
  src,
  name,
  className = "",
  eager = false,
  ratio = "aspect-[4/3]",
}: {
  src?: string | null;
  name: string;
  className?: string;
  eager?: boolean;
  ratio?: string;
}) {
  const [failed, setFailed] = useState(false);
  const resolved = !src || failed ? placeholder : src;
  return (
    <div className={`${ratio} overflow-hidden bg-muted`}>
      <img
        src={resolved}
        alt={`${name} — plat des Délices d'Aden`}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "auto"}
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover ${className}`}
      />
    </div>
  );
}

export const DISH_PLACEHOLDER = placeholder;

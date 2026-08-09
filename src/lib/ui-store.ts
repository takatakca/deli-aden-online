// Tiny global UI store for the mobile cart bottom sheet.
// Kept outside React so any component (header, sticky CTA, menu card) can open it.
import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const cartSheet = {
  open: () => {
    open = true;
    emit();
  },
  close: () => {
    open = false;
    emit();
  },
  toggle: () => {
    open = !open;
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get isOpen() {
    return open;
  },
};

export function useCartSheetOpen(): boolean {
  return useSyncExternalStore(
    cartSheet.subscribe,
    () => open,
    () => false,
  );
}

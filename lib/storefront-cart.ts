export type CartItem = { id: string; digital: boolean; quantity: number };
export const CART_KEY = "meshharbor-cart";
export const CART_EVENT = "meshharbor-cart-change";

export function parseCart(raw: string | null): CartItem[] {
  try {
    const value: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is CartItem => item !== null && typeof item === "object" &&
      typeof item.id === "string" && typeof item.digital === "boolean" &&
      Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 20).slice(0, 20);
  } catch { return []; }
}

export function readCart(): CartItem[] {
  try { return parseCart(window.localStorage.getItem(CART_KEY)); } catch { return []; }
}

export function writeCart(items: CartItem[]): boolean {
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(CART_EVENT));
    return true;
  } catch { return false; }
}

export function subscribeCart(listener: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === CART_KEY || event.key === null) listener(); };
  window.addEventListener(CART_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CART_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

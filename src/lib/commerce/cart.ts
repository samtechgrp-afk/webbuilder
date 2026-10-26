/**
 * The visitor's cart. Lives in the browser (localStorage, one cart per site)
 * and is only a wish list: the checkout API re-reads every product and price
 * from the database, so nothing a visitor edits here can change what they pay.
 */
export interface CartLine {
  productId: string;
  variantId: string | null;
  title: string;
  variantTitle: string | null;
  /** Unit price in minor units, for display only. */
  price: number;
  image: string | null;
  quantity: number;
  /** Stock left when added (null = not tracked), to cap the quantity control. */
  max: number | null;
  /** Product page, site-relative. */
  href: string;
}

export interface Cart {
  currency: string;
  lines: CartLine[];
}

export const MAX_QUANTITY = 99;
export const MAX_LINES = 50;

export const lineKey = (l: Pick<CartLine, "productId" | "variantId">) => `${l.productId}:${l.variantId ?? ""}`;

const clampQty = (q: number, max: number | null) => Math.max(0, Math.min(Math.floor(q) || 0, MAX_QUANTITY, max ?? MAX_QUANTITY));

export const emptyCart = (currency: string): Cart => ({ currency, lines: [] });

/** Adds a line or tops up the matching one. A cart in another currency is replaced (prices would be meaningless). */
export function addLine(cart: Cart, line: CartLine, currency: string): Cart {
  const base = cart.currency === currency ? cart : emptyCart(currency);
  const key = lineKey(line);
  const existing = base.lines.find((l) => lineKey(l) === key);
  if (existing) {
    return { ...base, lines: base.lines.map((l) => (l === existing ? { ...line, quantity: clampQty(l.quantity + line.quantity, line.max) } : l)).filter((l) => l.quantity > 0) };
  }
  if (base.lines.length >= MAX_LINES) return base;
  const quantity = clampQty(line.quantity, line.max);
  return quantity ? { ...base, lines: [...base.lines, { ...line, quantity }] } : base;
}

export function setQuantity(cart: Cart, key: string, quantity: number): Cart {
  return { ...cart, lines: cart.lines.map((l) => (lineKey(l) === key ? { ...l, quantity: clampQty(quantity, l.max) } : l)).filter((l) => l.quantity > 0) };
}

export const removeLine = (cart: Cart, key: string): Cart => ({ ...cart, lines: cart.lines.filter((l) => lineKey(l) !== key) });

export const cartCount = (cart: Cart) => cart.lines.reduce((n, l) => n + l.quantity, 0);

export const cartSubtotal = (cart: Cart) => cart.lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

/** Whatever localStorage held, as a valid cart (or an empty one). */
export function readCart(raw: unknown, currency: string): Cart {
  if (!raw || typeof raw !== "object") return emptyCart(currency);
  const c = raw as Partial<Cart>;
  if (c.currency !== currency || !Array.isArray(c.lines)) return emptyCart(currency);
  const lines = c.lines
    .filter((l): l is CartLine => !!l && typeof l.productId === "string" && typeof l.title === "string" && Number.isInteger(l.price) && l.price >= 0 && Number.isInteger(l.quantity))
    .map((l) => ({ ...l, variantId: typeof l.variantId === "string" ? l.variantId : null, quantity: clampQty(l.quantity, typeof l.max === "number" ? l.max : null) }))
    .filter((l) => l.quantity > 0)
    .slice(0, MAX_LINES);
  return { currency, lines };
}

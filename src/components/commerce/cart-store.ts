"use client";

import { useCallback, useSyncExternalStore } from "react";
import { addLine, emptyCart, readCart, removeLine, setQuantity, type Cart, type CartLine } from "@/lib/commerce/cart";

/**
 * One cart per site, shared by every commerce widget on the page and kept in
 * localStorage so it survives reloads and follows the visitor across pages
 * and tabs. Storage can be unavailable (private mode, blocked cookies): the
 * cart then simply lives for the page view.
 */
type Listener = () => void;

interface Entry {
  cart: Cart;
  open: boolean;
  notice: { tone: "success" | "info" | "error"; text: string } | null;
  listeners: Set<Listener>;
}

const entries = new Map<string, Entry>();
const storageKey = (siteKey: string) => `wb_cart_${siteKey}`;

function load(siteKey: string, currency: string): Cart {
  try {
    const raw = window.localStorage.getItem(storageKey(siteKey));
    return readCart(raw ? JSON.parse(raw) : null, currency);
  } catch {
    return emptyCart(currency);
  }
}

function entry(siteKey: string, currency: string): Entry {
  let e = entries.get(siteKey);
  if (!e) {
    e = { cart: load(siteKey, currency), open: false, notice: null, listeners: new Set() };
    entries.set(siteKey, e);
    const self = e;
    window.addEventListener("storage", (ev) => {
      if (ev.key !== storageKey(siteKey)) return;
      self.cart = load(siteKey, currency);
      self.listeners.forEach((l) => l());
    });
  }
  return e;
}

function update(siteKey: string, currency: string, patch: Partial<Omit<Entry, "listeners">>) {
  const e = entry(siteKey, currency);
  Object.assign(e, patch);
  if (patch.cart) {
    try {
      window.localStorage.setItem(storageKey(siteKey), JSON.stringify(patch.cart));
    } catch {
      // Storage full or blocked: keep the in-memory cart.
    }
  }
  e.listeners.forEach((l) => l());
}

const serverSnapshots = new Map<string, Entry>();
function serverEntry(currency: string) {
  let e = serverSnapshots.get(currency);
  if (!e) serverSnapshots.set(currency, (e = { cart: emptyCart(currency), open: false, notice: null, listeners: new Set() }));
  return e;
}

export function useCart(siteKey: string, currency: string) {
  const subscribe = useCallback(
    (l: Listener) => {
      const e = entry(siteKey, currency);
      e.listeners.add(l);
      return () => e.listeners.delete(l);
    },
    [siteKey, currency],
  );
  // Snapshots are replaced on every change, so `state` is a new object only when something changed.
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot(siteKey, currency),
    () => serverEntry(currency),
  );
  const cart = state.cart.currency === currency ? state.cart : emptyCart(currency);
  return {
    cart,
    open: state.open,
    notice: state.notice,
    add: (line: CartLine) => update(siteKey, currency, { cart: addLine(entry(siteKey, currency).cart, line, currency), open: true, notice: null }),
    setQuantity: (key: string, q: number) => update(siteKey, currency, { cart: setQuantity(entry(siteKey, currency).cart, key, q) }),
    remove: (key: string) => update(siteKey, currency, { cart: removeLine(entry(siteKey, currency).cart, key) }),
    replace: (next: Cart) => update(siteKey, currency, { cart: next }),
    clear: () => update(siteKey, currency, { cart: emptyCart(currency) }),
    setOpen: (open: boolean) => update(siteKey, currency, { open, ...(open ? {} : { notice: null }) }),
    setNotice: (notice: Entry["notice"]) => update(siteKey, currency, { notice }),
  };
}

// useSyncExternalStore needs a stable snapshot between changes: cache one per version.
const snapshots = new Map<string, { cart: Cart; open: boolean; notice: Entry["notice"]; listeners: Set<Listener> }>();
function snapshot(siteKey: string, currency: string) {
  const e = entry(siteKey, currency);
  const prev = snapshots.get(siteKey);
  if (prev && prev.cart === e.cart && prev.open === e.open && prev.notice === e.notice) return prev;
  const next = { cart: e.cart, open: e.open, notice: e.notice, listeners: e.listeners };
  snapshots.set(siteKey, next);
  return next;
}

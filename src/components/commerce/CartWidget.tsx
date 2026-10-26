"use client";

import { useEffect, useRef, useState } from "react";
import { cartCount, cartSubtotal, lineKey } from "@/lib/commerce/cart";
import { formatMoney } from "@/lib/commerce/money";
import type { CartProps, CommerceData } from "@/lib/commerce/types";
import { useCart } from "./cart-store";

type Shop = Pick<CommerceData, "siteKey" | "currency" | "checkout" | "linkBase">;

/** Cart button plus the slide-out drawer it opens. */
export function CartWidget({ props, shop, lang, editor, ...rest }: { props: CartProps; shop?: Shop; lang?: string; editor?: boolean } & Record<string, unknown>) {
  if (!shop) return editor ? <div {...rest} data-empty="" aria-label="Cart (add products to show it)" /> : null;
  return <Cart props={props} shop={shop} lang={lang} editor={editor} rest={rest} />;
}

interface Problem {
  productId: string;
  variantId: string | null;
  available: number;
}

function Cart({ props, shop, lang, editor, rest }: { props: CartProps; shop: Shop; lang?: string; editor?: boolean; rest: Record<string, unknown> }) {
  const { cart, open, notice, setOpen, setQuantity, remove, replace, clear, setNotice } = useCart(shop.siteKey, shop.currency);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const money = (n: number) => formatMoney(n, shop.currency, lang);
  // Hydrates with an empty cart (the server can't see localStorage), then shows the stored one.
  const count = cartCount(cart);

  // Coming back from Stripe.
  useEffect(() => {
    if (editor) return;
    const url = new URL(window.location.href);
    const status = url.searchParams.get("checkout");
    if (!status) return;
    if (status === "success") {
      clear();
      const order = url.searchParams.get("order");
      setNotice({ tone: "success", text: `Thank you! Your order${order && /^\d+$/.test(order) ? ` #${order}` : ""} is confirmed. A receipt is on its way.` });
    } else if (status === "cancelled") {
      setNotice({ tone: "info", text: "Checkout cancelled. Your cart is saved." });
    }
    setOpen(true);
    for (const k of ["checkout", "order", "session_id"]) url.searchParams.delete(k);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, setOpen]);

  async function checkout() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/sites/${encodeURIComponent(shop.siteKey)}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
          path: window.location.pathname,
          locale: lang,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string; problems?: Problem[] };
      if (res.ok && json.url) {
        window.location.assign(json.url);
        return;
      }
      if (json.problems?.length) {
        // Bring the cart in line with what's actually left.
        let next = cart;
        for (const p of json.problems) {
          const key = lineKey(p);
          next = { ...next, lines: next.lines.flatMap((l) => (lineKey(l) !== key ? [l] : p.available > 0 ? [{ ...l, quantity: Math.min(l.quantity, p.available), max: p.available }] : [])) };
        }
        replace(next);
      }
      setNotice({ tone: "error", text: json.error ?? "Checkout couldn't start. Please try again." });
    } catch {
      setNotice({ tone: "error", text: "Checkout couldn't start. Check your connection and try again." });
    }
    setBusy(false);
  }

  return (
    <div {...rest}>
      <button
        ref={toggleRef}
        type="button"
        data-cart-toggle=""
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => !editor && setOpen(true)}
      >
        <span>{props.label || "Cart"}</span>
        <span data-cart-count="" aria-label={`${count} item${count === 1 ? "" : "s"}`}>
          {count}
        </span>
      </button>
      {open && !editor && (
        <div data-cart-layer="">
          <div data-cart-backdrop="" onClick={() => setOpen(false)} />
          <aside role="dialog" aria-modal="true" aria-label="Your cart" data-cart-drawer="">
            <header>
              <h2>Your cart</h2>
              <button
                ref={closeRef}
                type="button"
                aria-label="Close cart"
                data-cart-close=""
                onClick={() => {
                  setOpen(false);
                  toggleRef.current?.focus();
                }}
              >
                ×
              </button>
            </header>
            {notice && (
              <p role="status" data-cart-notice={notice.tone}>
                {notice.text}
              </p>
            )}
            {cart.lines.length === 0 ? (
              <p data-cart-empty="">Your cart is empty.</p>
            ) : (
              <ul data-cart-lines="">
                {cart.lines.map((l) => {
                  const key = lineKey(l);
                  return (
                    <li key={key} data-cart-line={key}>
                      {l.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={l.image} alt="" width={64} height={64} />
                      ) : (
                        <span data-no-image="" />
                      )}
                      <div>
                        <a href={`${shop.linkBase}${l.href}`}>{l.title}</a>
                        {l.variantTitle && <small>{l.variantTitle}</small>}
                        <span data-line-price="">{money(l.price)}</span>
                      </div>
                      <div data-qty="">
                        <button type="button" aria-label={`One fewer ${l.title}`} data-qty-dec="" onClick={() => setQuantity(key, l.quantity - 1)}>
                          −
                        </button>
                        <input
                          type="number"
                          aria-label={`Quantity of ${l.title}${l.variantTitle ? ` (${l.variantTitle})` : ""}`}
                          min={0}
                          max={l.max ?? 99}
                          value={l.quantity}
                          onChange={(e) => setQuantity(key, Number(e.target.value))}
                        />
                        <button type="button" aria-label={`One more ${l.title}`} data-qty-inc="" disabled={l.max !== null && l.quantity >= l.max} onClick={() => setQuantity(key, l.quantity + 1)}>
                          +
                        </button>
                      </div>
                      <button type="button" data-line-remove="" aria-label={`Remove ${l.title}`} onClick={() => remove(key)}>
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <footer>
              <p>
                <span>Subtotal</span>
                <strong data-cart-subtotal="">{money(cartSubtotal(cart))}</strong>
              </p>
              <small>Shipping and taxes are calculated at checkout.</small>
              <button type="button" data-checkout="" disabled={!cart.lines.length || busy || !shop.checkout} onClick={checkout}>
                {busy ? "Starting checkout…" : "Proceed to checkout"}
              </button>
              {!shop.checkout && <small data-checkout-off="">Checkout isn&apos;t open yet.</small>}
            </footer>
          </aside>
        </div>
      )}
    </div>
  );
}

import { formatMoney } from "@/lib/commerce/money";
import { addressHtml, addressLines, badge, button, esc, h1, itemsTable, layout, p, type Brand, type PostalAddress, type RenderedEmail } from "../layout";

/** What both order emails need, read once from the paid order. */
export interface OrderEmailData {
  brand: Brand;
  number: number;
  currency: string;
  /** Checkout language, e.g. "fr"; "" for the site default. */
  locale: string;
  customerName: string | null;
  customerEmail: string | null;
  items: { title: string; variantTitle: string | null; sku: string | null; quantity: number; price: number; digital: boolean }[];
  taxAmount: number;
  shippingAmount: number;
  totalAmount: number;
  shippingAddr: PostalAddress | null;
  paidAt: Date;
}

const money = (o: OrderEmailData) => (n: number) => formatMoney(n, o.currency, o.locale || "en-US");
const subtotalOf = (o: OrderEmailData) => o.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

function summary(o: OrderEmailData): [string, string][] {
  const m = money(o);
  return [
    ["Subtotal", m(subtotalOf(o))],
    ...(o.shippingAmount ? [["Shipping", m(o.shippingAmount)] as [string, string]] : []),
    ...(o.taxAmount ? [["Tax", m(o.taxAmount)] as [string, string]] : []),
    ["Total", m(o.totalAmount)],
  ];
}

const textLines = (o: OrderEmailData, withSku = false) => {
  const m = money(o);
  return [
    ...o.items.map((i) => `- ${i.title}${i.variantTitle ? ` (${i.variantTitle})` : ""}${withSku && i.sku ? ` [${i.sku}]` : ""} × ${i.quantity}: ${m(i.price * i.quantity)}`),
    "",
    ...summary(o).map(([label, amount]) => `${label}: ${amount}`),
  ];
};

/** Sent to the customer when Stripe confirms payment. */
export function orderReceiptEmail(o: OrderEmailData, statusUrl: string): RenderedEmail {
  const m = money(o);
  const addr = addressLines(o.shippingAddr);
  const physical = o.items.some((i) => !i.digital);
  const greeting = o.customerName ? `Thanks, ${o.customerName.split(" ")[0]}!` : "Thanks for your order!";
  const body = [
    h1(greeting),
    p(`We've received your payment for order <strong>#${esc(o.number)}</strong>. ${physical ? "We'll email you again when it ships." : "Everything in it is ready for you."}`),
    itemsTable(
      o.items.map((i) => ({ title: i.title, detail: i.variantTitle, quantity: i.quantity, amount: m(i.price * i.quantity) })),
      summary(o),
    ),
    addr.length ? `<p style="margin:0 0 6px;font-weight:600;color:#18181b">Shipping to</p>${p(addressHtml(addr))}` : "",
    button("View your order", statusUrl, o.brand),
  ].join("");
  return {
    subject: `Your ${o.brand.name} order #${o.number}`,
    html: layout({ brand: o.brand, preheader: `Order #${o.number} · ${m(o.totalAmount)} paid`, body, footer: `You're receiving this because you placed an order with ${esc(o.brand.name)}. Keep it for your records.` }),
    text: [greeting, "", `Order #${o.number} is paid.`, "", ...textLines(o), ...(addr.length ? ["", "Shipping to:", ...addr] : []), "", `View your order: ${statusUrl}`].join("\n"),
  };
}

/** Sent to everyone who manages the shop. */
export function storeAlertEmail(o: OrderEmailData, adminUrl: string): RenderedEmail {
  const m = money(o);
  const addr = addressLines(o.shippingAddr);
  const physical = o.items.some((i) => !i.digital);
  const units = o.items.reduce((n, i) => n + i.quantity, 0);
  const tag = physical ? badge("Ship within 2 business days", "urgent") : badge("Digital: nothing to ship", "calm");
  const customer = [o.customerName, o.customerEmail].filter(Boolean).map(esc).join(" · ") || "Guest";
  const body = [
    `<p style="margin:0 0 12px">${tag}</p>`,
    h1(`New order #${o.number}: ${m(o.totalAmount)}`),
    p(`${esc(units)} item${units === 1 ? "" : "s"} from <strong>${customer}</strong>, paid ${esc(o.paidAt.toUTCString())}.`),
    itemsTable(
      o.items.map((i) => ({ title: i.title, detail: [i.variantTitle, i.sku ? `SKU ${i.sku}` : null].filter(Boolean).join(" · "), quantity: i.quantity, amount: m(i.price * i.quantity) })),
      summary(o),
    ),
    physical ? `<p style="margin:0 0 6px;font-weight:600;color:#18181b">Ship to</p>${p(addr.length ? addressHtml(addr) : "No address was collected; check the order in Stripe.")}` : "",
    button("Open the order", adminUrl, o.brand),
  ].join("");
  return {
    subject: `${physical ? "[Ship] " : ""}New order #${o.number} · ${m(o.totalAmount)}`,
    html: layout({ brand: o.brand, preheader: `${customer.replace(/&[^;]+;/g, "")} paid ${m(o.totalAmount)}`, body, footer: `Sent to the people who manage the ${esc(o.brand.name)} shop.` }),
    text: [`New order #${o.number}: ${m(o.totalAmount)}`, physical ? "Ship within 2 business days." : "Digital order: nothing to ship.", `Customer: ${[o.customerName, o.customerEmail].filter(Boolean).join(" · ") || "Guest"}`, "", ...textLines(o, true), ...(physical ? ["", "Ship to:", ...(addr.length ? addr : ["(no address collected)"])] : []), "", `Open the order: ${adminUrl}`].join("\n"),
  };
}

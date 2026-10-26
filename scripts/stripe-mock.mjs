// A tiny stand-in for the two Stripe surfaces the shop touches, for e2e runs
// without real Stripe keys (start the app with STRIPE_API_BASE pointing here):
//   POST /v1/checkout/sessions   creates a session (form-encoded, like Stripe)
//   GET  /pay/<id>               a fake hosted checkout page
//   POST /pay/<id>               "pays": sends a signed checkout.session.completed
//                                webhook to the app, then redirects to success_url
// Signatures use Stripe's real scheme (HMAC-SHA256 over "<t>.<body>").
import { createHmac } from "node:crypto";
import http from "node:http";

export function sign(payload, secret, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
}

/** Stripe's bracket form encoding back into an object (enough for checkout sessions). */
function formDecode(body) {
  const out = {};
  for (const [key, value] of new URLSearchParams(body)) {
    const parts = key.replace(/\]/g, "").split("[");
    let cur = out;
    parts.forEach((p, i) => {
      const last = i === parts.length - 1;
      const nextIsIndex = /^\d+$/.test(parts[i + 1] ?? "");
      if (last) cur[p] = value;
      else cur = cur[p] ??= nextIsIndex ? [] : {};
    });
  }
  return out;
}

export function startStripeMock({ port = 4242, appBase, webhookSecret }) {
  const sessions = new Map();
  const requests = [];
  const webhooks = [];
  let n = 0;

  async function sendEvent(type, session, extra = {}) {
    const event = { id: `evt_mock_${++n}`, object: "event", type, data: { object: { ...session.object, ...extra } } };
    const payload = JSON.stringify(event);
    const res = await fetch(`${appBase}/api/webhooks/stripe`, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": sign(payload, webhookSecret) }, body: payload });
    const result = { type, payload, status: res.status, body: await res.json().catch(() => null) };
    webhooks.push(result);
    return result;
  }

  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    if (req.method === "POST" && url.pathname === "/v1/checkout/sessions") {
      const params = formDecode(body);
      const idem = req.headers["idempotency-key"];
      requests.push({ auth: req.headers.authorization, idempotencyKey: idem, params });
      if (!/^Bearer sk_test_/.test(req.headers.authorization ?? "")) {
        res.writeHead(401, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "Invalid API Key provided" } }));
      }
      const existing = [...sessions.values()].find((s) => s.idem === idem);
      const id = existing?.object.id ?? `cs_test_mock_${++n}`;
      const amount = (params.line_items ?? []).reduce((sum, l) => sum + Number(l.price_data.unit_amount) * Number(l.quantity), 0);
      const object = {
        id,
        object: "checkout.session",
        mode: "payment",
        client_reference_id: params.client_reference_id,
        metadata: params.metadata ?? {},
        amount_total: amount,
        currency: params.line_items?.[0]?.price_data?.currency,
        payment_status: "unpaid",
        success_url: params.success_url,
        cancel_url: params.cancel_url,
        url: `http://127.0.0.1:${port}/pay/${id}`,
      };
      sessions.set(id, { idem, object, params });
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify(object));
    }

    const pay = /^\/pay\/(cs_test_mock_\d+)$/.exec(url.pathname);
    const session = pay && sessions.get(pay[1]);
    if (session && req.method === "GET") {
      const items = session.params.line_items.map((l) => `<li data-mock-line>${l.price_data.product_data.name} × ${l.quantity}</li>`).join("");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(`<!doctype html><title>Mock Stripe Checkout</title><h1>Mock Stripe Checkout</h1><ul>${items}</ul><p data-mock-total>${session.object.amount_total} ${session.object.currency}</p><form method="post"><button data-mock-pay>Pay</button></form><a data-mock-cancel href="${session.object.cancel_url}">Back</a>`);
    }
    if (session && req.method === "POST") {
      const result = await sendEvent("checkout.session.completed", session, {
        payment_status: "paid",
        payment_intent: `pi_mock_${session.object.id.split("_").pop()}`,
        customer_details: { email: "ada@example.com", name: "Ada Lovelace" },
        collected_information: { shipping_details: { name: "Ada Lovelace", address: { line1: "12 Garden Row", line2: null, postal_code: "02108", city: "Boston", state: "MA", country: "US" } } },
      });
      if (result.status !== 200) {
        res.writeHead(500, { "content-type": "text/plain" });
        return res.end(`Webhook failed: ${result.status} ${JSON.stringify(result.body)}`);
      }
      res.writeHead(303, { location: session.object.success_url });
      return res.end();
    }
    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve) =>
    server.listen(port, "127.0.0.1", () =>
      resolve({
        sessions,
        requests,
        webhooks,
        sendEvent,
        close: () => new Promise((r) => server.close(r)),
      }),
    ),
  );
}

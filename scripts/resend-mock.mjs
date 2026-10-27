// A stand-in for the two Resend endpoints the app calls, for e2e runs without
// a real key (start the app with RESEND_API_BASE pointing here):
//   POST /emails    records the message and answers like Resend ({ id })
//   GET  /domains   lists one verified domain (the health page's key check)
// Like Resend, it refuses a missing or malformed key and answers a repeated
// Idempotency-Key with the original id instead of sending twice.
import http from "node:http";

export function startResendMock({ port = 4243, apiKey = "re_e2e_test_key", domain = "localhost" } = {}) {
  const emails = [];
  const requests = [];
  const byKey = new Map();
  let n = 0;

  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const json = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    requests.push({ method: req.method, path: req.url, auth: req.headers.authorization, idempotencyKey: req.headers["idempotency-key"] });
    if (req.headers.authorization !== `Bearer ${apiKey}`) return json(401, { statusCode: 401, name: "validation_error", message: "API key is invalid" });

    if (req.method === "GET" && req.url === "/domains") return json(200, { data: [{ id: "d_mock", name: domain, status: "verified" }] });
    if (req.method === "POST" && req.url === "/emails") {
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return json(400, { statusCode: 400, name: "validation_error", message: "Invalid JSON" });
      }
      const missing = ["from", "to", "subject"].filter((k) => !body[k]);
      if (missing.length || (!body.html && !body.text)) return json(422, { statusCode: 422, name: "missing_required_field", message: `Missing ${missing.join(", ") || "html or text"}` });
      const key = req.headers["idempotency-key"];
      if (key && byKey.has(key)) return json(200, { id: byKey.get(key) });
      const id = `em_mock_${++n}`;
      if (key) byKey.set(key, id);
      emails.push({ id, idempotencyKey: key ?? null, ...body, to: Array.isArray(body.to) ? body.to : [body.to] });
      return json(200, { id });
    }
    json(404, { statusCode: 404, name: "not_found", message: "Not found" });
  });

  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ emails, requests, url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) })));
}

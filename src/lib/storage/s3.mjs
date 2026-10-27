// @ts-check
import { createHash, createHmac } from "node:crypto";

/**
 * A minimal S3 client: path-style requests signed with AWS Signature V4 over
 * fetch. Enough for media (put, get, delete, head) and creating the bucket,
 * and it talks to AWS S3, Cloudflare R2, SeaweedFS, Garage or MinIO alike.
 * Plain JavaScript so the Docker init step can use it without a TypeScript
 * toolchain.
 */

/**
 * @typedef {{ endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string }} S3Config
 * @typedef {{ method?: string; key?: string; body?: Uint8Array; contentType?: string; headers?: Record<string, string>; now?: Date }} S3Request
 */

/** @param {string | Uint8Array} data */
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
/** @param {string | Buffer} key @param {string} data */
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

/** RFC 3986 encoding, as SigV4 wants it; "/" stays literal in object keys. @param {string} s */
const encode = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** @param {string} key */
export function objectPath(key) {
  return key.split("/").map(encode).join("/");
}

/**
 * Builds the signed request. Exported for tests.
 * @param {S3Config} cfg
 * @param {S3Request} req
 */
export function signRequest(cfg, req) {
  const method = req.method ?? "GET";
  const base = new URL(cfg.endpoint);
  const prefix = base.pathname.replace(/\/+$/, "");
  const pathname = `${prefix}/${encode(cfg.bucket)}${req.key ? `/${objectPath(req.key)}` : ""}`;
  const url = `${base.origin}${pathname}`;
  const now = req.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amzDate.slice(0, 8);
  const payloadHash = sha256(req.body ?? "");

  /** @type {Record<string, string>} */
  const headers = { host: base.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate };
  if (req.contentType) headers["content-type"] = req.contentType;
  for (const [k, v] of Object.entries(req.headers ?? {})) headers[k.toLowerCase()] = v;

  const names = Object.keys(headers).sort();
  const canonicalHeaders = names.map((n) => `${n}:${String(headers[n]).trim().replace(/\s+/g, " ")}\n`).join("");
  const signedHeaders = names.join(";");
  const canonical = [method, pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${day}/${cfg.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonical)].join("\n");
  const kDate = hmac(`AWS4${cfg.secretAccessKey}`, day);
  const kSigning = hmac(hmac(hmac(kDate, cfg.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");

  // fetch sets Host itself.
  const sent = Object.fromEntries(Object.entries(headers).filter(([k]) => k !== "host"));
  sent.authorization = `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { url, method, headers: sent };
}

/**
 * @param {S3Config} cfg
 * @param {S3Request} req
 */
export async function s3Fetch(cfg, req) {
  const signed = signRequest(cfg, req);
  return fetch(signed.url, {
    method: signed.method,
    headers: signed.headers,
    body: req.body ? Buffer.from(req.body) : undefined,
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
}

/** @param {Response} res @param {string} what */
async function failure(res, what) {
  const text = await res.text().catch(() => "");
  const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
  return new Error(`S3 ${what} failed: ${res.status}${code ? ` ${code}` : ""}`);
}

/** @param {S3Config} cfg @param {string} key @param {Uint8Array} body @param {string} contentType */
export async function putObject(cfg, key, body, contentType) {
  const res = await s3Fetch(cfg, { method: "PUT", key, body, contentType });
  if (!res.ok) throw await failure(res, `upload of ${key}`);
}

/**
 * @param {S3Config} cfg @param {string} key
 * @returns {Promise<{ body: Uint8Array; contentType: string | null } | null>} null when the object doesn't exist
 */
export async function getObject(cfg, key) {
  const res = await s3Fetch(cfg, { key });
  if (res.status === 404) return null;
  if (!res.ok) throw await failure(res, `read of ${key}`);
  return { body: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type") };
}

/** @param {S3Config} cfg @param {string} key */
export async function deleteObject(cfg, key) {
  const res = await s3Fetch(cfg, { method: "DELETE", key });
  if (!res.ok && res.status !== 404) throw await failure(res, `delete of ${key}`);
}

/** Creates the bucket unless it's already there. @param {S3Config} cfg */
export async function ensureBucket(cfg) {
  const head = await s3Fetch(cfg, { method: "HEAD" });
  if (head.ok) return false;
  const res = await s3Fetch(cfg, { method: "PUT" });
  if (!res.ok && res.status !== 409) throw await failure(res, `creating bucket ${cfg.bucket}`);
  return true;
}

/**
 * The S3 settings from the environment, or null when uploads stay on local disk.
 * @param {Record<string, string | undefined>} env
 * @returns {S3Config | null}
 */
export function s3ConfigFrom(env) {
  if (env.STORAGE_DRIVER !== "s3") return null;
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) throw new Error("STORAGE_DRIVER=s3 needs S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
  return { endpoint: S3_ENDPOINT, region: env.S3_REGION || "us-east-1", bucket: S3_BUCKET, accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY };
}

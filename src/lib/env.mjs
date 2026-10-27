// @ts-check
import { z } from "zod";

/**
 * Runtime configuration, validated once with zod.
 *
 * `instrumentation.ts` (server boot) and `next.config.ts` (dev and build) call
 * `assertEnv()`, so a bad configuration stops the app before it serves a
 * request, with one readable list of what to fix. Code reads `getEnv().X`
 * instead of `process.env.X`. Secret values are never echoed in messages.
 *
 * Set SKIP_ENV_VALIDATION=1 for a build without runtime secrets (the Docker
 * build stage); the server still validates when it starts.
 */

const HOST_RE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{1,5})?$/i;

/** @param {unknown} v */
const blank = (v) => (typeof v === "string" && v.trim() === "" ? undefined : v);
/**
 * @template {z.ZodType} T
 * @param {T} schema
 */
const opt = (schema) => z.preprocess(blank, schema.optional());
/**
 * @param {string[]} protocols
 * @param {string} hint
 */
const url = (protocols, hint) =>
  z.string().refine((v) => {
    try {
      return protocols.includes(new URL(v).protocol);
    } catch {
      return false;
    }
  }, hint);

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: z.preprocess(blank, url(["postgres:", "postgresql:"], "must be a postgres:// or postgresql:// connection string")),
    SESSION_SECRET: z.preprocess(blank, z.string().min(32, "must be at least 32 characters (generate one with: openssl rand -base64 32)")),
    ROOT_DOMAIN: z.preprocess(blank, z.string().regex(HOST_RE, "must be a bare host name such as builder.example.com or localhost:3000 (no https://)").transform((h) => h.toLowerCase())),
    RESEND_API_KEY: opt(z.string().startsWith("re_", "must start with re_ (copy it from resend.com/api-keys)")),
    RESEND_API_BASE: opt(url(["https:", "http:"], "must be a URL")),
    EMAIL_FROM: opt(z.string().regex(/^(.+<[^@\s]+@[^@\s]+>|[^@\s]+@[^@\s]+)$/, "must be an address or Name <address>")),
    STRIPE_SECRET_KEY: opt(z.string().regex(/^(sk|rk)_(test|live)_/, "must start with sk_test_, sk_live_, rk_test_ or rk_live_")),
    STRIPE_API_BASE: opt(url(["https:", "http:"], "must be a URL")),
    SECRETS_KEY: opt(z.string().min(32, "must be at least 32 characters")),
    CRON_SECRET: opt(z.string().min(16, "must be at least 16 characters")),
    STORAGE_DRIVER: z.preprocess(blank, z.enum(["local", "s3"]).default("local")),
    S3_ENDPOINT: opt(url(["https:", "http:"], "must be a URL such as http://minio:9000")),
    S3_REGION: z.preprocess(blank, z.string().default("us-east-1")),
    S3_BUCKET: opt(z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, "must be a valid bucket name")),
    S3_ACCESS_KEY_ID: opt(z.string().min(1)),
    S3_SECRET_ACCESS_KEY: opt(z.string().min(1)),
    S3_PUBLIC_URL: opt(url(["https:", "http:"], "must be the public URL of the bucket or CDN (optional; without it the app streams files itself)")),
    SIGNUPS: z.preprocess(blank, z.enum(["open", "closed"]).default("open")),
    INTERNAL_URL: opt(url(["https:", "http:"], "must be a URL")),
    VERCEL_URL: opt(z.string()),
    PORT: z.preprocess(blank, z.coerce.number().int().min(1).max(65535).default(3000)),
  });

const S3_REQUIRED = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];

/** @typedef {z.infer<typeof schema>} Env */

const SECRET_KEYS = new Set(["DATABASE_URL", "SESSION_SECRET", "RESEND_API_KEY", "STRIPE_SECRET_KEY", "SECRETS_KEY", "CRON_SECRET", "S3_SECRET_ACCESS_KEY"]);

export class EnvError extends Error {
  /** @param {string[]} problems */
  constructor(problems) {
    super(["Configuration error:", ...problems.map((p) => `  • ${p}`), "Copy .env.example to .env (or set these in your host's environment settings) and restart."].join("\n"));
    this.name = "EnvError";
    this.problems = problems;
  }
}

/**
 * Validates a set of variables. Never throws.
 * @param {Record<string, string | undefined>} source
 * @returns {{ env: Env | null, problems: string[], warnings: string[] }}
 */
export function checkEnv(source = process.env) {
  /** @type {Record<string, unknown>} */
  const input = { ...source, ROOT_DOMAIN: blank(source.ROOT_DOMAIN) ?? blank(source.NEXT_PUBLIC_PLATFORM_DOMAIN) };
  const result = schema.safeParse(input);
  // Checked outside zod so they're reported together with every other problem, not only once the rest is valid.
  const s3Problems = blank(input.STORAGE_DRIVER) === "s3" ? S3_REQUIRED.filter((k) => blank(input[k]) === undefined).map((k) => `${k} is required when STORAGE_DRIVER=s3.`) : [];
  if (!result.success || s3Problems.length) {
    const problems = (result.error?.issues ?? []).map((issue) => {
      const key = String(issue.path[0] ?? "environment");
      const missing = input[key] === undefined || blank(input[key]) === undefined;
      const label = key === "ROOT_DOMAIN" ? "ROOT_DOMAIN (or NEXT_PUBLIC_PLATFORM_DOMAIN)" : key;
      if (missing) return `${label} is missing; it ${describe(key)}.`;
      return `${label} ${issue.message}${SECRET_KEYS.has(key) ? "" : ` (got "${String(input[key]).slice(0, 60)}")`}.`;
    });
    return { env: null, problems: [...new Set([...problems, ...s3Problems])], warnings: [] };
  }
  const env = result.data;
  const warnings = [];
  if (env.NODE_ENV === "production" && !env.CRON_SECRET) warnings.push("CRON_SECRET is not set: the scheduled-publishing route refuses every call, so scheduled posts won't go live.");
  if (!env.RESEND_API_KEY) warnings.push("RESEND_API_KEY is not set: emails are written to the server log instead of being sent.");
  return { env, problems: [], warnings };
}

/** @param {string} key */
function describe(key) {
  switch (key) {
    case "DATABASE_URL":
      return "should be the Postgres connection string, e.g. postgresql://user:pass@localhost:5432/builder";
    case "SESSION_SECRET":
      return "signs login sessions; generate one with: openssl rand -base64 32";
    case "ROOT_DOMAIN":
      return "is the host that serves the platform itself, e.g. builder.example.com or localhost:3000";
    default:
      return "is required";
  }
}

/** @type {Env | null} */
let cached = null;

/**
 * The validated environment. Throws an EnvError listing every problem.
 * @returns {Env}
 */
export function getEnv() {
  if (cached) return cached;
  const { env, problems } = checkEnv(process.env);
  if (!env) throw new EnvError(problems);
  cached = env;
  return env;
}

/** Forgets the memoized environment, for tests that change process.env between cases. */
export function resetEnvCache() {
  cached = null;
}

/**
 * Validates at boot and prints warnings once. Honours SKIP_ENV_VALIDATION.
 * @param {{ quiet?: boolean }} [opts]
 */
export function assertEnv(opts = {}) {
  if (process.env.SKIP_ENV_VALIDATION === "1") return;
  const { env, problems, warnings } = checkEnv(process.env);
  if (!env) throw new EnvError(problems);
  cached = env;
  if (!opts.quiet) for (const w of warnings) console.warn(`⚠ ${w}`);
}

/** Platform host, lowercased, e.g. builder.example.com. Falls back to localhost:3000 when validation is skipped. */
export const platformDomain = () =>
  (process.env.SKIP_ENV_VALIDATION === "1" ? (process.env.ROOT_DOMAIN || process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "localhost:3000") : getEnv().ROOT_DOMAIN).toLowerCase();

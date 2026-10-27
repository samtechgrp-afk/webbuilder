import "server-only";
import { randomUUID } from "node:crypto";
import { lookup, resolveCname } from "node:dns/promises";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { checkEnv, getEnv, platformDomain } from "@/lib/env.mjs";
import { mediaStorage } from "@/server/media-processing";

/**
 * The checks behind /admin/system/health. Each one is independent, bounded
 * by a timeout, and reports ok / warn / fail with a one-line summary plus
 * details. Nothing here changes state except the storage probe, which writes,
 * reads back and deletes one small file.
 */

export type HealthStatus = "ok" | "warn" | "fail";

export interface HealthCheck {
  key: "database" | "migrations" | "storage" | "email" | "dns" | "config";
  label: string;
  status: HealthStatus;
  summary: string;
  details: string[];
  ms: number;
}

const TIMEOUT_MS = 5000;

async function timed(key: HealthCheck["key"], label: string, run: () => Promise<Omit<HealthCheck, "key" | "label" | "ms">>): Promise<HealthCheck> {
  const started = performance.now();
  try {
    const result = await Promise.race([
      run(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`No answer within ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)),
    ]);
    return { key, label, ...result, ms: Math.round(performance.now() - started) };
  } catch (err) {
    return { key, label, status: "fail", summary: err instanceof Error ? err.message : String(err), details: [], ms: Math.round(performance.now() - started) };
  }
}

export async function runHealthChecks(): Promise<HealthCheck[]> {
  return Promise.all([
    timed("database", "Database", checkDatabase),
    timed("migrations", "Migrations", checkMigrations),
    timed("storage", "Media storage", checkStorage),
    timed("email", "Email (Resend)", checkEmail),
    timed("dns", "Domains and DNS", checkDns),
    timed("config", "Configuration", checkConfig),
  ]);
}

async function checkDatabase() {
  const started = performance.now();
  const [{ version }] = await prisma.$queryRaw<{ version: string }[]>`SELECT current_setting('server_version') AS version`;
  const ping = Math.round(performance.now() - started);
  const [sites, users] = await Promise.all([prisma.site.count(), prisma.user.count()]);
  return {
    status: (ping > 500 ? "warn" : "ok") as HealthStatus,
    summary: `Connected to Postgres ${version} in ${ping} ms`,
    details: [`${sites} site${sites === 1 ? "" : "s"}, ${users} user${users === 1 ? "" : "s"}`, ...(ping > 500 ? ["Round trips over 500 ms slow every page; host the database near the app."] : [])],
  };
}

/** Migration folders shipped with this build (traced into the standalone output via next.config). */
async function shippedMigrations(): Promise<string[] | null> {
  try {
    const dir = path.join(process.cwd(), "prisma", "migrations");
    return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch {
    return null;
  }
}

async function checkMigrations() {
  const rows = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`
    SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at`;
  const applied = new Set(rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name));
  const failed = rows.filter((r) => !r.finished_at && !r.rolled_back_at).map((r) => r.migration_name);
  const shipped = await shippedMigrations();
  const latest = [...applied].sort().at(-1) ?? "none";
  if (failed.length) {
    return { status: "fail" as HealthStatus, summary: `${failed.length} migration${failed.length === 1 ? "" : "s"} failed part-way`, details: [...failed.map((m) => `Failed: ${m}`), "Fix the cause, then run: npx prisma migrate resolve --rolled-back <name> and migrate deploy again."] };
  }
  if (!shipped) return { status: "warn" as HealthStatus, summary: `${applied.size} applied (latest ${latest}); this build's migration list isn't readable`, details: [] };
  const pending = shipped.filter((m) => !applied.has(m));
  const unknown = [...applied].filter((m) => !shipped.includes(m));
  if (pending.length) {
    return { status: "fail" as HealthStatus, summary: `${pending.length} pending migration${pending.length === 1 ? "" : "s"}: run npx prisma migrate deploy`, details: pending.map((m) => `Pending: ${m}`) };
  }
  return {
    status: (unknown.length ? "warn" : "ok") as HealthStatus,
    summary: `Up to date: ${applied.size} of ${shipped.length} applied (latest ${latest})`,
    details: unknown.map((m) => `Applied in the database but not in this build (an older deploy?): ${m}`),
  };
}

async function checkStorage() {
  const env = getEnv();
  const storage = mediaStorage();
  const key = `_health/${randomUUID()}.txt`;
  const body = Buffer.from(`health probe ${new Date().toISOString()}`);
  const where = env.STORAGE_DRIVER === "s3" ? `bucket "${env.S3_BUCKET}" at ${new URL(env.S3_ENDPOINT!).host}` : "public/uploads on local disk";
  await storage.put(key, body, "text/plain");
  try {
    const back = await storage.get?.(key);
    if (!back || Buffer.compare(Buffer.from(back.body), body) !== 0) return { status: "fail" as HealthStatus, summary: `Wrote a file to ${where} but couldn't read it back`, details: [] };
  } finally {
    await storage.remove(key);
  }
  return {
    status: "ok" as HealthStatus,
    summary: `Write, read and delete work (${where})`,
    details: env.STORAGE_DRIVER === "local" && process.env.VERCEL ? ["Vercel's disk is temporary: uploads vanish on the next deploy. Set STORAGE_DRIVER=s3."] : [],
  };
}

async function checkEmail() {
  const env = getEnv();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [counts, lastFailure] = await Promise.all([
    prisma.emailLog.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.emailLog.findFirst({ where: { status: "FAILED" }, orderBy: { createdAt: "desc" }, select: { tag: true, error: true, createdAt: true } }),
  ]);
  const n = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<string, number>>;
  const traffic = `Last 24 h: ${n.SENT ?? 0} sent, ${n.LOGGED ?? 0} logged only, ${n.FAILED ?? 0} failed`;
  const failure = lastFailure ? [`Last failure (${lastFailure.tag}, ${lastFailure.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC): ${lastFailure.error ?? "unknown"}`] : [];

  if (!env.RESEND_API_KEY) {
    return { status: "warn" as HealthStatus, summary: "No RESEND_API_KEY: emails go to the server log, not to customers", details: [traffic, ...failure] };
  }
  // A full-access key can list domains; a sending-only key is refused with restricted_api_key, which still proves it's genuine.
  const res = await fetch(`${env.RESEND_API_BASE ?? "https://api.resend.com"}/domains`, { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { name?: string; data?: { name: string; status: string }[] };
  const from = env.EMAIL_FROM ?? `noreply@${platformDomain().split(":")[0]}`;
  const fromDomain = /@([^>\s]+)/.exec(from)?.[1]?.toLowerCase();
  if (res.status === 401 && json.name === "restricted_api_key") {
    return { status: ((n.FAILED ?? 0) > 0 ? "warn" : "ok") as HealthStatus, summary: "Key accepted (sending-only key, so domain status can't be shown)", details: [`Sending from ${from}`, traffic, ...failure] };
  }
  if (!res.ok) return { status: "fail" as HealthStatus, summary: `Resend rejected the key (HTTP ${res.status}${json.name ? `, ${json.name}` : ""})`, details: [traffic, ...failure] };
  const domain = json.data?.find((d) => d.name.toLowerCase() === fromDomain);
  const verified = domain?.status === "verified";
  return {
    status: (!verified || (n.FAILED ?? 0) > 0 ? "warn" : "ok") as HealthStatus,
    summary: verified ? `Key valid; ${fromDomain} is verified` : domain ? `Key valid, but ${fromDomain} is ${domain.status} in Resend` : `Key valid, but ${fromDomain ?? from} isn't added in Resend`,
    details: [`Sending from ${from}`, traffic, ...failure],
  };
}

const LOCAL = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/;

async function addresses(host: string): Promise<string[]> {
  try {
    return (await lookup(host, { all: true })).map((a) => a.address).sort();
  } catch {
    return [];
  }
}

async function pointsAtPlatform(host: string, platform: string, platformIps: string[]) {
  const cname = await resolveCname(host).catch(() => [] as string[]);
  if (cname.some((c) => c.toLowerCase().replace(/\.$/, "") === platform || c.toLowerCase().endsWith(`.${platform}`))) return { ok: true, via: `CNAME ${cname[0]}` };
  const ips = await addresses(host);
  if (!ips.length) return { ok: false, via: "doesn't resolve" };
  const ok = ips.some((ip) => platformIps.includes(ip));
  return { ok, via: ips.join(", ") };
}

async function checkDns() {
  const platform = platformDomain().split(":")[0];
  if (LOCAL.test(platform)) {
    return { status: "ok" as HealthStatus, summary: `Local development (${platformDomain()}): wildcard DNS isn't needed`, details: ["Client sites are served at /sites/<subdomain> until ROOT_DOMAIN is a real domain."] };
  }
  const platformIps = await addresses(platform);
  if (!platformIps.length) return { status: "fail" as HealthStatus, summary: `${platform} doesn't resolve`, details: ["Add an A, AAAA or CNAME record for the platform domain."] };
  const probe = `wb-health-${randomUUID().slice(0, 8)}.${platform}`;
  const wildcard = await pointsAtPlatform(probe, platform, platformIps);
  const details = [`${platform} → ${platformIps.join(", ")}`, wildcard.ok ? `*.${platform} → ${wildcard.via}` : `*.${platform} isn't set up (${probe} ${wildcard.via}); add a wildcard record so <subdomain>.${platform} reaches this server`];

  const [sites, localeDomains] = await Promise.all([
    prisma.site.findMany({ where: { customDomain: { not: null } }, select: { name: true, customDomain: true }, take: 50 }),
    prisma.siteLocale.findMany({ where: { domain: { not: null } }, select: { domain: true, site: { select: { name: true } } }, take: 50 }),
  ]);
  const domains = [...sites.map((s) => ({ host: s.customDomain!, site: s.name })), ...localeDomains.map((l) => ({ host: l.domain!, site: l.site.name }))];
  let broken = 0;
  for (const d of domains) {
    const r = await pointsAtPlatform(d.host, platform, platformIps);
    if (!r.ok) broken++;
    details.push(`${r.ok ? "✓" : "✗"} ${d.host} (${d.site}) → ${r.via}`);
  }
  const status: HealthStatus = !wildcard.ok ? "fail" : broken ? "warn" : "ok";
  const summary = !wildcard.ok
    ? "Wildcard subdomains don't reach this server"
    : domains.length
      ? `Wildcard OK; ${domains.length - broken} of ${domains.length} custom domain${domains.length === 1 ? "" : "s"} point here`
      : "Wildcard OK; no custom domains yet";
  return { status, summary, details };
}

async function checkConfig() {
  const { env, problems, warnings } = checkEnv(process.env);
  if (!env) return { status: "fail" as HealthStatus, summary: "The environment is invalid", details: problems };
  return {
    status: (warnings.length ? "warn" : "ok") as HealthStatus,
    summary: warnings.length ? `${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : "All settings valid",
    details: [`Node ${process.version}, ${env.NODE_ENV}`, `Sign-ups ${env.SIGNUPS}`, `Storage driver ${env.STORAGE_DRIVER}`, ...warnings],
  };
}

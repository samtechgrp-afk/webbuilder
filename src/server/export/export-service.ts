import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after } from "next/server";
import { strToU8, zipSync, type Zippable } from "fflate";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assetSource, compileCss, compileHtml, outputPath } from "@/lib/export/compile";
import { internalOrigin } from "@/lib/internal-origin";
import { readSiteSeo } from "@/lib/seo/settings";
import { robotsTxt, sitemapXml } from "@/lib/seo/sitemap";
import type { TenantContext } from "@/lib/tenant";
import { EditError } from "../content-service";
import type { RevisionMeta } from "../cms/dynamic";
import { entryPath, getSitemapUrls } from "../seo/seo-service";
import { localePath } from "@/lib/i18n/locales";
import { readSiteLocales } from "../i18n/locale-service";

/**
 * The export engine. A Designer starts an export; it runs in the background
 * (after the response), compiles every live page with the live renderer,
 * gathers the CSS, fonts and media those pages use, adds the 404 page,
 * sitemap.xml, robots.txt and a content.json, and zips the lot into private
 * storage. Progress is written to the SiteExport row as it goes.
 */

const STORAGE = () => path.join(process.cwd(), "storage", "exports");
const LIVE = { publishedRevisionId: { not: null }, status: { not: "TRASHED" as const } };
const STALE_MS = 15 * 60 * 1000;
const MAX_BUNDLE_BYTES = 500 * 1024 * 1024;

export const exportFile = (siteId: string, fileKey: string) => {
  const file = path.resolve(STORAGE(), siteId, fileKey);
  if (!file.startsWith(path.resolve(STORAGE()) + path.sep)) throw new Error("Bad export path");
  return file;
};

export interface ExportManifest {
  files?: { path: string; bytes: number }[];
  pages?: string[];
  warnings?: string[];
}

export function defaultBaseUrl(site: { subdomain: string; customDomain: string | null }) {
  if (site.customDomain) return `https://${site.customDomain}`;
  const root = process.env.ROOT_DOMAIN ?? "localhost:3000";
  return `${/^localhost|^127\./.test(root) ? "http" : "https"}://${site.subdomain}.${root}`;
}

const baseUrlSchema = (v: string) => {
  try {
    const u = new URL(v.trim());
    if (!/^https?:$/.test(u.protocol) || u.search || u.hash || u.username) return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
};

export async function listExports(t: TenantContext) {
  t.assert("site.settings");
  // An export that never finished (the server restarted mid-run) is marked failed, not left spinning.
  await t.db.siteExport.updateMany({
    where: { status: { in: ["QUEUED", "RUNNING"] }, createdAt: { lt: new Date(Date.now() - STALE_MS) } },
    data: { status: "FAILED", error: "Interrupted before it finished. Run it again.", finishedAt: new Date() },
  });
  return t.db.siteExport.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { createdBy: { select: { name: true, email: true } } } });
}

export async function startExport(t: TenantContext, input: { baseUrl: string }) {
  t.assert("site.settings");
  const baseUrl = baseUrlSchema(input.baseUrl ?? "");
  if (!baseUrl) throw new EditError("Enter the full address the site will be hosted at, like https://www.example.com", "invalid");
  const running = await t.db.siteExport.findFirst({
    where: { status: { in: ["QUEUED", "RUNNING"] }, createdAt: { gte: new Date(Date.now() - STALE_MS) } },
    select: { id: true },
  });
  if (running) throw new EditError("An export of this site is already running", "conflict");
  const job = await t.db.siteExport.create({ data: { siteId: t.site.id, baseUrl, createdById: t.user.id } });
  await t.db.auditLog.create({ data: { siteId: t.site.id, userId: t.user.id, action: "site.export", targetId: job.id } });
  after(() => runExport(job.id));
  return { id: job.id };
}

export async function deleteExport(t: TenantContext, input: { id: string }) {
  t.assert("site.settings");
  const job = await t.db.siteExport.findUnique({ where: { id: input.id } });
  if (!job) throw new EditError("That export no longer exists", "not_found");
  if (job.status === "RUNNING" || job.status === "QUEUED") throw new EditError("Wait for the export to finish before deleting it", "conflict");
  if (job.fileKey) await rm(exportFile(t.site.id, job.fileKey), { force: true });
  await t.db.siteExport.delete({ where: { id: job.id } });
  return {};
}

/**
 * Every live URL of a site, as site paths. The designated 404 page becomes
 * 404.html instead. On a multilingual site each extra language gets the
 * full set under its prefix: translated pages at their own slugs, and the
 * default-language version where a translation doesn't exist yet (the
 * same fallback the live site serves).
 */
export async function exportTargets(siteId: string, notFoundPageId: string | null) {
  const [posts, archives, locales] = await Promise.all([
    prisma.post.findMany({
      where: { siteId, ...LIVE, postType: { key: { not: "template" } }, ...(notFoundPageId ? { id: { not: notFoundPageId } } : {}) },
      orderBy: [{ postType: { key: "asc" } }, { slug: "asc" }],
      select: {
        slug: true,
        title: true,
        locale: true,
        publishedAt: true,
        translation: { select: { translationId: true } },
        postType: { select: { key: true, routePrefix: true, labelSingular: true } },
        publishedRevision: { select: { title: true, meta: true } },
      },
    }),
    prisma.postType.findMany({ where: { siteId, hasArchive: true, key: { notIn: ["page", "template"] } }, select: { key: true, routePrefix: true, labelPlural: true } }),
    readSiteLocales(siteId),
  ]);
  // The 404 page's translations become the 404 page too, never an address of their own.
  const hidden = notFoundPageId ? await notFoundGroups(notFoundPageId) : [];
  const originals = posts.filter((p) => !p.locale && !(p.translation && hidden.includes(p.translation.translationId)));
  const liveGroups = new Set(originals.map((p) => p.translation?.translationId).filter(Boolean));
  const translations = posts.filter((p) => p.locale && p.translation && liveGroups.has(p.translation.translationId));
  const archivePaths = archives.map((a) => `/${a.routePrefix ?? a.key}`);
  const pages = [...originals.map((p) => entryPath(p.postType, p.slug)), ...archivePaths];
  for (const l of locales.filter((x) => !x.isDefault)) {
    for (const o of originals) {
      const t = o.translation && translations.find((x) => x.locale === l.code && x.translation!.translationId === o.translation!.translationId);
      pages.push(localePath(l, entryPath(o.postType, (t ?? o).slug)));
    }
    for (const a of archivePaths) pages.push(localePath(l, a));
  }
  return {
    pages,
    content: [...originals, ...translations].map((p) => {
      const meta = (p.publishedRevision?.meta ?? {}) as RevisionMeta;
      const l = locales.find((x) => (p.locale ? x.code === p.locale : x.isDefault));
      return {
        type: p.postType.key,
        typeLabel: p.postType.labelSingular,
        title: p.publishedRevision?.title ?? p.title,
        path: localePath(l ?? null, entryPath(p.postType, p.slug)),
        ...(l ? { locale: l.code, translationGroup: p.translation?.translationId ?? null } : {}),
        publishedAt: p.publishedAt?.toISOString() ?? null,
        excerpt: meta.excerpt ?? null,
        fields: meta.fields ?? {},
      };
    }),
  };
}

async function notFoundGroups(postId: string) {
  const group = await prisma.postTranslation.findUnique({ where: { postId }, select: { translationId: true } });
  return group ? [group.translationId] : [];
}

async function fetchText(url: string, expect: number[]) {
  const res = await fetch(url, { headers: { accept: "text/html,*/*", "user-agent": "SiteExporter/1.0" }, cache: "no-store", redirect: "manual" });
  if (!expect.includes(res.status)) throw new Error(`${new URL(url).pathname} answered ${res.status}`);
  return res.text();
}

export async function runExport(id: string) {
  const job = await prisma.siteExport.findUnique({ where: { id }, include: { site: true } });
  if (!job || job.status !== "QUEUED") return;
  const { site } = job;
  const update = (data: Prisma.SiteExportUpdateInput) => prisma.siteExport.update({ where: { id }, data });
  try {
    const origin = internalOrigin();
    const notFoundPageId = ((site.settings ?? {}) as { notFoundPageId?: string | null }).notFoundPageId ?? null;
    const { pages, content } = await exportTargets(site.id, notFoundPageId);
    await update({ status: "RUNNING", total: pages.length + 1 });

    const ctx = { origin, siteKey: site.subdomain, baseUrl: job.baseUrl };
    const files: Record<string, Uint8Array> = {};
    const assets = new Set<string>();
    const warnings: string[] = [];
    const links = new Set<string>();
    let done = 0;

    for (const p of pages) {
      const html = await fetchText(`${origin}/sites/${encodeURIComponent(site.subdomain)}${p === "/" ? "" : p}`, [200]);
      const out = compileHtml(html, ctx);
      files[outputPath(p)] = strToU8(out.html);
      out.assets.forEach((a) => assets.add(a));
      for (const m of out.html.matchAll(/<a\b[^>]*\bhref="(\/[^"#?]*)/g)) links.add(m[1]);
      await update({ progress: ++done });
    }
    const notFound = compileHtml(await fetchText(`${origin}/site-404/${encodeURIComponent(site.subdomain)}`, [404]), ctx);
    files["404.html"] = strToU8(notFound.html);
    notFound.assets.forEach((a) => assets.add(a));
    await update({ progress: ++done });

    // Stylesheets can pull in fonts, so they're compiled first and their own references queued.
    const queue = [...assets];
    const seen = new Set<string>();
    let assetBytes = 0;
    while (queue.length) {
      const a = queue.shift()!;
      if (seen.has(a)) continue;
      seen.add(a);
      const res = await fetch(`${origin}${assetSource(a)}`, { cache: "no-store" });
      if (!res.ok) {
        warnings.push(`Missing file ${a} (${res.status})`);
        continue;
      }
      let body: Uint8Array = new Uint8Array(await res.arrayBuffer());
      assetBytes += body.byteLength;
      if (assetBytes > MAX_BUNDLE_BYTES) throw new Error("The site's media is too large to export in one bundle");
      if (a.endsWith(".css")) {
        const css = compileCss(new TextDecoder().decode(body), a);
        body = strToU8(css.css);
        css.assets.forEach((x) => !seen.has(x) && queue.push(x));
      }
      files[a.slice(1)] = body;
    }

    const exported = new Set(pages.map((p) => p.replace(/\/+$/, "") || "/"));
    for (const l of links) {
      const clean = l.replace(/\/+$/, "") || "/";
      if (!exported.has(clean) && !clean.startsWith("/uploads/") && !clean.startsWith("/assets/")) warnings.push(`Link to ${clean} has no page in the export`);
    }

    const seo = readSiteSeo(site.settings);
    files["sitemap.xml"] = strToU8(sitemapXml(await getSitemapUrls(site.id, job.baseUrl)));
    files["robots.txt"] = strToU8(robotsTxt({ sitemapUrl: `${job.baseUrl}/sitemap.xml`, disallowAll: site.status !== "LIVE" || !!seo.discourageIndexing }));
    files["data/content.json"] = strToU8(JSON.stringify({ site: { name: site.name, baseUrl: job.baseUrl, exportedAt: new Date().toISOString() }, entries: content }, null, 2));
    files["README.txt"] = strToU8(readme(site.name, job.baseUrl, pages.length));

    const zippable: Zippable = {};
    for (const [name, data] of Object.entries(files)) zippable[name] = [data, { level: /\.(webp|png|jpe?g|gif|avif|woff2?|ico)$/i.test(name) ? 0 : 6 }];
    const zip = zipSync(zippable);
    const fileKey = `${id}.zip`;
    await mkdir(path.join(STORAGE(), site.id), { recursive: true });
    await writeFile(exportFile(site.id, fileKey), zip);

    const manifest: ExportManifest = {
      pages,
      files: Object.entries(files).map(([p, d]) => ({ path: p, bytes: d.byteLength })).sort((a, b) => a.path.localeCompare(b.path)),
      warnings: [...new Set(warnings)].slice(0, 50),
    };
    await update({ status: "DONE", fileKey, sizeBytes: zip.byteLength, pageCount: pages.length, manifest: manifest as Prisma.InputJsonValue, finishedAt: new Date() });
  } catch (err) {
    console.error("Export failed", id, err);
    await update({ status: "FAILED", error: err instanceof Error ? err.message.slice(0, 500) : "Export failed", finishedAt: new Date() });
  }
}

export async function readExport(t: TenantContext, id: string) {
  t.assert("site.settings");
  const job = await t.db.siteExport.findUnique({ where: { id } });
  if (!job?.fileKey || job.status !== "DONE") return null;
  return { job, data: await readFile(exportFile(t.site.id, job.fileKey)) };
}

function readme(name: string, baseUrl: string, count: number) {
  return `${name}: static export
${"=".repeat(name.length + 15)}

${count} pages compiled for ${baseUrl}

Upload the contents of this folder to any static host (Netlify, Vercel,
Cloudflare Pages, S3, GitHub Pages, nginx). Pages are folders with an
index.html, so the host must serve index.html for directory URLs (all of the
above do). 404.html is the site's not-found page; most hosts pick it up
automatically.

Canonical links, Open Graph URLs and sitemap.xml point at ${baseUrl}.
Export again with a different address if you host it elsewhere.

data/content.json holds the published entries and their fields.
Forms, previews and the editor need the platform; everything else is here.
`;
}

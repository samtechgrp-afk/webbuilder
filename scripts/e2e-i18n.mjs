// End-to-end multi-language engine:
//   1. A Designer manages languages (adds German with its own domain, turns
//      on browser-language detection). Client Admins can't open the screen
//      and a replayed "add language" action is refused.
//   2. Routing: /fr pages, redirects to translated slugs, fallback to the
//      default language (canonical to the original), localized 404s, the
//      Accept-Language redirect (once, never for bots or prefixed paths),
//      a language's own domain, and hreflang in <head>, the Link header and
//      the sitemap.
//   3. The admin language picker, the canvas language menu and the
//      side-by-side translation drawer: a Client Admin translates a product
//      into Spanish and edits the French home page; layout and styles stay
//      the original's in every language.
//   4. Client-mode lockouts: replayed translation saves that try to change
//      structure, styles, unknown elements or designer-locked text are
//      refused, and translations can't be opened in the visual builder.
//   5. GraphQL: locale arguments, hreflangs, composed documents, and
//      multi-tenant + multi-language isolation.
//
// Usage: npm run db:seed && npm run build && npm start   (in another shell)
//        npm run e2e:i18n
import { mkdir } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR ?? "e2e-screenshots";
await mkdir(SHOTS, { recursive: true });

const prisma = new PrismaClient();
const browser = await chromium.launch();
const step = (msg) => console.log(`✓ ${msg}`);
const fail = (msg) => {
  throw new Error(msg);
};

async function login(email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "demo-password-2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/);
  return page;
}

/** A raw GET (no redirects followed), optionally on another Host. */
function get(pathname, { host, headers = {} } = {}) {
  const url = new URL(pathname, BASE);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: url.hostname, port: url.port, path: url.pathname + url.search, method: "GET", headers: { ...(host ? { host } : {}), "user-agent": "Mozilla/5.0 e2e", ...headers } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}
const linkOf = (r) => [r.headers.link ?? []].flat().join(", ");
const langOf = (html) => /class="site-root" lang="([^"]+)"/.exec(html)?.[1] ?? null;
const canonicalOf = (html) => /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1] ?? null;
const hreflangsOf = (html) => [...html.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]);
/** The rendered structure: every widget's class and type, in order. */
const structureOf = (html) => [...html.slice(html.indexOf('class="site-root"'), html.indexOf("</main>")).matchAll(/class="(n-[\w-]+)" data-w="(\w+)"/g)].map((m) => `${m[1]}:${m[2]}`).join(" ");

async function gql(site, query, variables) {
  const res = await fetch(`${BASE}/api/v1/sites/${site}/graphql`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });
  return res.json();
}

/** Replays a captured server action with another session and/or a changed payload. */
async function replay(page, req, transform = (args) => args) {
  const args = JSON.parse(req.postData());
  const res = await page.request.post(req.url(), {
    headers: { "next-action": req.headers()["next-action"], "content-type": req.headers()["content-type"], accept: "text/x-component", origin: new URL(BASE).origin },
    data: JSON.stringify(transform(args)),
  });
  return res.text();
}

const S = `${BASE}/sites/aurelia`;
const aurelia = await prisma.site.findUniqueOrThrow({ where: { subdomain: "aurelia" } });
let designer;
let client;
try {
  // ── 1. Languages screen ──────────────────────────────────────────────────
  designer = await login("designer@studio.test");
  await designer.goto(`${BASE}/admin/sites/${aurelia.id}/settings`);
  await designer.locator("[data-languages-link]").click();
  await designer.waitForURL(/\/settings\/languages$/);
  for (const code of ["en-US", "fr-FR", "es-ES"]) await designer.locator(`[data-locale="${code}"]`).waitFor();
  await designer.locator("[data-add-locale]").click();
  const form = designer.locator("[data-locale-form]");
  await form.locator('input[name="code"]').fill("de-DE");
  await form.locator('input[name="label"]').fill("Deutsch");
  if ((await form.locator('input[name="prefix"]').inputValue()) !== "de") fail("The URL prefix wasn't suggested from the language code");
  await form.locator('input[name="domain"]').fill("aurelia-de.test");
  await form.locator('input[name="currency"]').fill("EUR");
  const addReq = designer.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"]);
  await designer.locator("[data-save-locale]").click();
  const addLocaleReq = await addReq;
  await designer.locator('[data-locale="de-DE"]').waitFor();
  await designer.locator("#locale-detection").click();
  await designer.getByText("Language detection is on.").waitFor();
  await designer.screenshot({ path: path.join(SHOTS, "i18n-01-languages.png"), fullPage: true });
  step("Designer adds German (own domain aurelia-de.test, /de) next to English, French and Spanish, and turns on language detection");

  client = await login("client@aurelia.test");
  await client.goto(`${BASE}/admin/sites/${aurelia.id}/settings/languages`);
  await client.getByText("This page could not be found.").waitFor();
  if (!/permission/i.test(await replay(client, addLocaleReq, ([a]) => [{ ...a, locale: { ...a.locale, code: "it-IT", label: "Italiano", prefix: "it", domain: null } }]))) fail("A Client Admin's replayed 'add language' wasn't refused");
  if (await prisma.siteLocale.findFirst({ where: { siteId: aurelia.id, code: "it-IT" } })) fail("A Client Admin added a language");
  step("Client Admins can't open Languages, and a replayed 'add language' is refused on the server");

  // ── 2. Routing, fallback, 404s, detection, domains, hreflang ─────────────
  const fr = await get("/sites/aurelia/fr");
  if (fr.status !== 200 || langOf(fr.body) !== "fr-FR" || !fr.body.includes("Des pièces qui semblent vous avoir toujours appartenu.")) fail("/fr didn't render the French home page");
  if (canonicalOf(fr.body) !== `${S}/fr/`) fail(`French canonical is ${canonicalOf(fr.body)}`);
  const heads = Object.fromEntries(hreflangsOf(fr.body));
  if (heads["en-US"] !== `${S}/` || heads["fr-FR"] !== `${S}/fr/` || heads["x-default"] !== `${S}/` || heads["es-ES"]) fail(`Wrong hreflang tags: ${JSON.stringify(heads)}`);
  if (!linkOf(fr).includes(`<${S}/fr/>; rel="alternate"; hreflang="fr-FR"`) || !linkOf(fr).includes('hreflang="x-default"')) fail("The Link header doesn't announce the translations");
  if (!fr.body.includes('href="/sites/aurelia/fr/contact"')) fail("Links inside the French page don't stay in French");
  if (!/data-w="langswitch"[^>]*>.*aria-current="true" data-lang="fr-FR"/.test(fr.body)) fail("The language switcher doesn't mark French as current");
  const en = await get("/sites/aurelia");
  if (structureOf(en.body) !== structureOf(fr.body) || !structureOf(en.body).includes("n-hero-title:heading")) fail("The French page's structure differs from the original's");
  if (!en.body.includes("Rooms that feel like they were always meant to be yours.") || langOf(en.body) !== "en-US") fail("The English home page changed");
  step("/fr renders the French home with lang, canonical, hreflang (head + Link header), French links and the switcher; its structure is the original's");

  const redirect = await get("/sites/aurelia/fr/shop/alabaster-table-lamp");
  if (redirect.status !== 308 || redirect.headers.location !== "/sites/aurelia/fr/shop/lampe-de-table-albatre") fail(`Default slug in French answered ${redirect.status} ${redirect.headers.location}`);
  const lamp = await get("/sites/aurelia/fr/shop/lampe-de-table-albatre");
  if (lamp.status !== 200 || !lamp.body.includes("Lampe de table en albâtre") || !lamp.body.includes("Albâtre d&#x27;Espagne, laiton") && !lamp.body.includes("Albâtre d'Espagne, laiton")) fail("The French product didn't render its own title and material");
  if (!lamp.body.includes("680")) fail("The French product lost the shared price");
  const fallback = await get("/sites/aurelia/es/shop/velvet-garden-chair");
  if (fallback.status !== 200 || langOf(fallback.body) !== "en-US" || canonicalOf(fallback.body) !== `${S}/shop/velvet-garden-chair`) fail("An untranslated Spanish address didn't fall back to English with a canonical to the original");
  const esHome = await get("/sites/aurelia/es");
  if (esHome.body.includes("Borrador")) fail("A draft Spanish translation leaked onto the live site");
  if ((await get("/sites/aurelia/shop/lampe-de-table-albatre")).status !== 404) fail("A French slug answered without the /fr prefix");
  step("Default-language slugs redirect to the translation's slug (308); untranslated pages fall back to English with a canonical to the original; drafts stay private");

  const notFoundPage = await prisma.post.findFirstOrThrow({ where: { siteId: aurelia.id, slug: "page-not-found", locale: "" } });
  await designer.goto(`${BASE}/admin/sites/${aurelia.id}/settings`);
  await designer.locator('select[name="notFoundPageId"]').selectOption(notFoundPage.id);
  await designer.locator("[data-save-identity]").click();
  await designer.getByText("Saved.").first().waitFor();
  const fr404 = await get("/sites/aurelia/fr/pas-ici");
  if (fr404.status !== 404 || !fr404.body.includes("Cette pièce n&#x27;existe pas (encore).") && !fr404.body.includes("Cette pièce n'existe pas (encore).")) fail("A missing French address didn't get the French 404 page");
  const en404 = await get("/sites/aurelia/not-here");
  if (en404.status !== 404 || !en404.body.includes("This room doesn")) fail("A missing English address didn't get the English 404 page");
  if ((await get("/sites/aurelia/fr/page-introuvable")).status !== 404) fail("The French 404 page is reachable at its own address");
  step("Missing addresses get the 404 page in their language (HTTP 404); the translated 404 page isn't served at its own address");

  const detect = await get("/sites/aurelia", { headers: { "accept-language": "fr-CA,fr;q=0.9,en;q=0.5" } });
  if (detect.status !== 307 || detect.headers.location !== "/sites/aurelia/fr" || !String(detect.headers["set-cookie"]).includes("wb_locale=fr-FR")) fail(`Accept-Language fr answered ${detect.status} ${detect.headers.location}`);
  if ((await get("/sites/aurelia", { headers: { "accept-language": "fr", cookie: "wb_locale=en-US" } })).status !== 200) fail("A visitor who already has a language was redirected again");
  if ((await get("/sites/aurelia", { headers: { "accept-language": "fr", "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" } })).status !== 200) fail("A search engine was redirected");
  if ((await get("/sites/aurelia/es", { headers: { "accept-language": "fr" } })).status !== 200) fail("A prefixed address was redirected");
  if ((await get("/sites/aurelia/shop/velvet-garden-chair", { headers: { "accept-language": "fr" } })).status !== 200) fail("A page without a French translation was redirected");
  step("Accept-Language sends a French browser from / to /fr once (cookie), never bots, prefixed paths or untranslated pages");

  const onDomain = await get("/", { host: "aurelia-de.test" });
  if (onDomain.status !== 200 || !onDomain.body.includes("Rooms that feel like") || langOf(onDomain.body) !== "en-US") fail(`aurelia-de.test answered ${onDomain.status}`);
  if (!onDomain.body.includes('data-lang="en-US"') || !/href="https?:\/\/aurelia\.[^"]*" hrefLang="en-US"/.test(onDomain.body)) fail("The switcher on the German domain doesn't link back to the main site");
  if ((await get("/fr", { host: "aurelia-de.test" })).status !== 404) fail("A language prefix worked on another language's domain");
  step("aurelia-de.test serves the site in German (falling back to English content), with switcher links back to the main domain");

  const sitemap = (await get("/sites/aurelia/sitemap.xml")).body;
  if (!sitemap.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"') || !sitemap.includes(`<loc>${S}/fr/shop/lampe-de-table-albatre</loc>`)) fail("The sitemap is missing the French product");
  if (!sitemap.includes(`<xhtml:link rel="alternate" hreflang="fr-FR" href="${S}/fr/shop/lampe-de-table-albatre"/>`) || !sitemap.includes(`<xhtml:link rel="alternate" hreflang="x-default" href="${S}/shop/alabaster-table-lamp"/>`)) fail("The sitemap is missing hreflang alternates");
  if (sitemap.includes("page-introuvable") || sitemap.includes(`<loc>${S}/es/</loc>`)) fail("The sitemap lists a 404 page or a draft translation");
  const northwind = await get("/sites/northwind");
  if (linkOf(northwind).includes("hreflang") || hreflangsOf(northwind.body).length || /data-w="langswitch" aria-label/.test(northwind.body)) fail("A single-language site got language markup");
  step("sitemap.xml lists each language with xhtml:link alternates (no drafts, no 404 page); single-language Northwind is untouched");

  // ── 3. Admin locale picker, canvas menu, translation drawer ──────────────
  await client.goto(`${BASE}/admin/sites/${aurelia.id}/content?type=product`);
  await client.locator("[data-admin-locale]").selectOption("fr-FR");
  await client.locator('[data-row="lampe-de-table-albatre"]').waitFor();
  if (await client.locator('[data-row="velvet-garden-chair"]').count()) fail("The French content list shows English entries");
  await client.locator("[data-admin-locale]").selectOption("en-US");
  await client.locator('[data-row="velvet-garden-chair"]').waitFor();
  step("The admin bar's language picker switches the content dashboard between English originals and French translations");

  const home = await prisma.post.findFirstOrThrow({ where: { siteId: aurelia.id, slug: "home", locale: "" } });
  await designer.goto(`${BASE}/admin/sites/${aurelia.id}/pages/${home.id}/edit`);
  const menu = designer.locator("[data-canvas-languages]");
  await menu.locator("summary").click();
  await menu.getByText("Translated", { exact: true }).waitFor();
  await menu.getByText("Not translated", { exact: true }).waitFor();
  await menu.getByText("Draft translation").waitFor();
  await designer.screenshot({ path: path.join(SHOTS, "i18n-02-canvas-languages.png") });
  step("The Visual Builder's canvas header lists the page's languages and their translation state");

  await client.goto(`${BASE}/admin/sites/${aurelia.id}/translations`);
  await client.locator('[data-source="/shop/velvet-garden-chair"] [data-start-translation="es-ES"]').click();
  const drawer = client.locator("[data-translation-drawer]");
  await drawer.waitFor();
  await drawer.getByLabel("Translated title").fill("Silla de jardín de terciopelo");
  await drawer.getByLabel("Translated slug").fill("silla-jardin-terciopelo");
  await drawer.getByLabel("Translated Material").fill("Terciopelo de algodón musgo, roble");
  await drawer.getByLabel("Translated meta description").fill("Una silla baja y profunda tapizada en terciopelo verde musgo.");
  await client.screenshot({ path: path.join(SHOTS, "i18n-03-drawer.png") });
  await drawer.locator("[data-publish-translation]").click();
  await client.getByText("Published.").waitFor();
  const silla = await get("/sites/aurelia/es/shop/silla-jardin-terciopelo");
  if (silla.status !== 200 || !silla.body.includes("Silla de jardín de terciopelo") || !silla.body.includes("Terciopelo de algodón musgo, roble") || !silla.body.includes("1,450")) fail("The Spanish product isn't live with its own text and the shared price");
  if ((await get("/sites/aurelia/es/shop/velvet-garden-chair")).headers.location !== "/sites/aurelia/es/shop/silla-jardin-terciopelo") fail("The English slug in Spanish doesn't redirect to the new translation");
  step("A Client Admin translates a product into Spanish in the side-by-side drawer and publishes it: live at /es/shop/silla-jardin-terciopelo with the shared price");

  await client.goto(`${BASE}/admin/sites/${aurelia.id}/translations`);
  await client.locator('[data-source="/"] [data-edit-translation="fr-FR"]').click();
  await drawer.waitFor();
  const title = drawer.locator('[data-override="hero-title.text"]');
  await title.fill("Des pièces faites pour vous.");
  if (!(await drawer.locator('[data-override="footer-legal.text"]').isDisabled())) fail("Designer-locked footer text is editable in the drawer");
  const saveReq = client.waitForRequest((r) => r.method() === "POST" && !!r.headers()["next-action"] && (r.postData() ?? "").includes("hero-title"));
  await drawer.locator("[data-publish-translation]").click();
  const saveTranslationReq = await saveReq;
  await client.getByText("Published.").waitFor();
  const fr2 = await get("/sites/aurelia/fr");
  if (!fr2.body.includes("Des pièces faites pour vous.") || structureOf(fr2.body) !== structureOf(en.body)) fail("The French edit didn't go live, or changed the structure");
  if (!(await get("/sites/aurelia")).body.includes("Rooms that feel like they were always meant to be yours.")) fail("Editing French changed the English page");
  step("The French home page's headline is edited in the drawer (designer-locked text is read-only); English and the shared layout are untouched");

  // ── 4. Client-mode structural lockouts ───────────────────────────────────
  const frHome = await prisma.post.findFirstOrThrow({ where: { siteId: aurelia.id, slug: "home", locale: "fr-FR" } });
  const before = JSON.stringify((await prisma.post.findUniqueOrThrow({ where: { id: frHome.id } })).draft);
  const version = async () => (await prisma.postRevision.aggregate({ where: { postId: frHome.id }, _max: { version: true } }))._max.version;
  const attempt = (patch) => replay(client, saveTranslationReq, ([a]) => [{ ...a, translation: { ...a.translation, ...patch(a.translation) } }]);
  const current = await version();
  const tries = [
    ["a whole layout document", (tr) => ({ baseVersion: current, document: { version: 1, rootId: "root", nodes: {} } }), /Layout and structure are shared/],
    ["a style change", (tr) => ({ baseVersion: current, overrides: { ...tr.overrides, "hero-title": { style: { desktop: { color: "red" } } } } }), /isn't text, an image or a link/],
    ["a new element", (tr) => ({ baseVersion: current, overrides: { ...tr.overrides, injected: { text: "Hi" } } }), /can't add or remove elements/],
    ["designer-locked text", (tr) => ({ baseVersion: current, overrides: { ...tr.overrides, "footer-legal": { text: "© Hacked" } } }), /locked by the designer/],
    ["a script link", (tr) => ({ baseVersion: current, overrides: { ...tr.overrides, "hero-cta": { link: { label: "x", href: "javascript:alert(1)" } } } }), /Links must start with/],
  ];
  for (const [what, patch, expected] of tries) {
    const text = await attempt(patch);
    if (!expected.test(text)) fail(`A replayed translation save with ${what} wasn't refused: ${text.slice(0, 300)}`);
  }
  if (JSON.stringify((await prisma.post.findUniqueOrThrow({ where: { id: frHome.id } })).draft) !== before || (await version()) !== current) fail("A refused translation save wrote something");
  await client.goto(`${BASE}/admin/sites/${aurelia.id}/pages/${frHome.id}/edit`);
  await client.waitForURL(/\/translations\?edit=/);
  step("Replayed saves with a layout, styles, new elements, locked text or unsafe links are refused and write nothing; translations never open in the visual builder");

  // ── 5. GraphQL ───────────────────────────────────────────────────────────
  const q1 = await gql(
    "aurelia",
    `{ locales { code isDefault url }
       lamp: post(type: "product", slug: "lampe-de-table-albatre", locale: "fr-FR") { title locale uri customFields { material price { amount currency } } hreflangs { hreflang url } translations { locale title } }
       byId: post(type: "product", slug: "alabaster-table-lamp") { id title locale }
       list: posts(type: "product", locale: "fr-FR") { totalCount nodes { title } }
       home: page(slug: "home", locale: "fr-FR") { title document }
       esHome: page(slug: "home", locale: "es-ES") { title } }`,
  );
  if (q1.errors) fail(JSON.stringify(q1.errors));
  const d = q1.data;
  if (d.locales.map((l) => l.code).join() !== "en-US,fr-FR,es-ES,de-DE" || !d.locales[0].isDefault) fail(`locales: ${JSON.stringify(d.locales)}`);
  if (d.lamp.title !== "Lampe de table en albâtre" || d.lamp.locale !== "fr-FR" || d.lamp.uri !== "/fr/shop/lampe-de-table-albatre" || d.lamp.customFields.material !== "Albâtre d'Espagne, laiton" || d.lamp.customFields.price.amount !== 680) fail(`French post: ${JSON.stringify(d.lamp)}`);
  if (d.lamp.hreflangs.map((h) => h.hreflang).join() !== "en-US,fr-FR,x-default" || d.lamp.translations[0]?.title !== "Alabaster Table Lamp") fail(`hreflangs/translations: ${JSON.stringify(d.lamp)}`);
  if (d.byId.locale !== "en-US" || d.list.totalCount !== 1 || d.list.nodes[0].title !== "Lampe de table en albâtre") fail(`lists: ${JSON.stringify([d.byId, d.list])}`);
  if (d.home.document.nodes["hero-title"].props.text !== "Des pièces faites pour vous." || d.home.document.type === "translation" || !d.home.document.nodes["hero-grid"]) fail("The French page document isn't the composed layout");
  if (d.esHome !== null) fail("A draft Spanish page is public over GraphQL");
  const viaId = await gql("aurelia", `query($id: ID!) { post(id: $id, locale: "fr-FR") { title } }`, { id: d.byId.id });
  if (viaId.data?.post?.title !== "Lampe de table en albâtre") fail("post(id, locale) didn't return the translation");
  const bad = await gql("aurelia", `{ posts(type: "product", locale: "xx-XX") { totalCount } }`);
  if (bad.errors?.[0]?.extensions?.code !== "BAD_USER_INPUT") fail("An unknown locale wasn't rejected");
  step("GraphQL: locales, locale arguments on post/page/posts, translated fields over shared ones, hreflangs, composed page documents; drafts and unknown locales refused");

  await prisma.site.update({ where: { subdomain: "northwind" }, data: { graphqlEnabled: true } });
  const nw = await gql("northwind", `query($id: ID!) { locales { code } post(id: $id) { title } fr: posts(type: "page", locale: "fr-FR") { totalCount } }`, { id: frHome.id });
  if (nw.data?.locales?.length !== 0 && nw.data !== null) fail("Northwind reports languages");
  if (!nw.errors?.some((e) => /single language/.test(e.message))) fail("Northwind accepted a French locale");
  const nw2 = await gql("northwind", `query($id: ID!) { post(id: $id) { title } }`, { id: frHome.id });
  if (nw2.data?.post !== null) fail("Northwind resolved Aurelia's French page by id");
  const nw3 = await gql("northwind", `{ page(slug: "home") { title locale hreflangs { url } } }`);
  if (nw3.data?.page?.title !== "Home" || nw3.data.page.locale !== null || nw3.data.page.hreflangs.length) fail(`Northwind home: ${JSON.stringify(nw3)}`);
  step("Multi-tenant + multi-language isolation: Northwind has no languages, refuses locale arguments and can't resolve Aurelia's translations by id");

  console.log("\nMulti-language engine passed.");
} catch (err) {
  for (const [name, p] of [["designer", designer], ["client", client]]) {
    if (p) await p.screenshot({ path: path.join(SHOTS, `i18n-failure-${name}.png`), fullPage: true }).catch(() => {});
  }
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
  await prisma.$disconnect();
}

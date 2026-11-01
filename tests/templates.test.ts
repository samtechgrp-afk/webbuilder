import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { prisma } from "../src/lib/db";
import { structuralProblem } from "../src/lib/builder/tree";
import type { BuilderDocument } from "../src/lib/builder/types";
import { valueSchema } from "../src/lib/cms/fields";
import type { StorageAdapter } from "../src/server/media-processing";
import { compileBlueprint } from "../src/lib/templates/compile";
import { blueprintCurrency, fieldConfig, storedFieldValue } from "../src/lib/templates/content";
import { previewContext } from "../src/lib/templates/preview";
import { BLUEPRINTS, getBlueprint } from "../src/lib/templates/registry";
import { blueprintProblems, parseBlueprint } from "../src/lib/templates/schema";
import { suggestSubdomain, subdomainProblem } from "../src/lib/templates/subdomain";
import { instantiateBlueprint, TemplateError } from "../src/lib/templates/seeder";
import { SECTORS } from "../src/lib/templates/types";

/** Keeps files in memory and remembers what was written and removed. */
function memoryStorage() {
  const files = new Map<string, Buffer>();
  const removed: string[] = [];
  const adapter: StorageAdapter = {
    async put(key, body) {
      files.set(key, body);
      return `/uploads/${key}`;
    },
    async remove(key) {
      files.delete(key);
      removed.push(key);
    },
  };
  return { adapter, files, removed };
}

/** The shape of a document with ids and content left out: types, tags and nesting. */
function shape(doc: BuilderDocument, id = doc.rootId): unknown {
  const node = doc.nodes[id];
  return [node.type, node.tag ?? null, (node.children ?? []).map((c) => shape(doc, c))];
}

const created: string[] = [];
after(async () => {
  for (const id of created) await prisma.site.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

describe("blueprint catalog", () => {
  it("ships exactly one blueprint per sector", () => {
    assert.equal(BLUEPRINTS.length, Object.keys(SECTORS).length);
    for (const sector of Object.keys(SECTORS)) assert.equal(BLUEPRINTS.filter((b) => b.sector === sector).length, 1, sector);
    assert.equal(new Set(BLUEPRINTS.map((b) => b.key)).size, BLUEPRINTS.length);
  });

  it("every blueprint passes the cross-checks", () => {
    for (const bp of BLUEPRINTS) assert.deepEqual(blueprintProblems(bp), [], bp.key);
  });

  it("every page compiles to a valid builder document within the editor's limits", () => {
    for (const bp of BLUEPRINTS) {
      const out = compileBlueprint(bp, previewContext(bp));
      const docs = [...out.pages.map((p) => p.document), out.notFound, ...(out.productTemplate ? [out.productTemplate] : [])];
      assert.equal(out.pages.length, bp.pages.length);
      assert.equal(!!out.productTemplate, bp.products.length > 0, bp.key);
      for (const doc of docs) {
        assert.equal(structuralProblem(doc), null, bp.key);
        assert.ok(Object.keys(doc.nodes).length < 2_000, bp.key);
        assert.ok(JSON.stringify(doc).length < 1_000_000, bp.key);
      }
    }
  });

  it("compiles the same structure for the preview and for a real site", () => {
    for (const bp of BLUEPRINTS) {
      const preview = compileBlueprint(bp, previewContext(bp));
      const real = compileBlueprint(bp, {
        ...previewContext(bp),
        postTypeIds: Object.fromEntries(bp.postTypes.map((p, i) => [p.key, `real-pt-${i}`])),
        productIds: Object.fromEntries(bp.products.map((p, i) => [p.slug, `real-pr-${i}`])),
      });
      preview.pages.forEach((p, i) => assert.deepEqual(shape(p.document), shape(real.pages[i].document), `${bp.key}/${p.slug}`));
    }
  });

  it("sample entry values pass the CMS field validators", () => {
    for (const bp of BLUEPRINTS) {
      const currency = blueprintCurrency(bp);
      for (const entry of bp.entries) {
        const pt = bp.postTypes.find((p) => p.key === entry.type)!;
        for (const f of pt.fields) {
          const raw = entry.fields[f.key];
          const value = raw === undefined ? null : storedFieldValue(f, raw, currency, () => "casset000000000000000000000");
          const result = valueSchema({ key: f.key, label: f.label, type: f.type, required: f.required, config: fieldConfig(f, currency) }).safeParse(value);
          assert.ok(result.success, `${bp.key}/${entry.slug}.${f.key}: ${result.success ? "" : result.error.issues[0]?.message}`);
        }
      }
    }
  });

  it("rejects broken blueprints with a readable message", () => {
    const bp = structuredClone(getBlueprint("devtools-api")!);
    bp.pages[0].sections.push({ kind: "cta", title: "Go", actions: [{ label: "Nowhere", href: "/missing-page" }] });
    assert.match(blueprintProblems(bp).join("; "), /missing-page/);
    assert.throws(() => parseBlueprint({ ...bp, tokens: { ...bp.tokens, colors: {} } }, "broken.json"), /broken\.json/);
  });
});

describe("subdomains", () => {
  it("accepts lowercase hostnames and rejects reserved or malformed ones", () => {
    assert.equal(subdomainProblem("acme-studio"), null);
    for (const bad of ["a", "-acme", "acme-", "Acme", "acme_studio", "admin", "www", "x".repeat(41)]) assert.ok(subdomainProblem(bad), bad);
  });

  it("suggests an address from a site name", () => {
    assert.equal(suggestSubdomain("Café Lume & Co."), "cafe-lume-co");
    assert.equal(subdomainProblem(suggestSubdomain("Osteria Lume")), null);
  });
});

describe("instantiating a blueprint", () => {
  it("creates every entity under the new site only", async () => {
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "designer@studio.test" } });
    const bp = getBlueprint("fashion-store")!;
    const storage = memoryStorage();
    const before = await prisma.post.count();
    const { siteId, homeId } = await instantiateBlueprint({ blueprint: bp, name: "Unit Test Shop", subdomain: "unit-test-shop", ownerId: owner.id }, { storage: storage.adapter });
    created.push(siteId);

    const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    assert.equal(site.status, "DRAFT");
    const home = await prisma.post.findUniqueOrThrow({ where: { id: homeId } });
    assert.equal(home.siteId, siteId);
    assert.ok(home.publishedRevisionId);

    const pages = await prisma.post.count({ where: { siteId, postType: { key: "page" } } });
    assert.equal(pages, bp.pages.length + 1); // plus the 404 page
    assert.equal(await prisma.product.count({ where: { siteId } }), bp.products.length);
    assert.equal(await prisma.mediaAsset.count({ where: { siteId } }), bp.images.length);
    assert.equal(storage.files.size > 0, true);
    assert.equal(await prisma.post.count() - before, bp.pages.length + 1 + bp.entries.length + 1); // pages, 404, entries, product template

    const members = await prisma.membership.findMany({ where: { userId: owner.id, siteId } });
    assert.equal(members.length, 1);

    await assert.rejects(
      instantiateBlueprint({ blueprint: bp, name: "Again", subdomain: "unit-test-shop", ownerId: owner.id }, { storage: memoryStorage().adapter }),
      (e: unknown) => e instanceof TemplateError && e.field === "subdomain",
    );
  });

  it("rolls back every row and deletes written files when a step fails", async () => {
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: "designer@studio.test" } });
    const storage = memoryStorage();
    const sitesBefore = await prisma.site.count();
    const postsBefore = await prisma.post.count();
    // Fail on the very last insert, after everything else has been written.
    const failing = new Proxy(prisma, {
      get(target, key, receiver) {
        if (key !== "$transaction") return Reflect.get(target, key, receiver);
        return (fn: (tx: unknown) => Promise<unknown>, opts: unknown) =>
          prisma.$transaction(
            (tx) =>
              fn(
                new Proxy(tx, {
                  get: (t, k, r) =>
                    k === "auditLog"
                      ? {
                          create: async () => {
                            throw new Error("boom");
                          },
                        }
                      : Reflect.get(t, k, r),
                }),
              ),
            opts as never,
          );
      },
    });
    await assert.rejects(instantiateBlueprint({ blueprint: getBlueprint("boutique-hotel")!, name: "Doomed", subdomain: "unit-test-doomed", ownerId: owner.id }, { db: failing, storage: storage.adapter }), /boom/);
    assert.equal(await prisma.site.count(), sitesBefore);
    assert.equal(await prisma.post.count(), postsBefore);
    assert.equal(await prisma.site.findUnique({ where: { subdomain: "unit-test-doomed" } }), null);
    assert.ok(storage.removed.length > 0);
    assert.equal(storage.files.size, 0);
  });
});

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { prisma } from "../src/lib/db";
import { TenantViolation, tenantDb } from "../src/lib/tenant-db";

// Integration test against the seeded database (npm run db:seed).
describe("tenantDb isolation", () => {
  let aurelia: string;
  let northwind: string;
  let northwindPostId: string;

  before(async () => {
    aurelia = (await prisma.site.findUniqueOrThrow({ where: { subdomain: "aurelia" } })).id;
    northwind = (await prisma.site.findUniqueOrThrow({ where: { subdomain: "northwind" } })).id;
    northwindPostId = (await prisma.post.findFirstOrThrow({ where: { siteId: northwind } })).id;
  });
  after(() => prisma.$disconnect());

  it("only lists the tenant's own rows", async () => {
    const posts = await tenantDb(aurelia).post.findMany();
    assert.ok(posts.length > 0);
    assert.ok(posts.every((p) => p.siteId === aurelia));
  });

  it("can't read another tenant's row by id", async () => {
    assert.equal(await tenantDb(aurelia).post.findUnique({ where: { id: northwindPostId } }), null);
  });

  it("can't update or delete another tenant's row", async () => {
    const res = await tenantDb(aurelia).post.updateMany({ where: { id: northwindPostId }, data: { title: "pwned" } });
    assert.equal(res.count, 0);
    await assert.rejects(tenantDb(aurelia).post.delete({ where: { id: northwindPostId } }));
  });

  it("refuses to create or move rows into another tenant", async () => {
    await assert.rejects(
      tenantDb(aurelia).auditLog.create({ data: { siteId: northwind, action: "test" } }),
      TenantViolation,
    );
    await assert.rejects(
      tenantDb(aurelia).post.updateMany({ data: { siteId: northwind } }),
      TenantViolation,
    );
  });

  it("stamps siteId on create", async () => {
    const log = await tenantDb(aurelia).auditLog.create({ data: { action: "test.stamp" } });
    assert.equal(log.siteId, aurelia);
    await prisma.auditLog.delete({ where: { id: log.id } });
  });
});

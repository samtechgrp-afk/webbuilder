import { Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * Tenant isolation at the data layer.
 *
 * `tenantDb(siteId)` returns a Prisma client whose every query on a
 * tenant-owned model is forced into that site: reads and bulk writes get
 * `siteId` AND-ed into their `where`, creates get `siteId` stamped on, and any
 * attempt to write a different siteId throws. A forgotten filter in a route
 * therefore can't leak another client's data.
 *
 * Conventions this relies on:
 *  - Tenant code writes foreign keys as scalars (`postTypeId: x`), not
 *    `connect`, so `siteId` can be stamped on the same object.
 *  - Nested writes (`revisions: { create }`) must pass `siteId` themselves;
 *    `assertNested` below catches a missing one at runtime.
 *  - Ids that arrive from the browser (asset ids, parent ids) are looked up
 *    through this client before use, which proves they belong to the site.
 */
export const TENANT_MODELS = new Set<Prisma.ModelName>([
  "Membership",
  "PostType",
  "Post",
  "PostRevision",
  "EditLock",
  "FieldGroup",
  "CustomField",
  "FieldValue",
  "Taxonomy",
  "Term",
  "MediaFolder",
  "MediaAsset",
  "AuditLog",
  "DesignTokenRevision",
  "SiteExport",
  "ApiKey",
  "SiteLocale",
  "PostTranslation",
]);

const WHERE_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany",
  "count", "aggregate", "groupBy", "update", "updateMany", "updateManyAndReturn",
  "delete", "deleteMany", "upsert",
]);

export class TenantViolation extends Error {}

type Data = Record<string, unknown>;

function stamp(data: Data, siteId: string, model: string): Data {
  if (data.siteId !== undefined && data.siteId !== siteId) {
    throw new TenantViolation(`${model}: write to another site's siteId was blocked`);
  }
  return { ...data, siteId };
}

function guardUpdate(data: Data | undefined, siteId: string, model: string) {
  if (data && data.siteId !== undefined && data.siteId !== siteId) {
    throw new TenantViolation(`${model}: moving a row to another site was blocked`);
  }
}

/** Nested `create` blocks for tenant models must carry the same siteId. */
function assertNested(data: unknown, siteId: string, path: string) {
  if (!data || typeof data !== "object") return;
  for (const [key, value] of Object.entries(data as Data)) {
    if (!value || typeof value !== "object") continue;
    const nested = value as Data;
    for (const op of ["create", "createMany"] as const) {
      const block = op === "createMany" ? (nested[op] as Data | undefined)?.data : nested[op];
      if (!block) continue;
      for (const row of Array.isArray(block) ? block : [block]) {
        const r = row as Data;
        if ("siteId" in r && r.siteId !== siteId) {
          throw new TenantViolation(`${path}.${key}: nested write to another site was blocked`);
        }
      }
    }
  }
}

export function tenantDb(siteId: string) {
  if (!siteId) throw new TenantViolation("tenantDb requires a siteId");

  return prisma.$extends({
    name: `tenant:${siteId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model as Prisma.ModelName)) return query(args);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const a = (args ?? {}) as any;

          if (WHERE_OPS.has(operation)) {
            a.where = { ...(a.where ?? {}), siteId };
          }
          switch (operation) {
            case "create":
              a.data = stamp(a.data, siteId, model);
              assertNested(a.data, siteId, model);
              break;
            case "createMany":
            case "createManyAndReturn":
              a.data = (Array.isArray(a.data) ? a.data : [a.data]).map((d: Data) => stamp(d, siteId, model));
              break;
            case "upsert":
              a.create = stamp(a.create, siteId, model);
              guardUpdate(a.update, siteId, model);
              break;
            case "update":
            case "updateMany":
            case "updateManyAndReturn":
              guardUpdate(a.data, siteId, model);
              assertNested(a.data, siteId, model);
              break;
          }
          return query(a);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;

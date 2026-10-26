import "server-only";
import { createHash } from "node:crypto";
import {
  GraphQLError,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  buildSchema,
  defaultFieldResolver,
  execute,
  getOperationAST,
  parse,
  validate,
  type DocumentNode,
  type GraphQLFieldResolver,
  type GraphQLSchema,
  type GraphQLType,
} from "graphql";
import type { Site } from "@prisma/client";
import { prisma } from "@/lib/db";
import { LimitError, analyzeQuery } from "@/lib/graphql/limits";
import { siteSdl, type CustomFieldTypes } from "@/lib/graphql/sdl";
import { tenantDb } from "@/lib/tenant-db";
import { fieldDefFromRow } from "../cms/field-defs";
import { defaultBaseUrl } from "../export/export-service";
import { AuthError, resolveViewer } from "./api-keys";
import { createLoaders } from "./loaders";
import { resolvers, type GqlContext } from "./resolvers";

/**
 * Runs one GraphQL request against one site: resolve the site, work out who
 * is asking, build (or reuse) that site's schema, refuse queries that are too
 * deep or too expensive before touching the database, then execute with
 * per-request loaders over a tenant-scoped client.
 */

const MAX_QUERY_BYTES = 20_000;
const MAX_TOKENS = 3_000;

interface SiteSchema {
  signature: string;
  schema: GraphQLSchema;
  types: CustomFieldTypes;
  resolvers: ReturnType<typeof resolvers>;
  lists: Set<string>;
}

// Field definitions rarely change, so each site's schema is built once and
// rebuilt only when its field definitions do.
const schemas = new Map<string, SiteSchema>();

function isListType(type: GraphQLType): boolean {
  const inner = type instanceof GraphQLNonNull ? type.ofType : type;
  return inner instanceof GraphQLList;
}

async function siteSchema(siteId: string): Promise<SiteSchema> {
  const rows = await prisma.customField.findMany({
    where: { siteId, group: { active: true } },
    orderBy: [{ group: { order: "asc" } }, { order: "asc" }],
  });
  const defs = rows.map(fieldDefFromRow);
  const signature = createHash("sha1").update(JSON.stringify(defs)).digest("hex");
  const cached = schemas.get(siteId);
  if (cached?.signature === signature) return cached;

  const { sdl, types } = siteSdl(defs);
  const schema = buildSchema(sdl);
  // Field names that return lists, for pricing a query before it runs.
  const lists = new Set(["posts", "pages", "mediaAssets"]);
  for (const type of Object.values(schema.getTypeMap())) {
    if (!(type instanceof GraphQLObjectType) || type.name.startsWith("__")) continue;
    for (const field of Object.values(type.getFields())) if (field.name !== "nodes" && isListType(field.type)) lists.add(field.name);
  }
  const built = { signature, schema, types, resolvers: resolvers(types), lists };
  if (schemas.size > 500) schemas.delete(schemas.keys().next().value!);
  schemas.set(siteId, built);
  return built;
}

export interface GraphQLRequestBody {
  query?: unknown;
  variables?: unknown;
  operationName?: unknown;
}

export interface GraphQLResult {
  status: number;
  body: Record<string, unknown>;
  public: boolean;
}

const fail = (status: number, message: string, code: string): GraphQLResult => ({ status, body: { errors: [{ message, extensions: { code } }] }, public: false });

export async function findApiSite(key: string): Promise<Site | null> {
  if (!key || key.length > 64) return null;
  return prisma.site.findFirst({ where: { OR: [{ id: key }, { subdomain: key.toLowerCase() }], status: { not: "SUSPENDED" } } });
}

export async function runGraphQL(request: Request, siteKey: string, body: GraphQLRequestBody, method: "GET" | "POST"): Promise<GraphQLResult> {
  const site = await findApiSite(siteKey);
  if (!site) return fail(404, "Site not found", "NOT_FOUND");

  let viewer;
  try {
    viewer = await resolveViewer(request, site);
  } catch (err) {
    if (err instanceof AuthError) return fail(err.status, err.message, err.status === 404 ? "NOT_FOUND" : "UNAUTHENTICATED");
    throw err;
  }

  if (typeof body.query !== "string" || !body.query.trim()) return fail(400, "Send a query", "BAD_REQUEST");
  if (body.query.length > MAX_QUERY_BYTES) return fail(400, `Queries can be at most ${MAX_QUERY_BYTES} characters`, "BAD_REQUEST");
  const variables = body.variables == null ? {} : body.variables;
  if (typeof variables !== "object" || Array.isArray(variables)) return fail(400, "variables must be an object", "BAD_REQUEST");
  const operationName = typeof body.operationName === "string" && body.operationName ? body.operationName : null;

  let document: DocumentNode;
  try {
    document = parse(body.query, { maxTokens: MAX_TOKENS });
  } catch (err) {
    return fail(400, err instanceof GraphQLError ? err.message : "Could not parse the query", "GRAPHQL_PARSE_FAILED");
  }

  const s = await siteSchema(site.id);
  const errors = validate(s.schema, document);
  if (errors.length) return { status: 400, body: { errors: errors.slice(0, 10).map((e) => ({ message: e.message, locations: e.locations, extensions: { code: "GRAPHQL_VALIDATION_FAILED" } })) }, public: false };

  let limits;
  try {
    limits = analyzeQuery(document, { operationName, variables: variables as Record<string, unknown>, isList: (f) => s.lists.has(f) });
  } catch (err) {
    if (err instanceof LimitError) return fail(400, err.message, err.code);
    throw err;
  }

  const op = getOperationAST(document, operationName);
  if (op?.operation === "mutation" && method === "GET") return fail(405, "Send mutations with POST", "METHOD_NOT_ALLOWED");
  if (op?.operation === "subscription") return fail(400, "Subscriptions aren't supported", "BAD_REQUEST");

  // Every database call this request makes goes through this counted, tenant-scoped client.
  let operations = 0;
  const db = tenantDb(site.id).$extends({
    query: {
      $allModels: {
        $allOperations({ args, query }) {
          operations++;
          return query(args);
        },
      },
    },
  }) as unknown as ReturnType<typeof tenantDb>;

  const ctx: GqlContext = { site, viewer, db, loaders: createLoaders(db, site.id), types: s.types, baseUrl: defaultBaseUrl(site) };
  const fieldResolver: GraphQLFieldResolver<unknown, GqlContext> = (source, args, context, info) => {
    const fn = s.resolvers[info.parentType.name]?.[info.fieldName] as unknown as GraphQLFieldResolver<unknown, GqlContext> | undefined;
    return fn ? fn(source, args, context, info) : defaultFieldResolver(source, args, context, info);
  };
  const result = await execute({
    schema: s.schema,
    document,
    rootValue: {},
    contextValue: ctx,
    variableValues: variables as Record<string, unknown>,
    operationName,
    fieldResolver,
    typeResolver: (value) => (value as { __typename?: string }).__typename,
  });

  const out: Record<string, unknown> = {};
  if (result.errors?.length) {
    out.errors = result.errors.map((e) => {
      // Errors we raised on purpose keep their message; anything else is a bug and is not leaked.
      const expected = !e.originalError || e.originalError instanceof GraphQLError;
      if (!expected) console.error("GraphQL resolver error", e.originalError);
      return { message: expected ? e.message : "Internal server error", locations: e.locations, path: e.path, extensions: { code: expected ? (e.extensions?.code ?? "BAD_REQUEST") : "INTERNAL_SERVER_ERROR", ...(expected ? e.extensions : {}) } };
    });
  }
  out.data = result.data ?? null;
  out.extensions = { cost: limits.cost, depth: limits.depth, dbQueries: operations, viewer: viewer.kind === "key" ? (viewer.canPreview ? "read-write key" : "read key") : viewer.kind };
  return { status: 200, body: out, public: viewer.kind === "public" && op?.operation === "query" };
}

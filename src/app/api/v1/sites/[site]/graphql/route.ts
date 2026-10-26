import { NextResponse } from "next/server";
import { runGraphQL, type GraphQLRequestBody } from "@/server/graphql/handler";

/**
 * Headless GraphQL API for one site: /api/v1/sites/<site id or subdomain>/graphql.
 * POST { query, variables, operationName }, or GET ?query=… for cacheable
 * public reads. Keys go in `Authorization: Bearer wbk_…`. CORS is open, but
 * never with credentials, so a signed-in editor's cookie only works from the
 * platform's own pages (the Developer playground).
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, x-api-key",
  "Access-Control-Max-Age": "86400",
};

function respond(result: Awaited<ReturnType<typeof runGraphQL>>) {
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { ...CORS, "Cache-Control": result.public ? "public, max-age=30, stale-while-revalidate=120" : "private, no-store", Vary: "Authorization, X-API-Key, Cookie" },
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/v1/sites/[site]/graphql">) {
  const { site } = await ctx.params;
  let body: GraphQLRequestBody;
  try {
    body = (await request.json()) as GraphQLRequestBody;
  } catch {
    return respond({ status: 400, body: { errors: [{ message: "Send a JSON body: { query, variables }", extensions: { code: "BAD_REQUEST" } }] }, public: false });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return respond({ status: 400, body: { errors: [{ message: "Batched requests aren't supported; send one operation", extensions: { code: "BAD_REQUEST" } }] }, public: false });
  }
  return respond(await runGraphQL(request, site, body, "POST"));
}

export async function GET(request: Request, ctx: RouteContext<"/api/v1/sites/[site]/graphql">) {
  const { site } = await ctx.params;
  const params = new URL(request.url).searchParams;
  let variables: unknown = undefined;
  try {
    variables = params.get("variables") ? JSON.parse(params.get("variables")!) : undefined;
  } catch {
    return respond({ status: 400, body: { errors: [{ message: "variables must be JSON", extensions: { code: "BAD_REQUEST" } }] }, public: false });
  }
  return respond(await runGraphQL(request, site, { query: params.get("query") ?? undefined, variables, operationName: params.get("operationName") }, "GET"));
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

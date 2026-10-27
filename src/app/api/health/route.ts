import { connection } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Liveness for load balancers and the Docker HEALTHCHECK: 200 when the server
 * can reach the database, 503 when it can't. Deliberately says nothing else;
 * the full report is /admin/system/health, for platform admins.
 */
export async function GET() {
  await connection();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

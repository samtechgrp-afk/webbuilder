import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { promoteScheduled } from "@/server/cms/entries";
import { siteCacheTag } from "@/server/public-site";

/**
 * Publishes scheduled entries whose time has come, across all sites. Call it
 * every minute from a scheduler (vercel.json has the cron) with
 * `Authorization: Bearer $CRON_SECRET`. Without a secret it only runs in
 * development.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret ? auth !== `Bearer ${secret}` : process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sites = await promoteScheduled(prisma);
  for (const siteId of sites) revalidateTag(siteCacheTag(siteId), { expire: 0 });
  return NextResponse.json({ published: sites.length });
}

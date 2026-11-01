import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { MAX_FONT_BYTES } from "@/lib/design/fonts";
import { getTenant } from "@/lib/tenant";
import { EditError } from "@/server/content-service";
import { listFonts, uploadFont } from "@/server/design/font-service";
import { siteCacheTag } from "@/server/public-site";

/**
 * Font file upload for the font manager. Same storage as media (Cloudflare
 * R2 in production, under <siteId>/fonts/); the format is sniffed from the
 * file itself, and the family, weight and style are read from the font's own
 * tables unless the form overrides them. Designers only (`design.tokens`).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/sites/[siteId]/fonts">) {
  const { siteId } = await ctx.params;
  const t = await getTenant(siteId);
  if (!t.can("design.tokens")) return NextResponse.json({ error: "Only designers can add fonts to this site" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_FONT_BYTES) return NextResponse.json({ error: `Font files must be under ${MAX_FONT_BYTES / 1024 / 1024} MB` }, { status: 413 });
  const text = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : null;
  };

  try {
    const font = await uploadFont(t, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      fileName: file.name || "font",
      family: text("family"),
      weight: text("weight"),
      style: text("style"),
      fallback: text("fallback"),
    });
    revalidateTag(siteCacheTag(t.site.id), { expire: 0 });
    return NextResponse.json({ font, fonts: await listFonts(t) });
  } catch (err) {
    if (err instanceof EditError) return NextResponse.json({ error: err.message }, { status: 422 });
    console.error("Font upload failed", err);
    return NextResponse.json({ error: "That font couldn't be stored. Try again." }, { status: 500 });
  }
}

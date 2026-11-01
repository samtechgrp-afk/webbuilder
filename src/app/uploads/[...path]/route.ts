import path from "node:path";
import { getEnv } from "@/lib/env.mjs";
import { FONT_EXTENSIONS, FONT_MIME } from "@/lib/design/fonts";
import { FILE_KINDS, PRIVATE_PREFIX, mediaStorage } from "@/server/media-processing";

/**
 * Serves media written after the server started. `next start` only serves
 * the public/ files that existed at boot, so uploads (and sites created from
 * templates) would 404 until a restart; files present at boot are still
 * served by Next directly and never reach this handler. With
 * STORAGE_DRIVER=s3 every upload comes through here: streamed from the bucket,
 * or redirected to S3_PUBLIC_URL (a CDN or public bucket) when that's set.
 * Names are random UUIDs, so responses can be cached forever. The nosniff and
 * SVG sandbox headers from next.config apply here too.
 *
 * Fonts are always streamed, never redirected: browsers fetch @font-face
 * files in CORS mode, and a public bucket (r2.dev) sends no CORS headers,
 * so a redirect would silently drop the font. They're served with
 * Access-Control-Allow-Origin so custom domains and static exports can use them.
 */

const TYPES: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
  ...Object.fromEntries(Object.entries(FILE_KINDS).map(([mime, k]) => [k.ext, mime])),
  ...Object.fromEntries(Object.entries(FONT_EXTENSIONS).map(([ext, format]) => [ext, FONT_MIME[format]])),
};

const root = () => path.join(process.cwd(), "public", "uploads");

export async function GET(_req: Request, { params }: RouteContext<"/uploads/[...path]">) {
  const parts = (await params).path;
  const file = path.resolve(root(), ...parts);
  const type = TYPES[path.extname(file).slice(1).toLowerCase()];
  if (!type || !file.startsWith(root() + path.sep)) return new Response("Not found", { status: 404 });
  const key = path.relative(root(), file).split(path.sep).join("/");
  // Form attachments live under private/ and are only served to admins, through their own route.
  if (key.startsWith(PRIVATE_PREFIX)) return new Response("Not found", { status: 404 });
  const env = getEnv();
  const font = type.startsWith("font/");
  if (env.STORAGE_DRIVER === "s3" && env.S3_PUBLIC_URL && !font) {
    return Response.redirect(`${env.S3_PUBLIC_URL.replace(/\/+$/, "")}/${key}`, 308);
  }
  try {
    const object = await mediaStorage().get?.(key);
    if (!object) return new Response("Not found", { status: 404 });
    return new Response(object.body as Uint8Array<ArrayBuffer>, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(object.body.byteLength),
        "Cache-Control": "public, max-age=31536000, immutable",
        ...(font ? { "Access-Control-Allow-Origin": "*" } : {}),
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

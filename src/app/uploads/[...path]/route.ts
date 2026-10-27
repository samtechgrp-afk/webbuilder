import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { FILE_KINDS } from "@/server/media-processing";

/**
 * Serves media written after the server started. `next start` only serves
 * the public/ files that existed at boot, so uploads (and sites created from
 * templates) would 404 until a restart; files present at boot are still
 * served by Next directly and never reach this handler. Names are random
 * UUIDs, so responses can be cached forever. The nosniff and SVG sandbox
 * headers from next.config apply here too.
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
};

const root = () => path.join(process.cwd(), "public", "uploads");

export async function GET(_req: Request, { params }: RouteContext<"/uploads/[...path]">) {
  const parts = (await params).path;
  const file = path.resolve(root(), ...parts);
  const type = TYPES[path.extname(file).slice(1).toLowerCase()];
  if (!type || !file.startsWith(root() + path.sep)) return new Response("Not found", { status: 404 });
  try {
    const info = await stat(file);
    if (!info.isFile()) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(await readFile(file)), {
      headers: { "Content-Type": type, "Content-Length": String(info.size), "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

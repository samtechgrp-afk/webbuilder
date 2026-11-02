/**
 * Runs after `next build`: drops TRACE_EXCLUDES from the instrumentation and
 * proxy (middleware) traces. `outputFileTracingExcludes` only reaches page and
 * route traces, but Vercel adds the instrumentation trace to every function,
 * so without this each function still carries Prisma's unused engines.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { TRACE_EXCLUDES } from "./trace-excludes.mjs";

const root = process.cwd();
const traces = [".next/server/instrumentation.js.nft.json", ".next/server/middleware.js.nft.json"];

for (const rel of traces) {
  const file = path.join(root, rel);
  let trace;
  try {
    trace = JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if (err?.code === "ENOENT") continue;
    throw err;
  }
  const dir = path.dirname(file);
  const kept = trace.files.filter((f) => {
    const fromRoot = path.relative(root, path.resolve(dir, f)).split(path.sep).join("/");
    return !TRACE_EXCLUDES.some((glob) => path.matchesGlob(fromRoot, glob));
  });
  if (kept.length !== trace.files.length) {
    await writeFile(file, JSON.stringify({ ...trace, files: kept }));
    console.log(`prune-traces: ${rel} ${trace.files.length} → ${kept.length} files`);
  }
}

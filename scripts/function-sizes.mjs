/**
 * Reports the size of each Vercel Function in a local `vercel build` output,
 * the way Vercel stores them: the files in the .func folder plus every file
 * its .vc-config.json filePathMap pulls from the project.
 *
 *   vercel build --yes && node scripts/function-sizes.mjs
 */
import fs from "node:fs";
import path from "node:path";

const repo = process.cwd();
const root = path.join(repo, ".vercel/output/functions");
if (!fs.existsSync(root)) {
  console.error("No .vercel/output/functions here. Run `vercel build --yes` first.");
  process.exit(1);
}

const funcDirs = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.name.endsWith(".func")) funcDirs.push(p);
    else if (e.isDirectory()) walk(p);
  }
})(root);

const ownFiles = (dir, acc) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (fs.statSync(p).isDirectory()) ownFiles(p, acc);
    else acc.set(p, fs.statSync(p).size);
  }
  return acc;
};
const pkgOf = (p) => p.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1] ?? (p.includes("/.next/") ? ".next" : "(app)");

// Routes with the same config share one function (the .func folders are symlinks to it).
const functions = new Map();
for (const dir of funcDirs) {
  const real = fs.realpathSync(dir);
  if (!functions.has(real)) {
    const files = ownFiles(real, new Map());
    const { filePathMap = {} } = JSON.parse(fs.readFileSync(path.join(real, ".vc-config.json"), "utf8"));
    for (const src of Object.values(filePathMap)) {
      const p = path.resolve(repo, src);
      if (fs.existsSync(p)) files.set(p, fs.statSync(p).size);
    }
    const byPkg = new Map();
    let bytes = 0;
    for (const [p, b] of files) {
      bytes += b;
      byPkg.set(pkgOf(p), (byPkg.get(pkgOf(p)) ?? 0) + b);
    }
    functions.set(real, { name: path.relative(root, real), routes: 0, bytes, byPkg });
  }
  functions.get(real).routes++;
}

const mb = (b) => `${(b / 1e6).toFixed(1)} MB`;
const rows = [...functions.values()].sort((a, b) => b.bytes - a.bytes);
for (const f of rows) {
  const top = [...f.byPkg].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${mb(v)}`).join(", ");
  console.log(`${mb(f.bytes).padStart(9)}  ${String(f.routes).padStart(3)} routes  ${f.name}\n           ${top}`);
}
console.log(`\n${rows.length} functions, ${mb(rows.reduce((s, f) => s + f.bytes, 0))} in total`);

# Server bundle size

Vercel stores every function's files separately, so anything the build tracer
copies into a function is paid for in each one. Measure with a local Vercel
build:

```sh
vercel build --yes          # needs .vercel/project.json; see below
node scripts/function-sizes.mjs
```

For a local build without linking the project, create
`.vercel/project.json` with
`{"projectId":"prj_local","orgId":"team_local","settings":{"framework":"nextjs"}}`
and load `.env` into the shell first (`vercel build` runs `vercel-build`, which
migrates the database in `DATABASE_URL`).

## What we keep out of the functions

`scripts/trace-excludes.mjs` lists files the tracer picks up that the server
can never load:

- **Prisma engines for other targets.** The server uses the Node-API library
  engine (`runtime/library.js` and `libquery_engine-*.so.node`). The wasm
  engines and query compilers for five databases, plus the edge, react-native
  and binary runtimes, were ~62 MB per function.
- **sharp builds for other platforms.** Vercel and the Docker image are glibc
  x64; npm also installs the musl and WebAssembly builds (~29 MB).

`next.config.ts` passes the list to `outputFileTracingExcludes`, which covers
page and route traces. Next doesn't apply it to the instrumentation and proxy
traces, and Vercel adds the instrumentation trace to every function, so
`scripts/prune-traces.mjs` filters those two after `next build` (it's part of
`npm run build`, and `vercel-build` calls `npm run build`).

When upgrading Prisma or sharp, rerun the measurement and an e2e suite against
a standalone build to make sure nothing the server loads was excluded.

## Loaded on demand

These modules are imported inside the code path that needs them rather than at
the top of the file, so functions that only import the module don't load them
at boot:

- `jsdom` + DOMPurify (`src/server/sanitize.ts`): only when rich text or an SVG
  is sanitised. `sanitizeRichText`, `sanitizeSvg` and `sanitizeValue` are async.
- `sharp` (`src/server/media-processing.ts`): only when an image is processed.
- `fflate` (`src/server/export/export-service.ts`): only while an export runs.

## Measurements (2026-11-02, Next 16.4.3, Prisma 6.19)

| Function (routes)               | Before   | After   |
| ------------------------------- | -------- | ------- |
| Pages (222)                     | 141.8 MB | 51.0 MB |
| API and route handlers (48)     | 139.2 MB | 48.5 MB |
| favicon (3)                     | 83.3 MB  | 21.2 MB |
| Proxy / middleware (1)          | 81.4 MB  | 19.3 MB |
| **Total**                       | **445.6 MB** | **139.9 MB** |

The remaining weight is what the server really loads: the Prisma library
engine (17.8 MB), libvips for sharp (18.7 MB) and jsdom. Routes are grouped
into a few functions, so a module any route in a group traces (sharp is used by
uploads, fonts and the template seeder) is stored once per group, not once per
route.

/**
 * Files the build tracer copies into server functions that the Node.js server
 * can never load. Vercel stores every function separately (per region), so
 * these used to cost ~110 MB in each one; docs/bundle-size.md has the numbers.
 *
 * Used twice: next.config.ts passes them to `outputFileTracingExcludes` (page
 * and route traces), and scripts/prune-traces.mjs applies them after
 * `next build` to the instrumentation and proxy traces, which Next doesn't
 * filter but which every function includes.
 */
export const TRACE_EXCLUDES = [
  // Prisma: the server runs the Node-API library engine (runtime/library.js +
  // .prisma/client/libquery_engine-*.so.node). The wasm engines and compilers
  // for every database, and the edge, react-native and binary runtimes, are for
  // other deployment targets.
  "node_modules/@prisma/client/runtime/{query_engine_bg,query_compiler_bg}.*",
  "node_modules/@prisma/client/runtime/{wasm-engine-edge,wasm-compiler-edge,edge,edge-esm,react-native,binary,client,index-browser}.*",
  "node_modules/@prisma/client/runtime/*.{map,d.ts,d.mts}",
  "node_modules/.prisma/client/{edge.js,wasm.js,index-browser.js,query_engine_bg.*,wasm-*-loader.mjs,*.d.ts}",
  // sharp: Vercel and the Docker image (bookworm) are glibc x64. npm installs
  // the musl and WebAssembly builds alongside it as fallbacks.
  "node_modules/@img/sharp-libvips-linuxmusl-*/**",
  "node_modules/@img/sharp-linuxmusl-*/**",
  "node_modules/@img/sharp-wasm32/**",
];

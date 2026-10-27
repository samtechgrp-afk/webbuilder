import type { NextConfig } from "next";
import { assertEnv } from "./src/lib/env.mjs";

// Stop `next dev` / `next build` on a broken configuration (SKIP_ENV_VALIDATION=1 skips it for image builds).
assertEnv({ quiet: true });

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The Docker image runs the self-contained server from .next/standalone.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // The health page compares applied migrations with the ones this build ships.
  outputFileTracingIncludes: { "/admin/system/health": ["./prisma/migrations/**/*"] },
  // DOMPurify needs a real DOM on the server.
  serverExternalPackages: ["jsdom"],
  async headers() {
    return [
      {
        // Sanitised on upload; served sandboxed anyway so an SVG opened directly can never run script.
        source: "/uploads/:path*.svg",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      { source: "/uploads/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }] },
    ];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

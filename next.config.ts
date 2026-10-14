import type { NextConfig } from "next";
import path from "node:path";

/**
 * Security headers sent on every response. Deliberately non-breaking: the root layout runs an inline theme
 * script and Next injects inline hydration scripts, so a script-src CSP would need per-request nonces from
 * the proxy. Until then the CSP only locks down framing, plugins and <base>; fonts are self-hosted by
 * next/font at build time, so no Google Fonts hosts are needed.
 */
const SECURITY_HEADERS = [
  // Browsers ignore HSTS over plain http, so this is harmless in local dev.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  // Every page reads live data from the local database, so nothing is prerendered or cached.
  cacheComponents: false,
  // Lets a second dev server (for example an isolated test instance) run beside the main one.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // A self-contained server (<distDir>/standalone/server.js) with only the traced node_modules, for the Docker image.
  output: "standalone",
  // Trace from this project, not a parent folder that happens to hold another lockfile.
  outputFileTracingRoot: path.resolve(process.cwd()),
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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

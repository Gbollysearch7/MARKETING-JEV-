import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads live data from the local database, so nothing is prerendered or cached.
  cacheComponents: false,
  // Lets a second dev server (for example an isolated test instance) run beside the main one.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ["better-sqlite3"],
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

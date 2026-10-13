import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads live data from the local database, so nothing is prerendered or cached.
  cacheComponents: false,
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

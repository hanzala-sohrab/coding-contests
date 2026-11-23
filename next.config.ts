import type { NextConfig } from "next";

// Cache Components is off: nearly every page is per-user and live (contest
// clock, verdicts, leaderboard), so request-time rendering is the right default.
const nextConfig: NextConfig = {
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

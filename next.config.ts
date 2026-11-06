import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: {
    // tells saved exercise thumbnails apart between deploys
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
  },
  experimental: {
    // Every screen draws from the app's own data, not from the server, so a screen already fetched
    // can be reused: going back to it is instant.
    staleTimes: { dynamic: 300, static: 3600 },
  },
};

export default nextConfig;

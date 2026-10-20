import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables forbidden() / unauthorized() and their forbidden.tsx / unauthorized.tsx files.
  experimental: { authInterrupts: true, optimizePackageImports: ["@mui/material", "@mui/icons-material"] },
  poweredByHeader: false,
};

export default nextConfig;

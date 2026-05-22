import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Groundhog packages are local file links because this workspace cannot rely on npm registry access.
  // Keep them external so Node resolves the local symlinks at runtime instead of Turbopack bundling them.
  experimental: {
    externalDir: true,
  },
  serverExternalPackages: [
    "@groundhogchain/client",
    "@groundhogchain/contract-spec",
    "@groundhogchain/gateway",
    "@groundhogchain/protocol",
    "@groundhogchain/xdr",
  ],
};

export default nextConfig;

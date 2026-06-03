import path from "node:path";

import type { NextConfig } from "next";

const groundhogPackages = [
  "@groundhogchain/client",
  "@groundhogchain/contract-spec",
  "@groundhogchain/gateway",
  "@groundhogchain/protocol",
  "@groundhogchain/xdr",
];

const nextConfig: NextConfig = {
  transpilePackages: groundhogPackages,
  turbopack: {
    root: path.join(process.cwd(), ".."),
  },
};

export default nextConfig;

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
};

export default nextConfig;

import type { NextConfig } from "next";

const groundhogPackages = [
  "@groundhogchain/client",
  "@groundhogchain/contract-spec",
  "@groundhogchain/protocol",
  "@groundhogchain/xdr",
];

const nextConfig: NextConfig = {
  transpilePackages: groundhogPackages,
};

export default nextConfig;

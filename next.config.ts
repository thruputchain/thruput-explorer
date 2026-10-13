import type { NextConfig } from "next";

const groundhogPackages = [
  "@thruputchain/client",
  "@thruputchain/contract-spec",
  "@thruputchain/protocol",
  "@thruputchain/xdr",
];

const nextConfig: NextConfig = {
  transpilePackages: groundhogPackages,
};

export default nextConfig;

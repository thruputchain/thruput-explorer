import type { NextConfig } from "next";

const thruputPackages = [
  "@thruputchain/client",
  "@thruputchain/contract-spec",
  "@thruputchain/protocol",
  "@thruputchain/xdr",
];

const nextConfig: NextConfig = {
  transpilePackages: thruputPackages,
};

export default nextConfig;

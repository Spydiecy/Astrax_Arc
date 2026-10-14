import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // We run `tsc`/editor diagnostics separately; don't block builds on types.
    ignoreBuildErrors: true,
  },
  // solc-js (the Solidity compiler behind deployContract) is loaded at runtime
  // instead of being bundled by webpack.
  serverExternalPackages: ["solc"],
  // Contracts may import OpenZeppelin; ship its .sol sources with the agent route
  // (they're read from disk at compile time, so file tracing can't see them).
  outputFileTracingIncludes: {
    "/api/agent": ["./node_modules/@openzeppelin/contracts/**/*.sol"],
  },
}

export default nextConfig

import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // We run `tsc`/editor diagnostics separately; don't block builds on types.
    ignoreBuildErrors: true,
  },
}

export default nextConfig

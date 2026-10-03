import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // We run `tsc`/editor diagnostics separately; don't block builds on types.
    ignoreBuildErrors: true,
  },
  // Load the Solidity compiler at runtime from node_modules instead of bundling it.
  serverExternalPackages: ["solc"],
  webpack: (config, { webpack }) => {
    // RainbowKit → wagmi connectors → @coinbase/cdp-sdk / @base-org/account pull in
    // optional @x402/* payment packages that aren't installed and aren't used by Astrax.
    // Ignore the whole namespace so webpack doesn't fail resolving them.
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^@x402\// }))
    return config
  },
}

export default nextConfig

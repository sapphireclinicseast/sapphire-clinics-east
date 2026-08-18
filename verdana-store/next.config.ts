import type { NextConfig } from 'next'
import { resolve } from 'path'

const nextConfig: NextConfig = {
  // googleapis is a large CJS package that must not be bundled into the
  // server build — Gmail sending pulls it in.
  serverExternalPackages: ['googleapis'],
  turbopack: {
    root: resolve(import.meta.dirname ?? '.'),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  // Admin upload routes (catalog, sales invoices) live under /api/admin/* and pass
  // through the auth middleware, which buffers the request body with a 10MB default
  // cap. Raise it so large PDF uploads aren't truncated. (Renamed proxy* in newer
  // Next; both keys set for forward-compat.)
  experimental: {
    proxyClientMaxBodySize: '60mb',
  } as unknown as NextConfig['experimental'],
}

export default nextConfig

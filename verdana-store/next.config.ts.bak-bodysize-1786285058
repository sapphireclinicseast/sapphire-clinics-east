import type { NextConfig } from 'next'
import { resolve } from 'path'

const nextConfig: NextConfig = {
  turbopack: {
    root: resolve(import.meta.dirname ?? '.'),
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
}

export default nextConfig

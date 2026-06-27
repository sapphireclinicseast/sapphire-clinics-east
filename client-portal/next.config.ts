import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone',
  experimental: {},
  env: {
    NEXT_PUBLIC_MARKETING_URL: process.env.MARKETING_URL ?? 'https://operations.sapphireclinicseast.org',
  },
}

export default config

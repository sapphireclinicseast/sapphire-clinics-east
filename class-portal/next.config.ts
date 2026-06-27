import type { NextConfig } from 'next'
import path from 'path'

const config: NextConfig = {
  output: 'standalone',
  // Lock the Next/Turbopack project root to this folder so dev mode does not
  // walk up the worktree and accidentally pull in the marketing app's
  // instrumentation.ts (which connects to Postgres).
  outputFileTracingRoot: path.resolve(__dirname),
  turbopack: {
    root: path.resolve(__dirname),
  },
  experimental: {},
  env: {
    NEXT_PUBLIC_MARKETING_URL: process.env.MARKETING_URL ?? 'https://operations.sapphireclinicseast.org',
  },
}

export default config

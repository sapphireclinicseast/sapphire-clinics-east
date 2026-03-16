import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: {
      bodySizeLimit: '200mb', // Allow large video uploads (.mov, .mp4)
    },
    proxyClientMaxBodySize: '200mb', // Raise Next.js internal Route Handler body limit (default 10MB)
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'graph.facebook.com' },
      { protocol: 'https', hostname: 'scontent.cdninstagram.com' },
      { protocol: 'https', hostname: '*.fbcdn.net' },
    ],
  },
  serverExternalPackages: ['bcryptjs', 'canvas', 'sharp', '@anthropic-ai/sdk'],

  // ── Security headers ─────────────────────────────────────────────────────
  // This is an internal tool — prevent indexing, framing, and data leakage
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Block all search engine indexing and archiving
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate' },
          // Prevent embedding in iframes (clickjacking protection)
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME-type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Don't send referrer information to external sites
          { key: 'Referrer-Policy', value: 'no-referrer' },
          // Force HTTPS for 2 years
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // Restrict what browsers can do
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          // Prevent XSS via content scripts
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ]
  },
}

export default nextConfig

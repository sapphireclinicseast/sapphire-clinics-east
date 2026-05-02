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
  serverExternalPackages: ['bcryptjs', 'canvas', 'sharp', '@anthropic-ai/sdk', '@prisma/client', '@prisma/adapter-pg', '.prisma/client'],

  // ── Security headers ─────────────────────────────────────────────────────
  // This is an internal tool — prevent indexing, framing, and data leakage
  async headers() {
    const securityHeaders = [
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
    ]
    return [
      {
        // Apply security headers to all routes EXCEPT /api/uploads (must be publicly
        // fetchable by Meta's servers for Facebook/Instagram image posting)
        source: '/((?!api/uploads).*)',
        headers: securityHeaders,
      },
      {
        // Uploaded media: allow Meta's servers to fetch without restrictive headers
        source: '/api/uploads/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },

  // ── Host-based rewrites ──────────────────────────────────────────────────
  // The Scheduling Hub lives at schedules.sapphireclinicseast.org and uses
  // path-only URLs like /sbea/ot. Internally those map to /schedules/sbea/ot.
  // Using next.config rewrites (rather than middleware NextResponse.rewrite)
  // ensures the Next.js client router knows the matched-path and doesn't
  // re-resolve the URL bar against the file-system routes (which would
  // trigger the global notFound boundary).
  async rewrites() {
    return {
      beforeFiles: [
        // schedules.sapphireclinicseast.org/(/.../):* → /schedules/...
        {
          source: '/',
          has: [{ type: 'host', value: 'schedules.sapphireclinicseast.org' }],
          destination: '/schedules',
        },
        {
          source: '/:branch/:dept',
          has: [{ type: 'host', value: 'schedules.sapphireclinicseast.org' }],
          destination: '/schedules/:branch/:dept',
        },
        // queue.sapphireclinicseast.org/* → /queue/*
        {
          source: '/',
          has: [{ type: 'host', value: 'queue.sapphireclinicseast.org' }],
          destination: '/queue',
        },
        {
          source: '/:path*',
          has: [{ type: 'host', value: 'queue.sapphireclinicseast.org' }],
          destination: '/queue/:path*',
        },
      ],
      afterFiles: [],
      fallback: [],
    }
  },
}

export default nextConfig

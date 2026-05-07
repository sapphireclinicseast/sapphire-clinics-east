import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['bcryptjs'],
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // img-src includes hr.sapphireclinicseast.org so seminar
          // speaker headshots (served by the HR hub at
          // /api/seminar-attachments/<file>) render in <img> tags on
          // the Seminars page. Without this, the browser silently
          // blocks the request and the user sees a broken-image
          // icon — no console error visible to a non-developer.
          // Same origin is also added for any future HR-hosted asset
          // we want to embed directly.
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://hr.sapphireclinicseast.org; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'" },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
        ],
      },
    ]
  },
}

export default nextConfig

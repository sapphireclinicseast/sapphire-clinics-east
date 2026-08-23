import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['bcryptjs'],
  // Allow building into a staging dir (e.g. .next.new) via NEXT_DIST_DIR so
  // self-heal/deploy rebuilds never overwrite the live .next in place. At
  // runtime the env var is unset, so `next start` serves from `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
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
          // media-src includes blob: so in-portal voice/video recordings can be
          // previewed (the recorder builds a blob: URL for the <audio>/<video>).
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://hr.sapphireclinicseast.org; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'" },
          // microphone=(self) so clinicians can record voice notes / video (video
          // recording needs the mic too). camera already allowed for same-origin.
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(), payment=()' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
        ],
      },
    ]
  },
}

export default nextConfig

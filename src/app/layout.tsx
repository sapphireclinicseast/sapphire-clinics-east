import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

// Self-hosted Google Fonts (byte-identical to the variable woff2
// next/font/google used to download at build time) so builds no longer
// depend on fonts.googleapis.com.
// next/font/local cannot express unicode-range, so each family is two faces:
// latin (preloaded) and latin-ext (₱ and other extended glyphs, fetched on
// demand), composed into one font stack in the same fallback order.
const montserratLatin = localFont({
  src: '../fonts/montserrat-latin.woff2',
  weight: '300 900',
})
const montserratLatinExt = localFont({
  src: '../fonts/montserrat-latin-ext.woff2',
  weight: '300 900',
  preload: false,
  adjustFontFallback: false,
})
const manropeLatin = localFont({
  src: '../fonts/manrope-latin.woff2',
  weight: '300 700',
})
const manropeLatinExt = localFont({
  src: '../fonts/manrope-latin-ext.woff2',
  weight: '300 700',
  preload: false,
  adjustFontFallback: false,
})

const stack = (latin: { style: { fontFamily: string } }, ext: { style: { fontFamily: string } }) => {
  const [family, ...fallbacks] = latin.style.fontFamily.split(', ')
  return [family, ext.style.fontFamily, ...fallbacks].join(', ')
}
const fontVars = {
  '--font-montserrat': stack(montserratLatin, montserratLatinExt),
  '--font-manrope': stack(manropeLatin, manropeLatinExt),
} as React.CSSProperties

export const metadata: Metadata = {
  title: 'OPERATIONS',
  description: 'SCEI Operations Hub — Sapphire Clinics East, Inc.',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/brand/mark-rainbow-narra-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/mark-rainbow-narra-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/brand/mark-rainbow-narra-180.png',
    shortcut: '/brand/mark-rainbow-narra-32.png',
  },
  openGraph: {
    title: 'SAPPHIRE Operations Hub',
    description: 'SCEI Internal Operations Hub — Sapphire Clinics East, Inc.',
    url: 'https://operations.sapphireclinicseast.org',
    siteName: 'SAPPHIRE Operations Hub',
    images: [
      {
        url: 'https://operations.sapphireclinicseast.org/brand/mark-rainbow-narra-512.png',
        width: 512,
        height: 512,
        alt: 'Sapphire Clinics East',
      },
    ],
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={fontVars}>
      <body className="antialiased">{children}</body>
    </html>
  )
}

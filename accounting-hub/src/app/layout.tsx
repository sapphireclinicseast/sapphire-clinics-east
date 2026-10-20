import type { Metadata } from 'next'
import localFont from 'next/font/local'
import Providers from '@/components/Providers'
import './globals.css'

// Self-hosted Google Fonts (Montserrat v31 / Manrope v20 variable woff2,
// byte-identical to the files next/font/google used to download at build
// time), so builds no longer depend on fonts.googleapis.com.
// next/font/local cannot express unicode-range, so each family is two faces:
// latin (preloaded) and latin-ext (₱ and other extended glyphs, fetched on
// demand), composed into one font stack in the same per-character fallback
// order the unicode-range rules gave.
const montserratLatin = localFont({
  src: '../fonts/montserrat-latin.woff2',
  weight: '300 800',
  display: 'swap',
})
const montserratLatinExt = localFont({
  src: '../fonts/montserrat-latin-ext.woff2',
  weight: '300 800',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
})
const manropeLatin = localFont({
  src: '../fonts/manrope-latin.woff2',
  weight: '300 800',
  display: 'swap',
})
const manropeLatinExt = localFont({
  src: '../fonts/manrope-latin-ext.woff2',
  weight: '300 800',
  display: 'swap',
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
  title: 'Accounting — Sapphire Clinics East Inc.',
  description: 'SCEI Internal Accounting Hub',
  openGraph: {
    title: 'Accounting — Sapphire Clinics East Inc.',
    description: 'SCEI Internal Accounting Hub',
    url: 'https://accounting.sapphireclinicseast.org',
    siteName: 'SAPPHIRE Accounting Hub',
  },
  robots: { index: false, follow: false },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" style={fontVars}>
      <body><Providers>{children}</Providers></body>
    </html>
  )
}

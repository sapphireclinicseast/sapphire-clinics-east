import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

// Brand fonts (post-2026 brand guide):
//   Montserrat — Display / Headlines / Wordmark / UI Buttons
//   Manrope    — Body / Long-form / Captions / Data
// Self-hosted (byte-identical to the variable woff2 next/font/google used to
// download at build time) so builds no longer depend on fonts.googleapis.com.
// next/font/local cannot express unicode-range, so each family is two faces:
// latin (preloaded) and latin-ext (₱ and other extended glyphs, fetched on
// demand), composed into one font stack in the same fallback order.
const montserratLatin = localFont({
  src: '../fonts/montserrat-latin.woff2',
  weight: '300 700',
  display: 'swap',
})
const montserratLatinExt = localFont({
  src: '../fonts/montserrat-latin-ext.woff2',
  weight: '300 700',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
})
const manropeLatin = localFont({
  src: '../fonts/manrope-latin.woff2',
  weight: '300 700',
  display: 'swap',
})
const manropeLatinExt = localFont({
  src: '../fonts/manrope-latin-ext.woff2',
  weight: '300 700',
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
  title: 'STAFF',
  description: 'Aura Health Rehab - Staff Portal',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" style={fontVars}>
      <body className="min-h-screen bg-[var(--paper)]">
        {children}
      </body>
    </html>
  )
}

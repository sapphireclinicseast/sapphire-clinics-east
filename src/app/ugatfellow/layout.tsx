import type { Metadata } from 'next'
import localFont from 'next/font/local'

// Self-hosted Google Fonts (byte-identical to the variable woff2
// next/font/google used to download at build time) so builds no longer
// depend on fonts.googleapis.com. The files are shared with the root layout
// under src/fonts/.
// next/font/local cannot express unicode-range, so each family is two faces:
// latin (preloaded) and latin-ext (₱ and other extended glyphs, fetched on
// demand), composed into one font stack in the same fallback order.
const montserratLatin = localFont({
  src: '../../fonts/montserrat-latin.woff2',
  weight: '400 900',
  display: 'swap',
})
const montserratLatinExt = localFont({
  src: '../../fonts/montserrat-latin-ext.woff2',
  weight: '400 900',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
})
const arimoLatin = localFont({
  src: '../../fonts/arimo-latin.woff2',
  weight: '400 700',
  display: 'swap',
})
const arimoLatinExt = localFont({
  src: '../../fonts/arimo-latin-ext.woff2',
  weight: '400 700',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
})

const stack = (latin: { style: { fontFamily: string } }, ext: { style: { fontFamily: string } }) => {
  const [family, ...fallbacks] = latin.style.fontFamily.split(', ')
  return [family, ext.style.fontFamily, ...fallbacks].join(', ')
}
const fontVars = {
  '--font-ugat-montserrat': stack(montserratLatin, montserratLatinExt),
  '--font-ugat-arimo': stack(arimoLatin, arimoLatinExt),
} as React.CSSProperties

const UGAT_URL = 'https://fellowship.sapphireclinicseast.org'
const OG_IMAGE = 'https://fellowship.sapphireclinicseast.org/ugat/og.png'
const DESCRIPTION =
  'The UGAT Fellowship Program provides a monthly stipend to Allied Health Professionals in their final year of university.'

export const metadata: Metadata = {
  title: 'UGAT Fellowship Program',
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  // Override the root Operations-Hub branding for link previews + the tab icon.
  icons: {
    icon: [
      { url: '/ugat/icon.png', type: 'image/png' },
      { url: '/ugat/ugat-mark.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/ugat/icon.png',
    apple: '/ugat/icon.png',
  },
  openGraph: {
    type: 'website',
    title: 'UGAT Fellowship Program',
    description: DESCRIPTION,
    siteName: 'UGAT Fellowship',
    url: UGAT_URL,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'UGAT Fellowship Program' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'UGAT Fellowship Program',
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
}

export default function UgatLayout({ children }: { children: React.ReactNode }) {
  return <div style={fontVars}>{children}</div>
}

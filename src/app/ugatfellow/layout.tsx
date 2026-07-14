import type { Metadata } from 'next'
import { Montserrat, Arimo } from 'next/font/google'

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-ugat-montserrat',
  weight: ['400', '500', '600', '700', '800', '900'],
  display: 'swap',
})

const arimo = Arimo({
  subsets: ['latin'],
  variable: '--font-ugat-arimo',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

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
  return <div className={`${montserrat.variable} ${arimo.variable}`}>{children}</div>
}

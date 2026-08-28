import type { Metadata } from 'next'
import { Comfortaa, Cormorant_Garamond, DM_Sans } from 'next/font/google'
import './globals.css'

const comfortaa = Comfortaa({
  subsets: ['latin'],
  variable: '--font-comfortaa',
  weight: ['300', '400', '500', '600', '700'],
})

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-cormorant',
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
})

export const metadata: Metadata = {
  title: 'SAPPHIRE Marketing Hub — Sapphire Clinics East',
  description: 'SCEI Internal Marketing Hub — Sapphire Clinics East, Inc.',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: '/brand/logo-reversed-teal-bg.png',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    title: 'SAPPHIRE Marketing Hub',
    description: 'SCEI Internal Marketing Hub — Sapphire Clinics East, Inc.',
    url: 'https://marketing.sapphireclinicseast.org',
    siteName: 'SAPPHIRE Marketing Hub',
    images: [
      {
        url: 'https://marketing.sapphireclinicseast.org/brand/logo-reversed-teal-bg.png',
        width: 440,
        height: 550,
        alt: 'Sapphire Clinics East',
      },
    ],
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${comfortaa.variable} ${cormorant.variable} ${dmSans.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  )
}

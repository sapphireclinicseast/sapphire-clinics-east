import type { Metadata } from 'next'
import { Montserrat, Manrope } from 'next/font/google'
import './globals.css'

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  weight: ['300', '400', '600', '700', '800', '900'],
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  weight: ['300', '400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'SAPPHIRE Marketing Hub — Sapphire Clinics East',
  description: 'SCEI Internal Marketing Hub — Sapphire Clinics East, Inc.',
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
    <html lang="en" className={`${montserrat.variable} ${manrope.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  )
}

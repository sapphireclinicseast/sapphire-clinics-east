import type { Metadata } from 'next'
import { Montserrat, Open_Sans } from 'next/font/google'
import './globals.css'

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  weight: ['300', '400', '600', '700', '800', '900'],
})

const openSans = Open_Sans({
  subsets: ['latin'],
  variable: '--font-open-sans',
  weight: ['300', '400', '600'],
  style: ['normal', 'italic'],
})

export const metadata: Metadata = {
  title: 'SAPPHIRE Marketing Hub — Sapphire Clinics East',
  description: 'SCEI Internal Marketing Hub — Sapphire Clinics East, Inc.',
  icons: {
    icon: '/brand/logo-reversed-teal-bg.png',
    apple: '/brand/logo-reversed-teal-bg.png',
    shortcut: '/brand/logo-reversed-teal-bg.png',
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
    <html lang="en" className={`${montserrat.variable} ${openSans.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  )
}

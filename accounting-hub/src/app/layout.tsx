import type { Metadata } from 'next'
import { Comfortaa, DM_Sans, Cormorant_Garamond } from 'next/font/google'
import Providers from '@/components/Providers'
import './globals.css'

const comfortaa = Comfortaa({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-comfortaa',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-cormorant',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SAPPHIRE Accounting Hub — Sapphire Clinics East',
  description: 'SCEI Internal Accounting Hub',
  openGraph: {
    title: 'SAPPHIRE Accounting Hub',
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
    <html lang="en" className={`${comfortaa.variable} ${dmSans.variable} ${cormorant.variable}`}>
      <body><Providers>{children}</Providers></body>
    </html>
  )
}

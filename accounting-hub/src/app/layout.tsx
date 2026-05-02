import type { Metadata } from 'next'
import { Montserrat, Manrope } from 'next/font/google'
import Providers from '@/components/Providers'
import './globals.css'

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-montserrat',
  display: 'swap',
})

const manrope = Manrope({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-manrope',
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
    <html lang="en" className={`${montserrat.variable} ${manrope.variable}`}>
      <body><Providers>{children}</Providers></body>
    </html>
  )
}

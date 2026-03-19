import type { Metadata } from 'next'
import { Montserrat, Open_Sans } from 'next/font/google'
import Providers from '@/components/Providers'
import './globals.css'

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
})

const openSans = Open_Sans({
  subsets: ['latin'],
  variable: '--font-open-sans',
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
    <html lang="en" className={`${montserrat.variable} ${openSans.variable}`}>
      <body><Providers>{children}</Providers></body>
    </html>
  )
}

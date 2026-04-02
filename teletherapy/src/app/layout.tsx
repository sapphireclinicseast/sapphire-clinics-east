import type { Metadata } from 'next'
import { Comfortaa, Cormorant_Garamond, DM_Sans } from 'next/font/google'
import './globals.css'

const comfortaa = Comfortaa({
  subsets: ['latin'],
  variable: '--font-comfortaa',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

const cormorantGaramond = Cormorant_Garamond({
  subsets: ['latin'],
  variable: '--font-cormorant',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SCEI Teletherapy',
  description: 'Sapphire Clinics East - Teletherapy Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${comfortaa.variable} ${cormorantGaramond.variable} ${dmSans.variable}`}>
      <body className="min-h-screen bg-[var(--off-white)]">
        {children}
      </body>
    </html>
  )
}

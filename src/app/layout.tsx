import type { Metadata } from 'next'
import { Montserrat, Manrope } from 'next/font/google'
import './globals.css'

// Brand fonts (post-2026 brand guide):
//   Montserrat — Display / Headlines / Wordmark / UI Buttons
//   Manrope    — Body / Long-form / Captions / Data
const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
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
    <html lang="en" className={`${montserrat.variable} ${manrope.variable}`}>
      <body className="min-h-screen bg-[var(--paper)]">
        {children}
      </body>
    </html>
  )
}

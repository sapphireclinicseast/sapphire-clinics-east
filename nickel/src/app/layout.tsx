import type { Metadata, Viewport } from 'next'
import { Pacifico, Inter } from 'next/font/google'
import './globals.css'

// Pacifico = the casual script wordmark (matches the Nickel logo). Inter = UI.
const pacifico = Pacifico({ subsets: ['latin'], weight: '400', variable: '--font-wordmark', display: 'swap' })
const inter = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' })

export const metadata: Metadata = {
  title: 'Nickel — Homecare therapy',
  description: 'Book a home therapy session with a licensed therapist near you. By Sapphire Clinics East, developed by Jara Universal OPC.',
  applicationName: 'Nickel',
}

export const viewport: Viewport = { themeColor: '#34618c' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${pacifico.variable} ${inter.variable}`}>
      <body style={{ fontFamily: 'var(--font-body)' }}>
        <header className="sticky top-0 z-40 border-b border-[color:var(--line)] bg-white/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <a href="/" className="text-[26px] leading-none text-[color:var(--slate)]" style={{ fontFamily: 'var(--font-wordmark)' }}>Nickel</a>
            <nav className="flex items-center gap-1 text-sm" style={{ fontFamily: 'var(--font-body)' }}>
              <a href="/signin" className="rounded-lg px-3 py-2 text-[color:var(--ink)] hover:bg-[color:var(--mist)]">Sign in</a>
              <a href="/book" className="btn-primary !px-4 !py-2 !text-[14px]">Book now</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-8 text-center text-[12px] text-[color:var(--muted)]">
          Nickel · Sapphire Clinics East Inc. · developed by Jara Universal OPC
        </footer>
      </body>
    </html>
  )
}

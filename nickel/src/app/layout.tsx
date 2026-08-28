import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Nickel', template: '%s · Nickel' },
  description: 'Book a home therapy session with a licensed therapist near you. By Sapphire Clinics East, developed by Jara Universal OPC.',
  applicationName: 'Nickel',
}

export const viewport: Viewport = { themeColor: '#34618c' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body style={{ fontFamily: 'var(--font-body)' }}>
        <header className="sticky top-0 z-40 border-b border-[color:var(--line)] bg-white/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <a href="/" className="flex items-center"><img src="/nickel-logo.png" alt="Nickel" className="h-7 w-auto" /></a>
            <nav className="flex items-center gap-1 text-sm" style={{ fontFamily: 'var(--font-body)' }}>
              <a href="/provider/login" className="rounded-lg px-3 py-2 text-[color:var(--ink)] hover:bg-[color:var(--mist)]">Provider sign in</a>
              <a href="/book" className="btn-primary !px-4 !py-2 !text-[14px]">Book now</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-8 text-center text-[12px] text-[color:var(--muted)]">
          Nickel 2026
        </footer>
      </body>
    </html>
  )
}

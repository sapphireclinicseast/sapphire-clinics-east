import type { Metadata } from 'next'
import { Montserrat, Manrope } from 'next/font/google'
import './globals.css'

// Montserrat — Display, Headlines, Wordmark, UI Buttons
const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

// Manrope — Body, Long-form, Captions, Data
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Sapphire Clinics East — Patient Portal',
  description: 'Book your appointment online at Sapphire Clinics East',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable} ${manrope.variable}`}>
      <body className="min-h-screen">
        <header className="bg-[color:var(--paper)]/85 backdrop-blur-md border-b border-[color:var(--paper-3)] sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
            <a href="/" className="flex flex-col leading-tight group">
              <span className="text-[color:var(--narra)] font-semibold text-[16px] tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Sapphire Clinics East</span>
              <span className="text-[10.5px] text-[color:var(--mid-gray)] uppercase tracking-[0.16em]" style={{ fontFamily: 'var(--font-display)' }}>Patient Portal</span>
            </a>
            <nav className="flex gap-1 text-sm items-center" style={{ fontFamily: 'var(--font-display)' }}>
              <a href="/book" className="px-3 py-2 rounded-lg text-[color:var(--narra)] hover:text-[color:var(--moss)] hover:bg-[color:var(--paper-2)] transition-colors">Book</a>
              <a href="/bookings" className="px-3 py-2 rounded-lg text-[color:var(--narra)] hover:text-[color:var(--moss)] hover:bg-[color:var(--paper-2)] transition-colors">My Bookings</a>
              <a href="/rewards" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] transition-colors font-semibold">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                <span className="hidden sm:inline">Reward Points</span>
                <span className="sm:hidden">Rewards</span>
              </a>
            </nav>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-5 py-8">{children}</main>
        <footer className="max-w-5xl mx-auto px-5 py-10 text-xs text-[color:var(--mid-gray)] flex items-center justify-between" style={{ fontFamily: 'var(--font-display)' }}>
          <div>© {new Date().getFullYear()} Sapphire Clinics East</div>
          <div className="hidden sm:block">sapphireclinicseast.org</div>
        </footer>
      </body>
    </html>
  )
}

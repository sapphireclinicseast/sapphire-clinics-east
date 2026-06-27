import type { Metadata } from 'next'
import { Montserrat, Manrope } from 'next/font/google'
import './globals.css'
import ContactMenu from '@/components/ContactMenu'

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
  title: 'Aura Health Rehab — Patient Portal',
  description: 'Book your appointment online at Aura Health Rehab',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable} ${manrope.variable}`}>
      <body className="min-h-screen">
        <header className="bg-[color:var(--paper)]/85 backdrop-blur-md border-b border-[color:var(--paper-3)] sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2.5 group shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/aura-mark.png" alt="Aura Health Rehab" width={56} height={28} className="h-7 w-auto" />
              <span className="hidden sm:flex flex-col leading-tight whitespace-nowrap">
                <span className="text-[color:var(--narra)] font-semibold text-[15px] tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Aura Health Rehab</span>
                <span className="text-[10px] text-[color:var(--mid-gray)] uppercase tracking-[0.16em]" style={{ fontFamily: 'var(--font-display)' }}>Patient Portal</span>
              </span>
            </a>
            <nav className="flex gap-0.5 sm:gap-1 text-sm items-center" style={{ fontFamily: 'var(--font-display)' }}>
              <a href="/" className="hidden sm:inline-block px-3 py-2 rounded-lg text-[color:var(--narra)] hover:text-[color:var(--moss)] hover:bg-[color:var(--paper-2)] transition-colors">Home</a>
              <a href="/#get-started" className="px-2.5 sm:px-3 py-2 rounded-lg text-[color:var(--narra)] hover:text-[color:var(--moss)] hover:bg-[color:var(--paper-2)] transition-colors">Sign In</a>
              <ContactMenu />
              <a href="/rewards" className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-[color:var(--clay)] hover:bg-[color:var(--clay-tint)] transition-colors font-semibold">
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
          <div>© {new Date().getFullYear()} Aura Health Rehab · Sapphire Clinics East Inc.</div>
          <div className="hidden sm:block">sapphireclinicseast.org</div>
        </footer>
      </body>
    </html>
  )
}

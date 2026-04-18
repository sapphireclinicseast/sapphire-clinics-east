import type { Metadata } from 'next'
import { Comfortaa, Cormorant_Garamond, DM_Sans } from 'next/font/google'
import './globals.css'

const comfortaa = Comfortaa({
  subsets: ['latin'],
  variable: '--font-comfortaa',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

const cormorant = Cormorant_Garamond({
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
  title: 'Sapphire Clinics East — Patient Portal',
  description: 'Book your appointment online at Sapphire Clinics East',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${comfortaa.variable} ${cormorant.variable} ${dmSans.variable}`}>
      <body className="min-h-screen">
        <header className="bg-white/80 backdrop-blur-md border-b border-[color:var(--light-gray)] sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[color:var(--teal)] to-[color:var(--deep-teal)] flex items-center justify-center text-white text-sm font-bold shadow-md group-hover:shadow-lg transition-shadow" style={{ fontFamily: 'var(--font-display)' }}>
                SC
              </div>
              <div className="leading-tight">
                <div className="text-[color:var(--deep-teal)] font-semibold text-[15px]" style={{ fontFamily: 'var(--font-display)' }}>Sapphire Clinics East</div>
                <div className="text-[11px] text-[color:var(--mid-gray)] uppercase tracking-[0.12em]" style={{ fontFamily: 'var(--font-display)' }}>Patient Portal</div>
              </div>
            </a>
            <nav className="flex gap-1 text-sm" style={{ fontFamily: 'var(--font-display)' }}>
              <a href="/book" className="px-3 py-2 rounded-lg text-[color:var(--charcoal)] hover:text-[color:var(--teal)] hover:bg-[color:var(--pale-teal)] transition-colors">Book</a>
              <a href="/bookings" className="px-3 py-2 rounded-lg text-[color:var(--charcoal)] hover:text-[color:var(--teal)] hover:bg-[color:var(--pale-teal)] transition-colors">My Bookings</a>
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

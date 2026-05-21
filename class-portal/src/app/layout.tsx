import type { Metadata } from 'next'
import { Montserrat, Manrope } from 'next/font/google'
import './globals.css'
import HeaderNav from '@/components/HeaderNav'

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
  title: 'Aura Academy for Learning — Class Portal',
  description: 'Enroll your child at Aura Academy for Learning (Kindergarten – Grade 10, DepEd-accredited)',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable} ${manrope.variable}`}>
      <body className="min-h-screen">
        <header className="bg-[color:var(--paper)]/85 backdrop-blur-md border-b border-[color:var(--paper-3)] sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between gap-2 flex-wrap">
            <a href="/" className="flex items-center gap-2 sm:gap-2.5 leading-tight group min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/aura-academy-logo.png"
                alt="Aura Academy for Learning"
                className="h-8 sm:h-10 w-auto object-contain shrink-0"
              />
              <div className="flex flex-col min-w-0">
                <span className="text-[color:var(--narra)] font-semibold text-[13px] sm:text-[16px] tracking-tight truncate" style={{ fontFamily: 'var(--font-display)' }}>Aura Academy for Learning</span>
                <span className="text-[9.5px] sm:text-[10.5px] text-[color:var(--mid-gray)] uppercase tracking-[0.12em] sm:tracking-[0.16em]" style={{ fontFamily: 'var(--font-display)' }}>Class Portal</span>
              </div>
            </a>
            <HeaderNav />
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-3 sm:px-5 py-6 sm:py-8">{children}</main>
        <footer className="max-w-5xl mx-auto px-3 sm:px-5 py-8 sm:py-10 text-[11px] sm:text-xs text-[color:var(--mid-gray)] flex items-center justify-between gap-3 flex-wrap" style={{ fontFamily: 'var(--font-display)' }}>
          <div>© {new Date().getFullYear()} Aura Academy for Learning · Sapphire Clinics East, Inc.</div>
          <div className="hidden sm:block">class.sapphireclinicseast.org</div>
        </footer>
      </body>
    </html>
  )
}

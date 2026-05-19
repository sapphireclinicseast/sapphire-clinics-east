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
  title: 'Sapphire Clinics East — Class Portal',
  description: 'Enroll your child at Sapphire Clinics East (Kindergarten – Grade 10, DepEd-accredited)',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable} ${manrope.variable}`}>
      <body className="min-h-screen">
        <header className="bg-[color:var(--paper)]/85 backdrop-blur-md border-b border-[color:var(--paper-3)] sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
            <a href="/" className="flex flex-col leading-tight group">
              <span className="text-[color:var(--narra)] font-semibold text-[16px] tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>Sapphire Clinics East</span>
              <span className="text-[10.5px] text-[color:var(--mid-gray)] uppercase tracking-[0.16em]" style={{ fontFamily: 'var(--font-display)' }}>Class Portal</span>
            </a>
            <HeaderNav />
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-5 py-8">{children}</main>
        <footer className="max-w-5xl mx-auto px-5 py-10 text-xs text-[color:var(--mid-gray)] flex items-center justify-between" style={{ fontFamily: 'var(--font-display)' }}>
          <div>© {new Date().getFullYear()} Sapphire Clinics East</div>
          <div className="hidden sm:block">class.sapphireclinicseast.org</div>
        </footer>
      </body>
    </html>
  )
}

import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, Baloo_2 } from 'next/font/google'
import { getSessionPatientId } from '@/lib/auth'
import MessagesWidget from '@/components/MessagesWidget'
import PwaSetup from '@/components/PwaSetup'
import './globals.css'

const body = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' })
const display = Baloo_2({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-display', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Nickel', template: '%s · Nickel' },
  description: 'Book a home therapy session with a licensed therapist near you. By Sapphire Clinics East, developed by Jara Universal OPC.',
  applicationName: 'Nickel',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Nickel' },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    apple: [{ url: '/icons/icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = { themeColor: '#34618c' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const isPatient = !!(await getSessionPatientId())
  return (
    <html lang="en" className={`${body.variable} ${display.variable}`}>
      <body style={{ fontFamily: 'var(--font-body)' }}>
        <header className="sticky top-0 z-40 border-b border-[color:var(--line)] bg-white/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <a href="/" className="flex items-center"><img src="/nickel-logo.png" alt="Nickel" className="h-7 w-auto" /></a>
            <nav className="flex items-center gap-1 text-sm" style={{ fontFamily: 'var(--font-body)' }}>
              {isPatient
                ? <>
                    <a href="/requests" className="hidden rounded-lg px-3 py-2 text-[color:var(--ink)] hover:bg-[color:var(--mist)] sm:inline-block">Requests</a>
                    <a href="/bookings" className="rounded-lg px-3 py-2 text-[color:var(--ink)] hover:bg-[color:var(--mist)]">My bookings</a>
                  </>
                : <a href="/provider/login" className="rounded-lg px-3 py-2 text-[color:var(--ink)] hover:bg-[color:var(--mist)]">Provider sign in</a>}
              <a href="/book" className="btn-primary !px-4 !py-2 !text-[14px]">Book now</a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-8 text-center text-[12px] text-[color:var(--muted)]">
          <div className="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <a href="/provider/login" className="hover:text-[color:var(--steel)] hover:underline">Provider sign in</a>
            <a href="/doctor/login" className="hover:text-[color:var(--steel)] hover:underline">Rehab doctor sign in</a>
            <a href="/clinic/login" className="hover:text-[color:var(--steel)] hover:underline">Clinic partner</a>
            <a href="/consult" className="hover:text-[color:var(--steel)] hover:underline">Get a referral</a>
            <a href="/privacy" className="hover:text-[color:var(--steel)] hover:underline">Privacy</a>
          </div>
          Nickel 2026
        </footer>
        <MessagesWidget />
        <PwaSetup />
      </body>
    </html>
  )
}

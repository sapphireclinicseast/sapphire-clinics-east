import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { getSessionPatientId } from '@/lib/auth'
import MessagesWidget from '@/components/MessagesWidget'
import PwaSetup from '@/components/PwaSetup'
import './globals.css'

// Self-hosted Google Fonts (byte-identical to the variable woff2
// next/font/google used to download at build time) so builds no longer
// depend on fonts.googleapis.com.
// next/font/local cannot express unicode-range, so each family is two faces:
// latin (preloaded) and latin-ext (₱ and other extended glyphs, fetched on
// demand), composed into one font stack in the same fallback order.
// Plus Jakarta Sans keeps its full variable weight axis (200–800), matching
// the previous weightless Plus_Jakarta_Sans() config.
const bodyLatin = localFont({
  src: '../fonts/plus-jakarta-sans-latin.woff2',
  weight: '200 800',
  display: 'swap',
})
const bodyLatinExt = localFont({
  src: '../fonts/plus-jakarta-sans-latin-ext.woff2',
  weight: '200 800',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
})
const displayLatin = localFont({
  src: '../fonts/baloo2-latin.woff2',
  weight: '500 800',
  display: 'swap',
})
const displayLatinExt = localFont({
  src: '../fonts/baloo2-latin-ext.woff2',
  weight: '500 800',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
})

const stack = (latin: { style: { fontFamily: string } }, ext: { style: { fontFamily: string } }) => {
  const [family, ...fallbacks] = latin.style.fontFamily.split(', ')
  return [family, ext.style.fontFamily, ...fallbacks].join(', ')
}
const fontVars = {
  '--font-body': stack(bodyLatin, bodyLatinExt),
  '--font-display': stack(displayLatin, displayLatinExt),
} as React.CSSProperties

export const metadata: Metadata = {
  title: { default: 'Nickel', template: '%s · Nickel' },
  description: 'Book a home therapy session with a licensed therapist near you. Operated by Jara Universal OPC, in partnership with Sapphire Clinics East, Inc.',
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
    <html lang="en" style={fontVars}>
      <body style={{ fontFamily: 'var(--font-body)' }}>
        {/* Capture the install prompt as early as possible so the Install button
            can offer it even if the event fired before React hydrated. Also flag
            when we're running as an installed app (standalone) — before paint — so
            the home page can show a plain sign-in view instead of the marketing page. */}
        <script dangerouslySetInnerHTML={{ __html: "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__nickelInstallPrompt=e;});try{var appParam=new URLSearchParams(location.search).get('app')==='1';if(window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone||appParam){document.documentElement.setAttribute('data-standalone','1');}}catch(e){}" }} />
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
        <footer className="nk-web-only mx-auto max-w-5xl px-4 py-8 text-center text-[12px] text-[color:var(--muted)]">
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

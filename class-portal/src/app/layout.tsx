import type { Metadata } from 'next'
import { Montserrat, Manrope } from 'next/font/google'
import './globals.css'
import HeaderNav from '@/components/HeaderNav'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import AuthSidebar from '@/components/AuthSidebar'

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

const SITE_URL = 'https://class.sapphireclinicseast.org'
const SITE_NAME = 'Aura Academy for Learning'
const SITE_TAGLINE = 'DepEd-accredited grade school and senior high — Nursery through Grade 12 — in partnership with Light Bearer Christian Academy.'

export const metadata: Metadata = {
  // metadataBase lets Next resolve relative URLs (e.g. /hero-family.png)
  // into absolute ones in Open Graph + Twitter card tags, which is what
  // crawlers and social previews require.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — DepEd-accredited Nursery to Grade 12`,
    template: `%s · ${SITE_NAME}`,
  },
  description: `Enroll your child at ${SITE_NAME}. Small, attentive classes from Nursery through Grade 12, with DepEd-recognised report cards and Learner Reference Numbers. ${SITE_TAGLINE}`,
  applicationName: SITE_NAME,
  authors: [{ name: 'Sapphire Clinics East, Inc.' }],
  generator: 'Next.js',
  keywords: [
    'Aura Academy for Learning',
    'Sapphire Clinics East',
    'DepEd accredited school',
    'small private school Philippines',
    'Nursery school',
    'Kindergarten',
    'Grade school',
    'Senior High School',
    'Las Piñas school',
    'Light Bearer Christian Academy',
    'Learner Reference Number',
    'LRN',
    'SPED inclusive school',
  ],
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    type: 'website',
    locale: 'en_PH',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — DepEd-accredited Nursery to Grade 12`,
    description: SITE_TAGLINE,
    images: [
      {
        url: '/hero-family.png',
        width: 2816,
        height: 1536,
        alt: 'Aura Academy for Learning — a family-feel school setting',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — DepEd-accredited Nursery to Grade 12`,
    description: SITE_TAGLINE,
    images: ['/hero-family.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  // Square arch crops of the brand mark. The old aura-academy-mark.png
  // was 394×200 (wordmark dimensions) and got squeezed by browsers
  // into the 16×16 favicon slot, which stretched the arch into a
  // squashed oval. These files are pre-cropped to a square so the arch
  // renders at the correct aspect ratio at every size. Next.js also
  // auto-discovers src/app/icon.png and src/app/apple-icon.png so the
  // entries here are a belt-and-suspenders for crawlers and older
  // browsers that prefer explicit sizes.
  icons: {
    icon: [
      { url: '/aura-academy-mark-32.png',  sizes: '32x32',   type: 'image/png' },
      { url: '/aura-academy-mark-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/aura-academy-mark-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/aura-academy-mark-192.png',
  },
  category: 'education',
}

/**
 * EducationalOrganization JSON-LD. Google uses this to power rich
 * results (knowledge panel, breadcrumb, sitelinks) for school
 * queries. Keep it in sync with the marketing copy in /about so the
 * structured data and the rendered page agree.
 */
const ORG_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'EducationalOrganization',
  name: SITE_NAME,
  alternateName: 'Aura Academy',
  url: SITE_URL,
  logo: `${SITE_URL}/aura-academy-mark-512.png`,
  image: `${SITE_URL}/hero-family.png`,
  description: SITE_TAGLINE,
  inLanguage: 'en',
  parentOrganization: {
    '@type': 'Organization',
    name: 'Sapphire Clinics East, Inc.',
    url: 'https://sapphireclinicseast.org',
  },
  // Grade levels served — helps queries like "schools that offer
  // Nursery to Grade 12".
  educationalLevel: [
    'Nursery', 'Kindergarten',
    'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
    'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12',
  ],
  address: {
    '@type': 'PostalAddress',
    addressCountry: 'PH',
    addressRegion: 'Metro Manila',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable} ${manrope.variable}`}>
      <body className="min-h-screen">
        {/* JSON-LD school schema. Inline so it ships in the initial HTML
            and crawlers see it without executing JS. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }}
        />
        <ImpersonationBanner />
        {/* Persistent left sidebar for authenticated views. Renders
            null (and does nothing to <body>) when the visitor isn't
            signed in, so marketing pages keep their original layout. */}
        <AuthSidebar />
        <header className="bg-[color:var(--paper)]/85 backdrop-blur-md border-b border-[color:var(--paper-3)] sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-3 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between gap-2 flex-wrap">
            <a href="/" className="flex items-center gap-2 sm:gap-2.5 leading-tight group min-w-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/aura-academy-mark.png"
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

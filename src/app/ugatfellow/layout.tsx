import type { Metadata } from 'next'
import { Montserrat, Arimo } from 'next/font/google'

const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-ugat-montserrat',
  weight: ['400', '500', '600', '700', '800', '900'],
  display: 'swap',
})

const arimo = Arimo({
  subsets: ['latin'],
  variable: '--font-ugat-arimo',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'UGAT Fellowship Program — Scholar Hub',
  description:
    'The UGAT Fellowship Program by the Aura Foundation provides a monthly stipend to Allied Health Professionals in their final year of university.',
  robots: { index: false, follow: false },
}

export default function UgatLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${montserrat.variable} ${arimo.variable}`}>{children}</div>
}

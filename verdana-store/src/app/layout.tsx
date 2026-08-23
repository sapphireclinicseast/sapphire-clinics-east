import type { Metadata } from 'next'
import './globals.css'
import { CartProvider } from '@/contexts/cart-context'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { MetaPixel } from '@/components/analytics/MetaPixel'

export const metadata: Metadata = {
  title: { default: 'Verdana Rehab Solutions', template: '%s | Verdana Rehab Solutions' },
  description: 'Progress, Made Possible. Curated rehab products for children by board-certified therapists.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MetaPixel />
        <CartProvider>
          <Header />
          <main className="min-h-screen">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  )
}

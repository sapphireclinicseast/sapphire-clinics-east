import type { Metadata } from 'next'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'SAPPHIRE Schedule Hub — Sapphire Clinics East',
  openGraph: {
    title: 'SAPPHIRE Schedule Hub',
    siteName: 'SAPPHIRE Schedule Hub',
  },
}

export default function SchedulesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif', overflowX: 'hidden' }}>
      {/* Responsive padding for mobile */}
      <style>{`
        .sched-header-inner { padding: 12px 24px; }
        .sched-main { padding: 24px 24px; }
        @media (max-width: 640px) {
          .sched-header-inner { padding: 10px 14px; }
          .sched-main { padding: 16px 10px !important; }
        }
      `}</style>

      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '3px solid #244952', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}>
        <div className="sched-header-inner" style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <Image
            src="/aura-health-logo.png"
            alt="Aura Health Rehab"
            width={180}
            height={101}
            style={{ height: '56px', width: 'auto', objectFit: 'contain' }}
            priority
            unoptimized
          />
        </div>
      </header>

      {/* Page content */}
      <main className="sched-main" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {children}
      </main>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #f0f0f0', marginTop: '48px', padding: '18px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
          © Sapphire Clinics East, Inc. — Internal use only.
        </p>
      </footer>
    </div>
  )
}

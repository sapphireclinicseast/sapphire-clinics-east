import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SAPPHIRE Schedule Hub — Sapphire Clinics East',
  openGraph: {
    title: 'SAPPHIRE Schedule Hub',
    siteName: 'SAPPHIRE Schedule Hub',
  },
}

export default function SchedulesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F5F0E8',
      fontFamily: 'var(--font-manrope), system-ui, -apple-system, sans-serif',
      color: '#1A1A1A',
      overflowX: 'hidden',
    }}>
      <style>{`
        .sched-main { padding: 28px 24px; }
        @media (max-width: 640px) {
          .sched-main { padding: 18px 10px !important; }
        }
        .sched-display {
          font-family: var(--font-montserrat), system-ui, -apple-system, sans-serif;
          letter-spacing: -0.01em;
        }
      `}</style>

      {/* Page content */}
      <main className="sched-main" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {children}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid #C8D6CF',
        marginTop: '56px',
        padding: '20px 24px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: '12px', color: '#1A1A1A', opacity: 0.55, margin: 0, letterSpacing: '0.01em' }}>
          © Sapphire Clinics East, Inc. — Internal use only.
        </p>
      </footer>
    </div>
  )
}

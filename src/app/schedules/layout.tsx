import Image from 'next/image'

export default function SchedulesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F4ECDD',
      fontFamily: 'var(--font-manrope), system-ui, -apple-system, sans-serif',
      color: '#1A1A1A',
      overflowX: 'hidden',
    }}>
      {/* Responsive padding for mobile */}
      <style>{`
        .sched-header-inner { padding: 14px 24px; }
        .sched-main { padding: 28px 24px; }
        @media (max-width: 640px) {
          .sched-header-inner { padding: 12px 14px; }
          .sched-main { padding: 18px 10px !important; }
        }
        .sched-display {
          font-family: var(--font-montserrat), system-ui, -apple-system, sans-serif;
          letter-spacing: -0.01em;
        }
      `}</style>

      {/* Header */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid #C8D6CF',
        boxShadow: '0 1px 0 rgba(25,72,80,0.04)',
      }}>
        <div className="sched-header-inner" style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <Image
            src="/sandbox-clinic-logo.png"
            alt="Sapphire Clinics East"
            width={180}
            height={48}
            style={{ height: '44px', width: 'auto', objectFit: 'contain' }}
            priority
          />
        </div>
      </header>

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

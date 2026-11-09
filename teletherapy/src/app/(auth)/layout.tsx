import { C } from './sign-in-look'

// Shared SCEI staff sign-in shell (matches the Operations Hub sign-in, PR #999):
// Aura gradient backdrop, white card with the three full-colour brand marks
// and the hub name. Login, forgot-password and reset-password render inside.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{
        // Aura backdrop — coral top-left → cream halo → soft sage bottom-right
        background: [
          'radial-gradient(1200px 380px at 50% 35%, rgba(244, 236, 221, 0.22), transparent 60%)',
          'radial-gradient(820px 380px at 8% 0%, rgba(212, 145, 132, 0.55), transparent 60%)',
          'radial-gradient(1100px 440px at 100% 110%, rgba(123, 152, 138, 0.55), transparent 65%)',
          'linear-gradient(135deg, #D49184 0%, #C9A28F 38%, #9CB1A2 72%, #7B988A 100%)',
        ].join(', '),
      }}
    >
      {/* Sand-outlined orbital rings — echoing the Aura creative */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: -260, right: -180, width: 560, height: 560,
          border: '1px solid rgba(244, 236, 221, 0.28)',
          borderRadius: '50%',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          top: -200, right: -300, width: 760, height: 760,
          border: '1px solid rgba(244, 236, 221, 0.18)',
          borderRadius: '50%',
        }}
      />

      <div className="relative z-10 w-full max-w-[420px] mx-4 my-10">
        <div
          className="rounded-2xl px-6 py-8 sm:px-9 sm:py-9 bg-white"
          style={{ boxShadow: '0 30px 70px -24px rgba(36,73,82,0.45), 0 2px 6px rgba(36,73,82,0.08)' }}
        >
          {/* Brand header — identical on every staff hub */}
          <div className="flex flex-col items-center text-center mb-7">
            <div className="flex items-center justify-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- plain <img>: this page is also served through the marketing-site /stafflogin proxy */}
              <img src="/brand/login-scei.png" alt="Sapphire Clinics East" width={41} height={50} style={{ height: 50, width: 'auto' }} />
              <span aria-hidden style={{ width: 1, height: 36, background: C.line }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/login-aura.png" alt="Aura Health Rehab" width={58} height={50} style={{ height: 50, width: 'auto' }} />
              <span aria-hidden style={{ width: 1, height: 36, background: C.line }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/login-verdana.png" alt="Verdana Rehab Solutions" width={48} height={50} style={{ height: 50, width: 'auto' }} />
            </div>
            <h1 className="mt-5" style={{ fontFamily: 'var(--font-display)', fontSize: '1.375rem', fontWeight: 700, color: C.narra, letterSpacing: '-0.01em' }}>
              Staff Portal
            </h1>
            <p className="mt-0.5 text-[13px]" style={{ color: C.muted }}>Sapphire Clinics East, Inc.</p>
          </div>

          {children}
        </div>

        <div className="text-center mt-6 text-xs space-y-1" style={{ color: 'rgba(255,255,255,0.85)' }}>
          <p>Internal access only · Sapphire Clinics East staff</p>
          <p>Contact your administrator if you need an account.</p>
        </div>
      </div>
    </div>
  )
}
